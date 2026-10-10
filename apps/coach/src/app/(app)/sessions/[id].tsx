import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderTextButton } from '@/components/header-button';
import { canJoin, JoinCall } from '@/components/join-call';
import { PriceField } from '@/components/price-field';
import { SessionForm } from '@/components/session-form';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Section,
  Segmented,
  Skeleton,
  StatusPill,
  Text,
  TextLink,
  Toggle,
  type StatusTone,
} from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { shortDate, time24, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, moneyInput, parseMoney, priceFor, priceLabel } from '@/lib/money';
import { useGoBack } from '@/lib/nav';
import { loadOverview } from '@/lib/overview';
import { refreshReminders } from '@/lib/reminders';
import { saveError } from '@/lib/save-error';
import {
  addDays,
  canMark,
  dayKey,
  endOf,
  formatDay,
  SESSION_COLUMNS,
  SESSION_STATUS,
  sessionName,
  timeKey,
  type Session,
  type SessionStatus,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

// The status control: three choices that always fit on a phone. A no-show is its own switch under it.
const CHOICES: readonly { value: SessionStatus; label: string }[] = (
  ['scheduled', 'completed', 'cancelled'] as const
).map((value) => ({ value, label: SESSION_STATUS[value] }));

function loadSession(id: string) {
  return supabase.from('sessions').select(SESSION_COLUMNS).eq('id', id).maybeSingle();
}

// What the toast says after the status changes.
const MARKED: Record<SessionStatus, string> = {
  scheduled: 'Back to booked',
  completed: 'Marked as done',
  no_show: 'Marked as a no-show',
  cancelled: 'Cancelled',
};

// "Marked done Thu 8 Oct, 19:05".
function markedNote(s: Session, now: Date) {
  if (!s.marked_at || s.status === 'scheduled') return null;
  const at = new Date(s.marked_at);
  const when = `${shortDate(at, now)}, ${time24(at)}`;
  if (s.status === 'completed') return `Marked done ${when}`;
  if (s.status === 'no_show') return `Marked as a no-show ${when}`;
  return `Cancelled ${when}`;
}

export default function SessionDetail() {
  const goBack = useGoBack();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Deleting, so a second tap on a slow connection does nothing.
  const [deleting, setDeleting] = useState(false);
  // A status change on its way to the server; taps in the meantime are ignored.
  const saving = useRef(false);
  const { chats } = useChat();
  const { profile } = useAuth();
  const [pricing, setPricing] = useState(false);
  // The client's own price, for "Use {first}’s price".
  const [clientPrice, setClientPrice] = useState<number | null>(null);

  useEffect(() => {
    loadSession(id).then(({ data, error }) => {
      if (error) setError(plainError(error));
      else if (!data) setError('This session could not be found.');
      else setSession(data as unknown as Session);
    });
  }, [id]);

  const clientId = session?.client_id ?? null;
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    supabase
      .from('clients')
      .select('session_price_cents')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setClientPrice((data as { session_price_cents: number | null } | null)?.session_price_cents ?? null);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  // The status changes at once and is saved behind it; a failure puts it back. The toast offers Undo,
  // so a slip of the thumb (Cancelled instead of Done) is one tap to put right.
  async function changeStatus(status: SessionStatus, before: SessionStatus, undoable: boolean) {
    if (saving.current || !session) return;
    saving.current = true;
    if (status === 'completed') haptic.success();
    else haptic.select();
    setError(null);
    const markedBefore = session.marked_at;
    const marked = status === 'scheduled' ? null : new Date().toISOString();
    setSession((s) => (s ? { ...s, status, marked_at: marked } : s));
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id);
    saving.current = false;
    if (error) {
      haptic.warning();
      setSession((s) => (s ? { ...s, status: before, marked_at: markedBefore } : s));
      return setError(plainError(error));
    }
    refreshReminders();
    let words = MARKED[status];
    // A second no-show in 30 days is worth knowing about.
    if (status === 'no_show' && session.client_id) {
      const rows = await loadOverview(dayKey(new Date()), session.client_id).catch(() => null);
      const count = rows?.[0]?.no_shows_30d ?? 0;
      if (count >= 2)
        words = `Marked as a no-show. ${session.clients?.first_name ?? 'They'} has ${count} in the last 30 days.`;
    }
    toast(
      words,
      undoable ? { action: { label: 'Undo', onPress: () => changeStatus(before, status, false) } } : undefined,
    );
  }

  function setStatus(status: SessionStatus) {
    if (!session || status === session.status) return;
    changeStatus(status, session.status, true);
  }

  async function remove() {
    if (deleting || !(await confirm('Delete session?', 'It will be removed from your calendar.', 'Delete'))) return;
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      setDeleting(false);
      return setError(plainError(error));
    }
    haptic.success();
    refreshReminders();
    goBack('/calendar');
  }

  if (!session) {
    return error ? (
      <EmptyState
        icon="calendar-clear-outline"
        title="Session not found"
        message={error}
        action={<Button title="Back to calendar" variant="secondary" onPress={() => goBack('/calendar')} />}
      />
    ) : (
      <View style={styles.content}>
        <Card hero style={{ gap: Spacing.tight }}>
          <Skeleton width={80} height={14} />
          <Skeleton width="70%" height={26} />
          <Skeleton width={140} height={20} />
          <Skeleton width={110} height={16} />
        </Card>
        <Skeleton height={40} radius={20} />
      </View>
    );
  }

  const start = new Date(session.starts_at);
  const end = endOf(session);
  const name = sessionName(session);
  const now = new Date();
  const markable = canMark(session, now.getTime());
  const pill = PILLS[session.status];
  const onApp = !!session.clients?.user_id;
  const joinable = canJoin(session, new Date().getTime());
  const place = session.online ? 'Video call' : session.location || 'No place set';
  // Done and a no-show only make sense once the session has (nearly) started.
  const canNoShow = markable || session.status === 'no_show';
  const choices = CHOICES.map((c) => ({
    ...c,
    disabled: c.value === 'completed' && !markable && session.status !== 'completed',
  }));
  const note =
    markable || session.status !== 'scheduled'
      ? markedNote(session, now)
      : 'You can mark it done or as a no-show once it has started.';
  const currency = profile?.currency ?? 'ZAR';
  const showPrice = !!session.client_id || session.price_cents != null;
  const price = priceLabel(session.price_cents, session.currency ?? currency);
  const first = session.clients?.first_name ?? 'the client';
  const bookAgain = () =>
    router.push({
      pathname: '/sessions/new',
      params: {
        clientId: session.client_id ?? undefined,
        date: dayKey(addDays(start, 7)),
        time: timeKey(start),
        duration: String(session.duration_minutes),
        location: session.location ?? undefined,
        online: session.online ? '1' : undefined,
      },
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerTitle: '',
          headerRight: () => (
            <HeaderTextButton title="Edit" accessibilityLabel="Edit session" onPress={() => setEditing(true)} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card hero style={{ gap: Spacing.tight }}>
          <View style={styles.top}>
            <Text variant="label" tone="secondary" style={{ flex: 1 }}>
              {formatDay(start)}
            </Text>
            {pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
          </View>
          <Text
            variant="title"
            numberOfLines={2}
            accessibilityRole="header"
            style={session.status === 'cancelled' ? styles.struck : undefined}>
            {name}
          </Text>
          <View style={{ gap: Spacing.one }}>
            <Text variant="headline" style={Tabular}>
              {timeRange(start, end)}
              <Text variant="callout" tone="secondary">
                {'  '}
                {session.duration_minutes} min
              </Text>
            </Text>
            <View style={styles.place}>
              <Ionicons
                name={session.online ? 'videocam-outline' : 'location-outline'}
                size={16}
                color={Colors.textSecondary}
              />
              <Text variant="callout" tone="secondary" numberOfLines={2} style={{ flex: 1 }}>
                {place}
              </Text>
            </View>
          </View>
          {joinable || (session.client_id && onApp) ? (
            <View style={styles.actions}>
              <JoinCall
                session={session}
                name={name}
                avatar={chats.find((c) => c.chat_id === session.client_id)?.other_avatar}
                onApp={onApp}
              />
              {session.client_id && onApp ? (
                <Button
                  title="Message"
                  icon="chatbubble-outline"
                  variant="secondary"
                  size="medium"
                  accessibilityLabel={`Message ${name}`}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: session.client_id!, name } })}
                />
              ) : null}
            </View>
          ) : null}
        </Card>
        {session.client_id ? (
          <Button
            title="Book again"
            icon="repeat-outline"
            variant="secondary"
            size="small"
            onPress={bookAgain}
            accessibilityLabel={`Book ${name} again next ${formatDay(addDays(start, 7)).split(' ')[0]}`}
            testID="session-book-again"
            style={{ alignSelf: 'flex-start', marginTop: -Spacing.four }}
          />
        ) : null}

        <Section title="Status">
          <Segmented options={choices} value={session.status} onChange={setStatus} testID="session-status" />
          {canNoShow ? (
            <Group>
              <ListRow
                title="Client didn’t show"
                leading={<IconTile icon="person-remove-outline" />}
                trailing={
                  <Toggle
                    value={session.status === 'no_show'}
                    // Off again means they did come: the session is done.
                    onValueChange={(on) => setStatus(on ? 'no_show' : 'completed')}
                    accessibilityLabel="Client didn’t show"
                  />
                }
                compact
                last
              />
            </Group>
          ) : null}
          {note ? (
            <Text variant="footnote" tone="secondary" testID="session-mark-note">
              {note}
            </Text>
          ) : null}
        </Section>

        {session.client_id || showPrice ? (
          <Group>
            {session.client_id ? (
              <ListRow
                title={name}
                subtitle="Client"
                leading={<IconTile icon="person-outline" />}
                onPress={() => router.push({ pathname: '/clients/[id]', params: { id: session.client_id! } })}
                accessibilityLabel={`${name}. Open their page`}
                compact
                last={!showPrice}
              />
            ) : null}
            {showPrice ? (
              <ListRow
                title="Price"
                leading={<IconTile icon="cash-outline" />}
                trailing={
                  <Text variant="callout" tone={price ? 'primary' : 'tertiary'} style={Tabular}>
                    {price ?? 'No price'}
                  </Text>
                }
                onPress={() => setPricing(true)}
                accessibilityLabel={`Price: ${price ?? 'no price'}. Change`}
                testID="session-price"
                compact
                last
              />
            ) : null}
          </Group>
        ) : null}

        {session.notes ? (
          <Section title="Notes">
            <Card>
              <Text variant="callout">{session.notes}</Text>
            </Card>
          </Section>
        ) : null}

        <ErrorText>{error}</ErrorText>

        <Group>
          <ListRow
            title={deleting ? 'Deleting…' : 'Delete session'}
            titleTone="danger"
            leading={<IconTile icon="trash-outline" color={Colors.danger} />}
            chevron={false}
            compact
            last
            onPress={remove}
            accessibilityState={{ disabled: deleting }}
          />
        </Group>
      </ScrollView>

      <Sheet visible={pricing} onClose={() => setPricing(false)} title="Session price">
        <SessionPrice
          key={pricing ? 'open' : 'closed'}
          session={session}
          currency={session.currency ?? currency}
          clientPrice={session.client_id ? priceFor(clientPrice, profile?.session_price_cents ?? null) : null}
          first={first}
          onSaved={(cents) => {
            setSession((s) => (s ? { ...s, price_cents: cents } : s));
            setPricing(false);
            haptic.success();
            toast('Saved');
          }}
        />
      </Sheet>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit session">
        <SessionForm
          inSheet
          initial={session}
          day={start}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            const { error } = await supabase.from('sessions').update(input).eq('id', id);
            if (error) return saveError(error);
            refreshReminders();
            // Stay on the session: show what was saved and say so.
            const { data } = await loadSession(id);
            if (data) setSession(data as unknown as Session);
            setEditing(false);
            toast('Session updated');
            return null;
          }}
        />
      </Sheet>
    </>
  );
}

