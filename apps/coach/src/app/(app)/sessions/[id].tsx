import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderTextButton } from '@/components/header-button';
import { canJoin, JoinCall } from '@/components/join-call';
import { PaySheet, type PayItem } from '@/components/pay-sheet';
import { PriceField } from '@/components/price-field';
import { repeatEnd, RepeatSheet } from '@/components/repeat-sheet';
import { ScopeSheet } from '@/components/scope-sheet';
import { SessionForm, type SessionInput } from '@/components/session-form';
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
import { ago, dayMonth, longDate, shortDate, time24, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, moneyInput, parseMoney, priceFor, priceLabel } from '@/lib/money';
import { useGoBack } from '@/lib/nav';
import { loadOverview } from '@/lib/overview';
import { packFor } from '@/lib/pack-rules';
import { loadPacks, type Pack } from '@/lib/packs';
import { PAY_METHODS } from '@/lib/paid';
import { refreshReminders } from '@/lib/reminders';
import { weekdayName } from '@/lib/repeat-rules';
import { loadRepeat, moveThisAndLater, repeatClashes, stopRepeat, StopUnfinished, type Repeat } from '@/lib/repeats';
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
import { dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

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

// The database's answer when "This and later" moves to a day outside the session's week.
const SAME_WEEK = 'Pick a day in the same week to move every session to.';

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
  // The repeat this session belongs to, the client's packs, and the sheets that change them.
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [paying, setPaying] = useState<PayItem | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // Editing a repeat session asks "Change which sessions?" (or goes straight to this and later from
  // the repeat sheet); deleting one asks "Remove which sessions?".
  const [editScope, setEditScope] = useState<'ask' | 'later'>('ask');
  const [scope, setScope] = useState<{ kind: 'edit'; input: SessionInput } | { kind: 'remove' } | null>(null);
  const [laterLine, setLaterLine] = useState<string | null>(null);
  // "This and later" was refused for a day outside the week: the scope sheet says why next time.
  const [laterRefused, setLaterRefused] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    loadSession(id).then(({ data, error }) => {
      if (error) setError(plainError(error));
      else if (!data) setError('This session could not be found.');
      else setSession(data as unknown as Session);
    });
  }, [id]);

  async function reload() {
    const { data } = await loadSession(id);
    if (data) setSession(data as unknown as Session);
    return (data as unknown as Session | null) ?? null;
  }

  const seriesId = session?.series_id ?? null;
  useEffect(() => {
    if (!seriesId) return;
    let alive = true;
    loadRepeat(seriesId)
      .then((r) => alive && setRepeat(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [seriesId]);
  // The repeat as it is now, after this and later moved, or it stopped or got a new end.
  function reloadRepeat() {
    if (!seriesId) return;
    loadRepeat(seriesId)
      .then((r) => setRepeat(r))
      .catch(() => {});
  }

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
    loadPacks(clientId)
      .then((list) => alive && setPacks(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [clientId]);

  function reloadPacks() {
    if (clientId) loadPacks(clientId).then(setPacks, () => {});
  }

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

  // How many booked sessions of the repeat this one and the later ones are, for the scope sheet.
  async function countLater(input?: SessionInput) {
    if (!session?.series_id) return;
    setLaterLine(null);
    const from = dayMonth(new Date(session.starts_at));
    const [{ count }, clashes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', session.series_id)
        .eq('status', 'scheduled')
        .gte('starts_at', session.starts_at),
      input
        ? repeatClashes(
            new Date(input.starts_at),
            input.duration_minutes,
            repeat?.ends_on ?? null,
            session.series_id,
          ).catch(() => [])
        : Promise.resolve([]),
    ]);
    const n = count ?? 0;
    const days = new Set(clashes.map((c) => c.day)).size;
    setLaterLine(
      `${n === 1 ? '1 booked session' : `${n} booked sessions`} from ${from}${days ? ` · ${days} clash with something else` : ''}`,
    );
  }

  // Only this session changes.
  async function saveOnly(input: SessionInput) {
    const { error } = await supabase.from('sessions').update(input).eq('id', id);
    if (error) return saveError(error);
    refreshReminders();
    // Stay on the session: show what was saved and say so.
    await reload();
    setEditing(false);
    toast('Session updated');
    return null;
  }

  // This session and the later ones move; the client, price and notes change on this one only.
  async function saveLater(input: SessionInput) {
    if (!session) return null;
    try {
      const moved = await moveThisAndLater(
        session.id,
        new Date(input.starts_at),
        input.duration_minutes,
        input.location,
        input.online,
      );
      const own: Partial<SessionInput> = {};
      if (input.client_id !== session.client_id) own.client_id = input.client_id;
      if (input.title !== session.title) own.title = input.title;
      if (input.notes !== session.notes) own.notes = input.notes;
      if ('price_cents' in input) own.price_cents = input.price_cents;
      if (Object.keys(own).length) {
        const { error } = await supabase.from('sessions').update(own).eq('id', id);
        if (error) throw error;
      }
      haptic.success();
      refreshReminders();
      await reload();
      reloadRepeat();
      setLaterRefused(false);
      setEditing(false);
      setEditScope('ask');
      toast(moved === 1 ? 'Moved 1 session.' : `Moved ${moved} sessions.`);
      return null;
    } catch (e) {
      return plainError(e, 'Couldn’t move them. Try again.');
    }
  }

  async function saveEdit(input: SessionInput) {
    if (!session) return null;
    const moved =
      new Date(input.starts_at).getTime() !== new Date(session.starts_at).getTime() ||
      input.duration_minutes !== session.duration_minutes ||
      input.location !== session.location ||
      input.online !== session.online;
    if (session.series_id && editScope === 'later') return saveLater(input);
    if (session.series_id && moved) {
      setEditing(false);
      setScope({ kind: 'edit', input });
      countLater(input);
      return null;
    }
    return saveOnly(input);
  }

  async function chooseScope(later: boolean) {
    const chosen = scope;
    setScope(null);
    if (!chosen) return;
    if (chosen.kind === 'remove') return later ? stop() : remove();
    const problem = later ? await saveLater(chosen.input) : await saveOnly(chosen.input);
    if (problem) {
      haptic.warning();
      setError(problem);
      if (later && problem.startsWith(SAME_WEEK)) setLaterRefused(true);
    }
  }

  // Stops the repeat from this session's day: its booked sessions from then on go.
  async function stop() {
    if (!session?.series_id || stopping) return;
    const who = session.clients?.first_name;
    const ok = await confirm(
      who ? `Stop ${who}’s repeat booking?` : 'Stop this repeat booking?',
      who
        ? `Booked sessions from ${longDate(start0())} are removed, and ${who} sees the change in Voltrix. Earlier sessions stay.`
        : `Booked times from ${longDate(start0())} are removed. Earlier ones stay.`,
      'Stop repeating',
    );
    if (!ok) return;
    setRepeatOpen(false);
    const fromDay = zonedParts(start0(), repeat?.time_zone || profile?.time_zone || HOME_ZONE).day;
    const seriesOf = session.series_id;
    const wasBooked = session.status === 'scheduled';
    setStopping(true);
    const run = async (): Promise<void> => {
      try {
        const n = await stopRepeat(seriesOf, fromDay);
        haptic.success();
        refreshReminders();
        toast(`Stopped repeating. ${n === 1 ? '1 session' : `${n} sessions`} removed.`);
        if (wasBooked) goBack('/calendar');
        else {
          setRepeat((r) => (r ? { ...r, ends_on: fromDay } : r));
          await reload();
          reloadRepeat();
        }
      } catch (e) {
        haptic.warning();
        if (e instanceof StopUnfinished) toast(e.message, { action: { label: 'Try again', onPress: run } });
        else setError(plainError(e, 'Couldn’t stop it. Try again.'));
      }
    };
    await run();
    setStopping(false);
  }

  function start0() {
    return new Date(session!.starts_at);
  }

  function askRemove() {
    if (session?.series_id) {
      setScope({ kind: 'remove' });
      countLater();
    } else remove();
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
  const zone = repeat?.time_zone || profile?.time_zone || HOME_ZONE;
  const clock = zonedParts(start, zone);
  const onPack = session.pack_id ? (packs?.find((p) => p.id === session.pack_id) ?? null) : null;
  // A pack the session could use (not on one, not paid): "Use {first}’s pack" in the price sheet.
  const usablePack =
    !session.pack_id && !session.paid_on && session.client_id && session.status !== 'cancelled'
      ? packFor(packs ?? [], clock.day)
      : null;
  const priced = (session.price_cents ?? 0) > 0;
  const showPayment =
    !!session.client_id && !session.pack_id && priced && (session.status !== 'cancelled' || !!session.paid_on);
  const payItem: PayItem = {
    kind: 'session',
    id: session.id,
    paid_on: session.paid_on,
    paid_method: session.paid_method,
  };
  const cancelledBy =
    session.status === 'cancelled' && session.cancelled_by && session.marked_at
      ? `Cancelled by ${first} in Voltrix on ${shortDate(new Date(session.marked_at), now)} at ${time24(new Date(session.marked_at))}`
      : null;
  const canRepeat = !session.series_id && !!session.client_id && start > now && session.status !== 'cancelled';
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
            {session.series_id ? (
              <View style={styles.place} testID="session-repeat-line">
                <Ionicons name="repeat-outline" size={14} color={Colors.textSecondary} />
                <Text variant="footnote" tone="secondary" style={[Tabular, { flex: 1 }]}>
                  {`Every ${weekdayName(repeat?.weekday ?? clock.weekday)} at ${repeat?.start_time.slice(0, 5) ?? clock.time}`}
                </Text>
              </View>
            ) : null}
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
          <View style={styles.again}>
            <Button
              title="Book again"
              icon="add-circle-outline"
              variant="secondary"
              size="small"
              onPress={bookAgain}
              accessibilityLabel={`Book ${name} again next ${formatDay(addDays(start, 7)).split(' ')[0]}`}
              testID="session-book-again"
            />
            {canRepeat ? (
              <Button
                title="Repeat every week"
                icon="repeat-outline"
                variant="ghost"
                size="small"
                onPress={() => router.push({ pathname: '/sessions/new', params: { repeatFrom: session.id } })}
                testID="session-repeat"
              />
            ) : null}
          </View>
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
          {cancelledBy || note ? (
            <Text variant="footnote" tone="secondary" testID="session-mark-note">
              {cancelledBy ?? note}
            </Text>
          ) : null}
          {session.status === 'cancelled' && session.paid_on && !session.pack_id ? (
            <Text variant="footnote" tone="secondary">
              Paid sessions stay paid when cancelled. Mark it as not paid if you refunded it.
            </Text>
          ) : null}
        </Section>

        <Details
          rows={[
            session.client_id ? (
              <ListRow
                key="client"
                title={name}
                subtitle="Client"
                leading={<IconTile icon="person-outline" />}
                onPress={() => router.push({ pathname: '/clients/[id]', params: { id: session.client_id! } })}
                accessibilityLabel={`${name}. Open their page`}
                compact
              />
            ) : null,
            showPrice ? (
              <ListRow
                key="price"
                title="Price"
                subtitle={session.pack_id ? `From ${first}’s pack` : undefined}
                leading={<IconTile icon="cash-outline" />}
                trailing={
                  <Text variant="callout" tone={price ? 'primary' : 'tertiary'} style={Tabular}>
                    {price ?? 'No price'}
                  </Text>
                }
                onPress={() => setPricing(true)}
                accessibilityLabel={`Price: ${price ?? 'no price'}${session.pack_id ? `, from ${first}’s pack` : ''}. Change`}
                testID="session-price"
                compact
              />
            ) : null,
            showPayment ? (
              session.paid_on ? (
                <ListRow
                  key="payment"
                  title="Payment"
                  subtitle={`${session.paid_method ? `${PAY_METHODS[session.paid_method]} · ` : ''}${dayMonth(dayFromKey(session.paid_on))}`}
                  leading={<IconTile icon="checkmark-circle-outline" />}
                  trailing={
                    <Text variant="callout" tone="secondary">
                      Paid
                    </Text>
                  }
                  onPress={() => setPaying(payItem)}
                  testID="session-payment"
                  compact
                />
              ) : (
                <ListRow
                  key="payment"
                  title="Payment"
                  subtitle="Not paid"
                  leading={<IconTile icon="wallet-outline" />}
                  trailing={
                    <Button
                      title="Mark paid"
                      variant="secondary"
                      size="small"
                      onPress={() => setPaying(payItem)}
                      testID="session-mark-paid"
                    />
                  }
                  testID="session-payment"
                  compact
                />
              )
            ) : null,
            session.pack_id ? (
              <ListRow
                key="pack-payment"
                title="Payment"
                // The whole line under the title, so the day is never cut short.
                subtitle={
                  onPack?.paid_on
                    ? `With the pack · paid ${dayMonth(dayFromKey(onPack.paid_on))}`
                    : onPack
                      ? 'With the pack · not paid yet'
                      : 'With the pack'
                }
                subtitleLines={2}
                leading={<IconTile icon="albums-outline" />}
                onPress={() => router.push({ pathname: '/clients/[id]/money', params: { id: session.client_id! } })}
                testID="session-payment"
                compact
              />
            ) : null,
            session.series_id ? (
              <ListRow
                key="repeat"
                title="Repeats"
                subtitle={repeat ? `${repeat.start_time.slice(0, 5)} · ${repeatEnd(repeat)}` : undefined}
                leading={<IconTile icon="repeat-outline" />}
                trailing={
                  <Text variant="callout" tone="secondary">
                    {`Every ${weekdayName(repeat?.weekday ?? clock.weekday)}`}
                  </Text>
                }
                onPress={repeat ? () => setRepeatOpen(true) : undefined}
                testID="session-repeat-row"
                compact
              />
            ) : null,
            session.booked_by ? (
              <ListRow
                key="booked-by"
                title="Booked by"
                subtitle={`${first}, in Voltrix${session.created_at ? ` · ${ago(new Date(session.created_at))}` : ''}`}
                leading={<IconTile icon="phone-portrait-outline" />}
                compact
              />
            ) : null,
            session.client_note ? (
              <ListRow
                key="note"
                title={`${first}’s note`}
                subtitle={`“${session.client_note}”`}
                subtitleLines={3}
                leading={<IconTile icon="chatbox-ellipses-outline" />}
                compact
              />
            ) : null,
          ]}
        />

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
            onPress={askRemove}
            accessibilityState={{ disabled: deleting || stopping }}
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
          onPack={!!session.pack_id}
          usablePack={usablePack}
          onSaved={async () => {
            await reload();
            reloadPacks();
            setPricing(false);
            haptic.success();
            toast('Saved');
          }}
          onPackChanged={async (on) => {
            const fresh = await reload();
            reloadPacks();
            setPricing(false);
            haptic.success();
            toast(
              on
                ? `On ${first}’s pack.`
                : `Off the pack. Priced ${priceLabel(fresh?.price_cents ?? null, fresh?.currency ?? currency) ?? 'with no price'}.`,
            );
          }}
        />
      </Sheet>

      <PaySheet
        item={paying}
        first={first}
        onClose={() => setPaying(null)}
        onChanged={(paidOn, method) => setSession((s) => (s ? { ...s, paid_on: paidOn, paid_method: method } : s))}
      />

      <RepeatSheet
        visible={repeatOpen}
        repeat={repeat}
        first={session.clients?.first_name ?? session.title ?? 'the client'}
        onClose={() => setRepeatOpen(false)}
        onChangeLater={() => {
          setRepeatOpen(false);
          setEditScope('later');
          setEditing(true);
        }}
        onStop={stop}
        onEnded={(endsOn) => {
          setRepeat((r) => (r ? { ...r, ends_on: endsOn } : r));
          reloadRepeat();
          reload().then((fresh) => {
            if (!fresh) goBack('/calendar');
          });
        }}
      />

      <ScopeSheet
        visible={!!scope}
        title={scope?.kind === 'remove' ? 'Remove which sessions?' : 'Change which sessions?'}
        laterSubtitle={laterLine}
        note={scope?.kind === 'edit' && laterRefused ? SAME_WEEK : undefined}
        danger={scope?.kind === 'remove'}
        onOnly={() => chooseScope(false)}
        onLater={() => chooseScope(true)}
        onClose={() => setScope(null)}
      />

      <Sheet
        visible={editing}
        onClose={() => {
          setEditing(false);
          setEditScope('ask');
        }}
        title={editScope === 'later' ? 'Change this and later' : 'Edit session'}>
        <SessionForm
          inSheet
          initial={session}
          day={start}
          submitLabel={editScope === 'later' ? 'Move this and later' : 'Save changes'}
          inRepeat={!!session.series_id}
          onSubmit={saveEdit}
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
  onPack,
  usablePack,
  onSaved,
  onPackChanged,
}: {
  session: Session;
  currency: string;
  clientPrice: { cents: number | null; own: boolean } | null;
  first: string;
  // On a pack now; or a pack it could use.
  onPack: boolean;
  usablePack: Pack | null;
  onSaved: (cents: number | null) => void;
  onPackChanged: (on: boolean) => void;
}) {
  const [text, setText] = useState(moneyInput(session.price_cents));
  const [busy, setBusy] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
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

  // Off the pack (the database prices it like a new booking), or onto one.
  async function setPack(packId: string | null) {
    setPackBusy(true);
    setError(null);
    const { error: failure } = await supabase.from('sessions').update({ pack_id: packId }).eq('id', session.id);
    setPackBusy(false);
    if (failure) {
      haptic.warning();
      return setError(plainError(failure, 'Couldn’t change it. Try again.'));
    }
    onPackChanged(!!packId);
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
        {onPack
          ? 'This is the session’s share of the pack. A typed price takes this session off the pack.'
          : 'Earnings count this price once the session is marked done.'}
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} disabled={!!parsed.error || packBusy} />
      {onPack ? (
        <Button
          title="Take off the pack"
          variant="ghost"
          onPress={() => setPack(null)}
          loading={packBusy}
          disabled={busy}
          testID="price-off-pack"
        />
      ) : usablePack ? (
        <Button
          title={`Use ${first}’s pack`}
          variant="ghost"
          onPress={() => setPack(usablePack.id)}
          loading={packBusy}
          disabled={busy}
          testID="price-use-pack"
        />
      ) : null}
    </View>
  );
}

// The session's details: only the rows that apply, the last without a hairline.
function Details({ rows }: { rows: (ReactElement<{ last?: boolean }> | null)[] }) {
  const shown = rows.filter((r): r is ReactElement<{ last?: boolean }> => !!r);
  if (!shown.length) return null;
  return <Group>{shown.map((r, i) => (i === shown.length - 1 ? cloneElement(r, { last: true }) : r))}</Group>;
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
  again: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: -Spacing.four,
  },
}));
