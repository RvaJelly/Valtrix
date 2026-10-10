import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { AppStatusPill } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { ClientForm } from '@/components/client-form';
import { ClientHabits } from '@/components/client-habits';
import { ClientNutrition } from '@/components/client-nutrition';
import { ClientProgress } from '@/components/client-progress';
import { ClientTrainingLog } from '@/components/client-training-log';
import { ClientWorkoutPlan } from '@/components/client-workout-plan';
import { HeaderTextButton } from '@/components/header-button';
import { SessionRow } from '@/components/session-row';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  Section,
  Segmented,
  Shortcuts,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Text,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import {
  appStatusOf,
  CLIENT_COLUMNS,
  clientWithEmail,
  fullName,
  inviteAgain,
  STATUS_LABELS,
  type AppStatus,
  type Client,
  type ClientStatus,
} from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { saveError } from '@/lib/save-error';
import { SESSION_COLUMNS, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

// The page's views. Workouts and nutrition share "Plan" (what the trainer sets); "Progress" is what the
// client logs, there only while they share it. Three short words fit one row at any text size.
type View3 = 'overview' | 'plan' | 'progress';
const VIEWS: Record<View3, string> = { overview: 'Overview', plan: 'Plan', progress: 'Progress' };

export default function ClientDetail() {
  const goBack = useGoBack();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Session[] | null>(null);
  const [view, setView] = useState<View3>('overview');
  // The details form (behind Edit) and the More menu (Pause, Archive).
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  // What the More menu does once it has slid away: an iPhone shows one sheet or alert at a time.
  const afterMore = useRef<(() => void) | null>(null);
  const loaded = useRef(false);
  const { session } = useAuth();
  // Two columns on a wide window: the person on the left, the chosen view on the right.
  const wide = useWindowDimensions().width >= Layout.wide;

  // Loaded each time the page shows or the app comes back, so it notices the client
  // accepting the invite (Message and Call appear) while the page stays open.
  const load = useCallback(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('client_id', id)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(5)
      .then(({ data }) => {
        if (data) setUpcoming(data as unknown as Session[]);
        else setUpcoming((list) => list ?? []);
      });
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
  }, [id]);

  useFocusEffect(load);
  useRefreshOnReturn(load);
  // The client accepted, declined or left just now, or the connection is back after news
  // may have been missed.
  useChatEvents((event) => {
    if ((event.type === 'link' && event.client_id === id) || event.type === 'reconnected') load();
  });

  async function setStatus(status: ClientStatus) {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) return setError(plainError(error));
    haptic.success();
    if (status === 'archived') goBack('/clients');
    else {
      setClient((c) => (c ? { ...c, status } : c));
      toast(status === 'paused' ? 'Client paused' : 'Marked as active');
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
  const status = appStatusOf(client);
  // Message and Call need the client in Voltrix, linked to this trainer.
  const linked = !!client.user_id && client.user_id !== session?.user.id;
  // What the client logs in Voltrix, only while they have accepted this trainer.
  const sharing = status === 'joined' && !!client.user_id && client.status !== 'archived';
  const views = (Object.keys(VIEWS) as View3[])
    .filter((v) => v !== 'progress' || sharing)
    .map((value) => ({ value, label: VIEWS[value] }));
  const shown: View3 = views.some((v) => v.value === view) ? view : 'overview';
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
  ];
  // Only a view that isn't showing is hidden, never unmounted: an open nutrition edit or an unsent
  // check-in reply survives a look at another view.
  const hiddenUnless = (v: View3) => (shown === v ? null : styles.hidden);

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerTitle: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderTextButton title="Edit" accessibilityLabel={`Edit ${name}`} onPress={() => setEditing(true)} />
              <IconButton
                icon="ellipsis-horizontal"
                label={`More for ${name}`}
                onPress={() => setMore(true)}
                style={styles.headerMore}
              />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, wide && styles.columns]} keyboardShouldPersistTaps="handled">
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
              <AppStatusPill status={status} />
              {client.status !== 'active' ? (
                <StatusPill
                  tone={client.status === 'paused' ? 'warning' : 'muted'}
                  label={STATUS_LABELS[client.status]}
                />
              ) : null}
            </View>
            {actions.length ? (
              <View style={{ width: actions.length * 96, maxWidth: '100%' }}>
                <Shortcuts items={actions} />
              </View>
            ) : null}
          </View>
          {status !== 'joined' ? <AppLink client={client} status={status} onChanged={load} /> : null}
          <ErrorText>{error}</ErrorText>
        </View>

        <View style={[styles.sections, wide && styles.main]}>
          {views.length > 1 ? <Segmented options={views} value={shown} onChange={setView} /> : null}

          <View style={[styles.sections, hiddenUnless('overview')]}>
            <Section title="Upcoming sessions">
              {upcoming === null ? (
                <Group>
                  <SkeletonRows count={2} />
                </Group>
              ) : upcoming.length === 0 ? (
                <EmptyState
                  compact
                  icon="calendar-clear-outline"
                  title="Nothing booked"
                  message={client.status === 'active' ? 'No sessions coming up.' : 'Paused clients can’t be booked.'}
                  action={
                    client.status === 'active' ? (
                      <Button title="Book" variant="ghost" size="small" onPress={book} />
                    ) : undefined
                  }
                />
              ) : (
                <Group>
                  {upcoming.map((s, index) => (
                    <SessionRow key={s.id} session={s} variant="grouped" showDay last={index === upcoming.length - 1} />
                  ))}
                </Group>
              )}
            </Section>
            <Section
              title="Notes"
              action={{
                label: client.notes ? 'Edit' : 'Add',
                onPress: () => setEditing(true),
                accessibilityLabel: client.notes ? 'Edit notes' : 'Add notes',
              }}>
              <Card>
                <Text variant="callout" tone={client.notes ? 'primary' : 'secondary'}>
                  {client.notes || 'Injuries, preferences, anything useful to remember.'}
                </Text>
              </Card>
            </Section>
            {client.email || client.phone ? (
              <Section title="Contact">
                <Group>
                  {client.email ? (
                    <ListRow
                      title={client.email}
                      leading={<IconTile icon="mail-outline" />}
                      accessibilityLabel={`Email ${client.email}`}
                      compact
                      last={!client.phone}
                    />
                  ) : null}
                  {client.phone ? (
                    <ListRow
                      title={client.phone}
                      leading={<IconTile icon="call-outline" />}
                      accessibilityLabel={`Phone ${client.phone}`}
                      compact
                      last
                    />
                  ) : null}
                </Group>
              </Section>
            ) : null}
          </View>

          <View style={[styles.sections, hiddenUnless('plan')]}>
            <ClientWorkoutPlan clientId={client.id} clientName={client.first_name} />
            <ClientNutrition client={client} />
          </View>

          {sharing ? (
            <View style={[styles.sections, hiddenUnless('progress')]}>
              <ClientTrainingLog client={client} />
              <ClientProgress client={client} />
              <ClientHabits client={client} />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={`Edit ${client.first_name}`}>
        <ClientForm
          key={editing ? 'open' : 'closed'}
          inSheet
          initial={client}
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
            // A new email can mean a new invite: the status line catches up.
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
          {client.status === 'active' ? (
            <ListRow
              title="Pause client"
              subtitle="Off the active list; nothing is deleted"
              leading={<IconTile icon="pause-outline" />}
              chevron={false}
              compact
              onPress={() => fromMore(() => setStatus('paused'))}
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
          <ListRow
            title="Archive client"
            titleTone="danger"
            leading={<IconTile icon="archive-outline" color={Colors.danger} />}
            chevron={false}
            compact
            last
            onPress={() => fromMore(archive)}
          />
        </Group>
      </Sheet>
    </>
  );
}

// The page's shape while it loads: the photo, the name and a few rows.
function ClientSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading client" accessibilityRole="progressbar">
      <View style={styles.profile}>
        <Skeleton width={96} height={96} radius={48} />
        <Skeleton width={200} height={28} />
        <Skeleton width={120} height={22} radius={11} />
      </View>
      <Group>
        <SkeletonRows count={3} />
      </Group>
    </View>
  );
}

