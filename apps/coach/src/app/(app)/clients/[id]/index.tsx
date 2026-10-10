import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { AppStatusPill } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { ClientForm } from '@/components/client-form';
import { ClientHabits } from '@/components/client-habits';
import { ClientNutrition } from '@/components/client-nutrition';
import { ClientOverview, type OverviewTab } from '@/components/client-overview';
import { ClientPlan } from '@/components/client-plan';
import { ClientProgress } from '@/components/client-progress';
import { ClientTrainingLog } from '@/components/client-training-log';
import { HeaderTextButton } from '@/components/header-button';
import { InviteSheet, openOutside } from '@/components/invite-sheet';
import { PriceSheet } from '@/components/price-sheet';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Segmented,
  Shortcuts,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Text,
} from '@/components/ui';
import { Colors, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import {
  appStatusOf,
  CLIENT_COLUMNS,
  clientWithEmail,
  fullName,
  shownStatusOf,
  STATUS_LABELS,
  type Client,
  type ClientStatus,
} from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useLeaveGuard } from '@/lib/leave-guard';
import { formatMoney, priceFor } from '@/lib/money';
import { useGoBack } from '@/lib/nav';
import { loadOverview, type ClientOverview as OverviewRow } from '@/lib/overview';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { saveError } from '@/lib/save-error';
import { dayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { waChat, waNumber } from '@/lib/whatsapp';

// The page's tabs. Workouts and nutrition share "Plan" (what the trainer sets); "Progress" is what the
// client logs. Three short words fit one row at any text size.
const TABS: Record<OverviewTab, string> = { overview: 'Overview', plan: 'Plan', progress: 'Progress' };

function tabOf(value: string | undefined): OverviewTab {
  return value === 'plan' || value === 'progress' ? value : 'overview';
}

export default function ClientDetail() {
  const goBack = useGoBack();
  const toast = useToast();
  const params = useLocalSearchParams<{
    id: string;
    tab?: string;
    invite?: string;
    sheet?: string;
    checkIn?: string;
  }>();
  const id = params.id;
  const { session, profile } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [row, setRow] = useState<OverviewRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const tab = tabOf(params.tab);
  // Each tab mounts the first time it shows and then stays, hidden, so drafts and loads survive.
  const [mounted, setMounted] = useState<OverviewTab[]>([tab]);
  if (!mounted.includes(tab)) setMounted([...mounted, tab]);
  const [focusCheckIn, setFocusCheckIn] = useState(params.checkIn);
  // The details form (behind Edit), the More menu, the price sheet and the invite.
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [pricing, setPricing] = useState(params.sheet === 'price');
  const [inviting, setInviting] = useState<'added' | 'invite' | null>(params.invite === '1' ? 'added' : null);
  // What the More menu does once it has slid away: an iPhone shows one sheet or alert at a time.
  const afterMore = useRef<(() => void) | null>(null);
  const loaded = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const scrolled = useRef(0);
  const tabsY = useRef(0);
  const [nutritionUnsaved, setNutritionUnsaved] = useState(false);
  const [replyUnsaved, setReplyUnsaved] = useState(false);
  // Two columns on a wide window: the person on the left, the chosen tab on the right.
  const wide = useWindowDimensions().width >= Layout.wide;

  const first = client?.first_name ?? 'this client';
  useLeaveGuard(
    nutritionUnsaved || replyUnsaved,
    nutritionUnsaved && replyUnsaved
      ? `Your nutrition plan changes and your reply to ${first} aren’t saved.`
      : nutritionUnsaved
        ? `Your changes to ${first}’s nutrition plan aren’t saved.`
        : `Your reply to ${first}’s check-in isn’t sent.`,
  );

  // Loaded each time the page shows or the app comes back, so it notices the client accepting the
  // invite (Message and Call appear) while the page stays open.
  const load = useCallback(() => {
    setReloads((n) => n + 1);
    supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) {
          loaded.current = true;
          setClient(data as Client);
        } else if (!loaded.current) {
          setError(error ? plainError(error) : 'This client could not be found.');
        }
        // A failed reload keeps the page as it was.
      });
    loadOverview(dayKey(new Date()), id).then(
      (rows) => {
        if (rows?.[0]) setRow(rows[0]);
      },
      () => {},
    );
  }, [id]);

  useFocusEffect(load);
  useRefreshOnReturn(load);
  // News about this client reloads the page a second after the last of a burst.
  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(load, 1000);
    return () => clearTimeout(timer);
  }, [news, load]);
  useChatEvents((event) => {
    if (
      ((event.type === 'link' || event.type === 'progress') && event.client_id === id) ||
      event.type === 'reconnected'
    )
      setNews((n) => n + 1);
  });

  function show(next: OverviewTab, checkIn?: string) {
    if (checkIn) setFocusCheckIn(checkIn);
    if (next !== tab) router.setParams({ tab: next, checkIn: checkIn ?? undefined });
    // A new tab never opens half-way down: the control comes back to the top.
    if (scrolled.current > tabsY.current)
      scroll.current?.scrollTo({ y: tabsY.current, animated: tabsY.current < 2000 });
  }

  async function setStatus(status: ClientStatus) {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) return setError(plainError(error));
    haptic.success();
    if (status === 'archived') goBack('/clients');
    else {
      const restored = client?.status === 'archived';
      setClient((c) => (c ? { ...c, status } : c));
      toast(
        status === 'paused'
          ? 'Client paused'
          : restored
            ? `${client?.first_name ?? 'Client'} is back`
            : 'Marked as active',
      );
    }
  }

  async function archive() {
    if (await confirm('Archive client?', 'They will be hidden from your client list.', 'Archive')) {
      await setStatus('archived');
    }
  }

  function fromMore(action: () => void) {
    setMore(false);
    // Android has no "sheet has gone" signal, and shows the next one over it fine.
    if (Platform.OS === 'android') action();
    else afterMore.current = action;
  }

  function closeInvite() {
    setInviting(null);
    if (params.invite) router.setParams({ invite: undefined });
  }

  if (error && !client) {
    return (
      <EmptyState
        icon="person-outline"
        title="Client not found"
        message={error}
        action={<Button title="Back to clients" variant="secondary" onPress={() => goBack('/clients')} />}
      />
    );
  }
  if (!client) return <ClientSkeleton />;

  const name = fullName(client);
  // The database's status decides what an invite message says; the page shows a shared invite as sent.
  const status = appStatusOf(client);
  const shown = shownStatusOf(client);
  const archived = client.status === 'archived';
  // Message and Call need the client in Voltrix, linked to this trainer.
  const linked = !!client.user_id && client.user_id !== session?.user.id;
  // What the client logs in Voltrix, only while they have accepted this trainer.
  const sharing = status === 'joined' && !!client.user_id && client.status !== 'archived';
  const country = profile?.country ?? 'ZA';
  const currency = profile?.currency ?? 'ZAR';
  const usual = profile?.session_price_cents ?? null;
  const number = waNumber(client.phone, country);
  const price = priceFor(client.session_price_cents, usual);
  const canInvite = !linked && status !== 'gone' && !archived;
  const invite = () => setInviting('invite');
  const book = () => router.push({ pathname: '/sessions/new', params: { clientId: client.id } });
  const actions: ComponentProps<typeof Shortcuts>['items'] = [
    ...(linked
      ? [
          {
            icon: 'chatbubble-outline' as const,
            label: 'Message',
            accessibilityLabel: `Message ${name}`,
            onPress: () => router.push({ pathname: '/chat/[id]', params: { id: client.id, name } }),
          },
          {
            icon: 'call-outline' as const,
            label: 'Call',
            accessibilityLabel: `Call ${name}`,
            onPress: () => router.push({ pathname: '/call', params: { chat: client.id, video: '0', name } }),
          },
        ]
      : []),
    ...(client.status === 'active'
      ? [
          {
            icon: 'calendar-clear-outline' as const,
            label: 'Book',
            accessibilityLabel: `Book a session with ${name}`,
            onPress: book,
          },
        ]
      : []),
    ...(linked && number
      ? [
          {
            icon: 'logo-whatsapp' as const,
            label: 'WhatsApp',
            accessibilityLabel: `WhatsApp ${name}`,
            onPress: () => openOutside(waChat(number)),
          },
        ]
      : canInvite
        ? [
            {
              icon: 'logo-whatsapp' as const,
              label: 'Invite',
              accessibilityLabel: `Invite ${name} on WhatsApp`,
              onPress: invite,
            },
          ]
        : []),
  ];
  const hiddenUnless = (v: OverviewTab) => (tab === v ? null : styles.hidden);
  const counts = row
    ? `${row.sessions_done} done · ${row.no_shows} ${row.no_shows === 1 ? 'no-show' : 'no-shows'}`
    : '';

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerTitle: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderTextButton
                title="Edit"
                accessibilityLabel={`Edit ${name}`}
                onPress={() => setEditing(true)}
                testID="client-edit"
              />
              <IconButton
                icon="ellipsis-horizontal"
                label={`More for ${name}`}
                onPress={() => setMore(true)}
                style={styles.headerMore}
                testID="client-more"
              />
            </View>
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, wide && styles.columns]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        onScroll={(e) => {
          scrolled.current = e.nativeEvent.contentOffset.y;
        }}>
        <View style={[styles.sections, wide && styles.side]}>
          <View style={styles.profile}>
            <Avatar name={name} size={96} />
            <View style={styles.names}>
              <Text variant="largeTitle" numberOfLines={2} style={styles.center} accessibilityRole="header">
                {name}
              </Text>
              {client.goal ? (
                <Text variant="callout" tone="secondary" numberOfLines={2} style={styles.center}>
                  {client.goal}
                </Text>
              ) : null}
            </View>
            <View style={styles.pills}>
              <AppStatusPill status={shown} />
              {client.status !== 'active' ? (
                <StatusPill
                  tone={client.status === 'paused' ? 'warning' : 'muted'}
                  label={STATUS_LABELS[client.status]}
                />
              ) : null}
            </View>
            {actions.length ? (
              <View style={{ width: actions.length * 88, maxWidth: '100%' }}>
                <Shortcuts items={actions} />
              </View>
            ) : null}
          </View>
          <ErrorText>{error}</ErrorText>
        </View>

        <View
          style={[styles.sections, wide && styles.main]}
          onLayout={(e) => {
            // The tabs are the first thing in this column.
            tabsY.current = e.nativeEvent.layout.y;
          }}>
          <Segmented
            options={(Object.keys(TABS) as OverviewTab[]).map((value) => ({ value, label: TABS[value] }))}
            value={tab}
            onChange={(next) => show(next)}
            testID="client-tabs"
          />

          {mounted.includes('overview') ? (
            <View style={hiddenUnless('overview')}>
              <ClientOverview
                client={client}
                row={row}
                status={shown}
                linked={linked}
                usual={usual}
                currency={currency}
                country={country}
                reloads={reloads}
                onInvite={invite}
                onPrice={() => setPricing(true)}
                onRestore={() => setStatus('active')}
                onTab={show}
                onEdit={() => setEditing(true)}
                onChanged={load}
              />
            </View>
          ) : null}

          {mounted.includes('plan') ? (
            <View style={[styles.sections, hiddenUnless('plan')]}>
              <ClientPlan client={client} linked={linked} onInvite={canInvite ? invite : undefined} />
              <ClientNutrition client={client} onUnsavedChange={setNutritionUnsaved} />
            </View>
          ) : null}

          {mounted.includes('progress') ? (
            <View style={[styles.sections, hiddenUnless('progress')]}>
              {sharing ? (
                <>
                  <ClientTrainingLog client={client} />
                  <ClientProgress client={client} onUnsavedChange={setReplyUnsaved} focusCheckIn={focusCheckIn} />
                  <ClientHabits client={client} />
                </>
              ) : (
                <EmptyState
                  icon="trending-up-outline"
                  title={`Progress shows once ${client.first_name} joins`}
                  message="Their workouts, weight, photos and check-ins appear here after they accept your invite."
                  action={
                    canInvite ? (
                      <Button title="Invite on WhatsApp" variant="secondary" icon="logo-whatsapp" onPress={invite} />
                    ) : undefined
                  }
                />
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={`Edit ${client.first_name}`}>
        <ClientForm
          key={editing ? 'open' : 'closed'}
          inSheet
          initial={client}
          linked={linked}
          submitLabel="Save changes"
          titles={['Details', 'Contact and goal']}
          onSubmit={async (input) => {
            const same =
              input.email?.toLowerCase() !== client.email?.trim().toLowerCase()
                ? await clientWithEmail(input.email, id)
                : null;
            if (
              same &&
              !(await confirm(
                `You already have ${fullName(same)}`,
                `${fullName(same)} has the email ${same.email} too. If this is the same person, there's no need to add them twice. Save anyway?`,
                'Save anyway',
              ))
            ) {
              return null;
            }
            const { error } = await supabase.from('clients').update(input).eq('id', id);
            if (error) return saveError(error);
            setClient((c) => (c ? { ...c, ...input } : c));
            setEditing(false);
            haptic.success();
            toast('Saved');
            // A new email can mean a new invite: the status catches up.
            load();
            return null;
          }}
        />
      </Sheet>

      <Sheet
        visible={more}
        onClose={() => setMore(false)}
        onClosed={() => {
          const action = afterMore.current;
          afterMore.current = null;
          action?.();
        }}
        title={name}>
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title="Session price"
            subtitle={
              price.cents == null
                ? 'Not set'
                : `${price.cents === 0 ? 'Free' : formatMoney(price.cents, currency)} · ${price.own ? `${client.first_name}’s own price` : 'your usual price'}`
            }
            leading={<IconTile icon="cash-outline" />}
            onPress={() => fromMore(() => setPricing(true))}
          />
          <ListRow
            title="Sessions and no-shows"
            subtitle={counts || undefined}
            leading={<IconTile icon="calendar-outline" />}
            onPress={() => {
              setMore(false);
              router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id } });
            }}
          />
          {client.status === 'active' ? (
            <ListRow
              title="Pause client"
              subtitle="Off the active list; nothing is deleted"
              leading={<IconTile icon="pause-outline" />}
              chevron={false}
              compact
              onPress={() => fromMore(() => setStatus('paused'))}
            />
          ) : archived ? (
            <ListRow
              title="Restore client"
              subtitle="Back on your client list"
              leading={<IconTile icon="arrow-undo-outline" />}
              chevron={false}
              compact
              last
              onPress={() => fromMore(() => setStatus('active'))}
            />
          ) : (
            <ListRow
              title="Mark as active"
              leading={<IconTile icon="play-outline" />}
              chevron={false}
              compact
              onPress={() => fromMore(() => setStatus('active'))}
            />
          )}
          {archived ? null : (
            <ListRow
              title="Archive client"
              titleTone="danger"
              leading={<IconTile icon="archive-outline" color={Colors.danger} />}
              chevron={false}
              compact
              last
              onPress={() => fromMore(archive)}
            />
          )}
        </Group>
      </Sheet>

      <PriceSheet
        client={client}
        visible={pricing}
        onClose={() => {
          setPricing(false);
          if (params.sheet) router.setParams({ sheet: undefined });
        }}
        onSaved={(cents) => {
          setClient((c) => (c ? { ...c, session_price_cents: cents } : c));
          load();
        }}
      />

      <InviteSheet
        client={
          inviting && canInvite
            ? {
                id: client.id,
                first_name: client.first_name,
                email: client.email,
                phone: client.phone,
                app_status: status,
              }
            : null
        }
        added={inviting === 'added'}
        onClose={closeInvite}
        onShared={load}
        onConnected={load}
      />
    </>
  );
}

// The page's shape while it loads: the photo, the name, the tabs and a few rows.
function ClientSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading client" accessibilityRole="progressbar">
      <View style={styles.profile}>
        <Skeleton width={96} height={96} radius={48} />
        <Skeleton width={200} height={28} />
        <Skeleton width={120} height={22} radius={11} />
      </View>
      <Skeleton height={36} radius={Radius.medium} />
      <Group>
        <SkeletonRows count={3} />
      </Group>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  // Wide window: the person (340) beside the chosen tab.
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  side: {
    width: 340,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  sections: {
    gap: Spacing.section,
  },
  hidden: {
    display: 'none',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The web header has no right inset of its own; the phones' headers do.
  headerMore: {
    marginRight: Platform.OS === 'web' ? Spacing.tight : 0,
  },
  profile: {
    alignItems: 'center',
    gap: Spacing.tight,
    paddingTop: Spacing.two,
  },
  names: {
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  center: {
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  skeleton: {
    gap: Spacing.section,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
  },
}));