// The session's own price: typed, or the client's price as it is now.
function SessionPrice({
  session,
  currency,
  clientPrice,
  first,
  onSaved,
}: {
  session: Session;
  currency: string;
  clientPrice: { cents: number | null; own: boolean } | null;
  first: string;
  onSaved: (cents: number | null) => void;
}) {
  const [text, setText] = useState(moneyInput(session.price_cents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseMoney(text, currency);

  async function save() {
    if (parsed.error) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase
      .from('sessions')
      .update({ price_cents: parsed.cents })
      .eq('id', session.id);
    setBusy(false);
    if (failure) {
      haptic.warning();
      return setError(plainError(failure, 'Couldn’t save. Try again.'));
    }
    onSaved(parsed.cents);
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <PriceField
        label="Price"
        value={text}
        onChangeText={setText}
        currency={currency}
        placeholder="No price"
        error={parsed.error}
      />
      {clientPrice?.cents != null && clientPrice.cents !== parsed.cents ? (
        <View style={{ alignItems: 'flex-start' }}>
          <TextLink
            label={`Use ${clientPrice.own ? `${first}’s price` : 'your usual price'} (${formatMoney(clientPrice.cents, currency)})`}
            onPress={() => setText(moneyInput(clientPrice.cents))}
          />
        </View>
      ) : null}
      <Text variant="footnote" tone="secondary">
        Earnings count this price once the session is marked done.
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} disabled={!!parsed.error} />
    </View>
  );
}

const styles = themed(() => ({
  content: {
    gap: Spacing.section,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  struck: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actions: {
    gap: Spacing.tight,
    marginTop: Spacing.two,
  },
}));