// What each state means for the trainer, in plain words.
function explain(status: AppStatus, client: Client) {
  const name = client.first_name;
  switch (status) {
    case 'joined':
      return `${name} accepted your invite in the Voltrix app.`;
    case 'invited':
      return `${name} has a Voltrix account with ${client.email}. Your invite is on their Home screen, and you'll be linked once they accept.`;
    case 'declined':
      return `${name} said no to your invite, so you're not linked. You can send it again later.`;
    case 'left':
      return `${name} left, so you no longer see their food diary, workouts, progress, check-ins, habits, chat or calls. Your notes, sessions and plans stay here.`;
    case 'gone':
      return client.email
        ? `The person who joined as this client left, and isn't on Voltrix with ${client.email} now. If their email changed, put the new one below to invite them again. To invite someone else, add them as a new client: this chat and history stay with the person who left.`
        : `The person who joined as this client left. Put the email they use on Voltrix below to invite them again, or add someone else as a new client.`;
    default:
      return client.email
        ? `Ask ${name} to download the Voltrix app and sign up with ${client.email}. Your invite will be waiting there for them to accept.`
        : `Add ${name}'s email below to invite them to the Voltrix app.`;
  }
}

// Where the client is with the Voltrix app when something is still to happen, with "Send invite
// again" after a no or a leave.
function AppLink({ client, status, onChanged }: { client: Client; status: AppStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function again() {
    setError(null);
    setBusy(true);
    try {
      await inviteAgain(client.id);
      haptic.success();
      onChanged();
    } catch (e) {
      setError(plainError(e, 'Could not send the invite. Try again.'));
    }
    setBusy(false);
  }

  const canAsk = (status === 'declined' || status === 'left') && !!client.email;
  return (
    <View style={{ gap: Spacing.tight }}>
      <Notice tone={status === 'invited' || status === 'not_on_app' ? 'neutral' : 'warning'}>
        {explain(status, client)}
      </Notice>
      {canAsk ? (
        <Button
          title="Send invite again"
          icon="paper-plane-outline"
          variant="secondary"
          size="medium"
          onPress={again}
          loading={busy}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
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
  // Wide window: the person (320) beside the chosen view.
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  side: {
    width: 320,
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
