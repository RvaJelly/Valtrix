import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { canJoin, JoinCall } from '@/components/join-call';
import { openOutside } from '@/components/invite-sheet';
import { MarkPaidSheet } from '@/components/mark-paid-sheet';
import { SellPackSheet } from '@/components/sell-pack-sheet';
import { SessionRow } from '@/components/session-row';
import { Sheet } from '@/components/sheet';
import { ToMarkSheet } from '@/components/to-mark-sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  Group,
  IconTile,
  ListRow,
  ProgressBar,
  Section,
  SkeletonRows,
  StatStrip,
  StatusDot,
  StatusPill,
  Text,
  Toggle,
} from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { APP_STATUS_LABELS, fullName, type AppStatus, type Client } from '@/lib/clients';
import { loadRules } from '@/lib/booking-rules';
import { dayMonth, longDate, monthYear, time24, timeRange, weekdayLong } from '@/lib/format';
import { formatMoney, priceFor, spokenMoney } from '@/lib/money';
import { waitedFor } from '@/lib/needs-you';
import type { ClientOverview as OverviewRow } from '@/lib/overview';
import { daysBetween, mondayOf, programWeek } from '@/lib/plan-dates';
import { addDays, dayKey, endOf, fromDayKey, SESSION_COLUMNS, toMark, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { waChat, waNumber } from '@/lib/whatsapp';
import { itemCount, owedWords } from '@/lib/paid';
import { dayFromKey } from '@/lib/zones';

type Sessions = { next: Session[]; past: Session[]; open: Session[] };

export type OverviewTab = 'overview' | 'plan' | 'progress';

// The client page's first tab: the invite while they aren't in Voltrix, a summary, sessions to mark,
// the next session, the plan this week, a check-in waiting, recent sessions, about and notes.
export function ClientOverview({
  client,
  row,
  status,
  linked,
  usual,
  currency,
  country,
  reloads,
  onInvite,
  onPrice,
  onRestore,
  onTab,
  onEdit,
  onChanged,
}: {
  client: Client;
  // clients_overview's row, or null while it loads or on an older database.
  row: OverviewRow | null;
  // Where they are with Voltrix as the page shows it (a shared invite reads as sent).
  status: AppStatus;
  linked: boolean;
  usual: number | null;
  currency: string;
  country: string;
  // Goes up when the page reloads, so the sessions here load again too.
  reloads: number;
  onInvite: () => void;
  onPrice: () => void;
  // Puts an archived client back on the list.
  onRestore: () => void;
  onTab: (tab: OverviewTab, checkIn?: string) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [marking, setMarking] = useState(false);
  const [phoneSheet, setPhoneSheet] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selling, setSelling] = useState(false);
  // Online booking is on for the trainer: the Books in Voltrix row shows. Its value saves at once.
  const [bookingOn, setBookingOn] = useState(false);
  const [selfBooking, setSelfBooking] = useState<boolean | null>(null);
  const loads = useRef(0);
  const first = client.first_name;
  const now = new Date();
  const today = dayKey(now);
  const archived = client.status === 'archived';

  const loadSessions = useCallback(() => {
    const id = ++loads.current;
    const at = new Date();
    return Promise.all([
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('client_id', client.id)
        .eq('status', 'scheduled')
        .gte('starts_at', at.toISOString())
        .order('starts_at')
        .limit(3),
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('client_id', client.id)
        .lt('starts_at', at.toISOString())
        .order('starts_at', { ascending: false })
        .limit(3),
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('client_id', client.id)
        .eq('status', 'scheduled')
        .gte('starts_at', addDays(at, -30).toISOString())
        .lt('starts_at', at.toISOString())
        .order('starts_at')
        .limit(50),
    ]).then(([next, past, open]) => {
      if (id !== loads.current) return;
      if (next.error || past.error) {
        // A failed reload keeps what was shown.
        setSessions((s) => s ?? { next: [], past: [], open: [] });
        return;
      }
      setSessions({
        next: (next.data ?? []) as unknown as Session[],
        past: (past.data ?? []) as unknown as Session[],
        open: ((open.data ?? []) as unknown as Session[]).filter((s) => toMark(s, at.getTime())),
      });
    });
  }, [client.id]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, reloads]);

  useEffect(() => {
    let live = true;
    loadRules().then(
      (rules) => live && setBookingOn(rules.enabled),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const booksInApp = selfBooking ?? row?.self_booking ?? true;
  async function switchSelfBooking(next: boolean) {
    setSelfBooking(next);
    const { error } = await supabase.from('clients').update({ self_booking: next }).eq('id', client.id);
    if (error) {
      setSelfBooking(!next);
      return toast('Couldn’t save. Try again.');
    }
    toast('Saved');
    onChanged();
  }

  const price = priceFor(client.session_price_cents, usual);
  const priceText = price.cents == null ? 'Not set' : price.cents === 0 ? 'Free' : formatMoney(price.cents, currency);
  const number = waNumber(client.phone, country);
  const nextSession = sessions?.next[0];
  const toMarkCount = sessions?.open.length ?? row?.open_sessions ?? 0;
  const listed = sessions ? [...[...sessions.next].reverse(), ...sessions.past] : [];

  const stats = linked
    ? [
        {
          value: row?.sessions_done ?? '–',
          label: 'Done',
          spoken: `${row?.sessions_done ?? 0} sessions done`,
          onPress: () => router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id } }),
        },
        {
          value: row?.no_shows ?? '–',
          label: 'No-shows',
          spoken: `${row?.no_shows ?? 0} no-shows, ${row?.no_shows_30d ?? 0} in the last 30 days`,
          onPress: () =>
            router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id, show: 'no_show' } }),
        },
        {
          ...lastWorkout(row?.last_workout_on ?? null, today),
          label: 'Last workout',
          onPress: () => onTab('plan'),
        },
        {
          ...lastCheckIn(row?.last_check_in_week ?? null, today),
          label: 'Last check-in',
          onPress: () => onTab('progress'),
        },
      ]
    : [
        {
          value: row?.sessions_done ?? '–',
          label: 'Done',
          spoken: `${row?.sessions_done ?? 0} sessions done`,
          onPress: () => router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id } }),
        },
        {
          value: row?.no_shows ?? '–',
          label: 'No-shows',
          spoken: `${row?.no_shows ?? 0} no-shows, ${row?.no_shows_30d ?? 0} in the last 30 days`,
          onPress: () =>
            router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id, show: 'no_show' } }),
        },
        {
          value: price.cents == null ? '–' : price.cents === 0 ? 'Free' : formatMoney(price.cents, currency),
          label: 'Price',
          spoken:
            price.cents == null
              ? 'No price set'
              : `${spokenMoney(price.cents, currency)} a session${price.own ? ', own price' : ''}`,
          onPress: onPrice,
        },
      ];

  const book = () => router.push({ pathname: '/sessions/new', params: { clientId: client.id } });
  const bookWeekly = () => router.push({ pathname: '/sessions/new', params: { client: client.id, repeat: '1' } });
  const toMoney = () => router.push({ pathname: '/clients/[id]/money', params: { id: client.id } });

  // ---------- Money: what's owed and the pack ----------
  const owed = row?.owed_cents ?? 0;
  const owedLine = row ? owedWords(itemCount(row.owed_count), row.owed_since, row.owed_other) : '';
  const packEnds = row?.pack_expires_on ? `Ends ${dayMonth(dayFromKey(row.pack_expires_on))}` : 'No end';
  const sellButton = !archived ? (
    <Button
      title="Sell a pack"
      variant="secondary"
      size="small"
      onPress={() => setSelling(true)}
      testID="overview-sell"
    />
  ) : null;
  const moneySection = (
    <Section title="Money" action={{ label: 'Money', onPress: toMoney, accessibilityLabel: `${first}’s money` }}>
      <View testID="overview-money">
        <Group>
          {owed > 0 || row?.owed_other ? (
            <ListRow
              title={owed > 0 ? `Owes ${formatMoney(owed, currency)}` : 'Owes money'}
              subtitle={owedLine}
              subtitleLines={2}
              leading={<IconTile icon="wallet-outline" />}
              trailing={
                <Button
                  title="Mark paid"
                  variant="secondary"
                  size="small"
                  onPress={() => setPaying(true)}
                  testID="overview-mark-paid"
                />
              }
              compact
            />
          ) : (
            <ListRow
              title="Paid up"
              leading={<IconTile icon="checkmark-circle-outline" />}
              status={<StatusDot tone="success" label="Nothing owed" />}
              onPress={toMoney}
              compact
            />
          )}
          {row?.pack_id && row.pack_left > 0 ? (
            <ListRow
              title={`Pack · ${row.pack_left} of ${row.pack_total} left${row.pack_booked ? ` · ${row.pack_booked} booked` : ''}`}
              titleLines={2}
              subtitle={
                <View style={{ gap: Spacing.two, marginTop: 2 }}>
                  <Text variant="footnote" tone="secondary">
                    {`${packEnds} · ${row.pack_paid ? 'paid' : 'not paid yet'}`}
                  </Text>
                  <ProgressBar progress={(row.pack_used + row.pack_booked) / Math.max(1, row.pack_total)} />
                </View>
              }
              leading={<IconTile icon="albums-outline" />}
              onPress={toMoney}
              compact
              last
            />
          ) : (
            <ListRow
              title={row?.pack_id ? 'Pack used up' : 'No pack'}
              leading={<IconTile icon="albums-outline" />}
              trailing={sellButton}
              compact
              last
            />
          )}
        </Group>
      </View>
    </Section>
  );

  // ---------- The health form row ----------
  const health = row?.health ?? null;
  const healthRow =
    archived || (!health && linked) ? null : (
      <ListRow
        title="Health form"
        subtitle={
          health === 'doctor'
            ? undefined
            : health === 'doctor_ok' || (!health && row?.doctor_ok_on)
              ? `Doctor’s OK · ${dayMonth(dayFromKey(row!.doctor_ok_on!))}`
              : health === 'clear'
                ? `Filled in ${row?.health_signed_at ? dayMonth(new Date(row.health_signed_at)) : ''} · no flags`
                : health === 'missing'
                  ? 'Not filled in yet'
                  : 'Not on Voltrix'
        }
        status={health === 'doctor' ? <StatusPill tone="warning" label="Check with a doctor" /> : null}
        leading={<IconTile icon="medkit-outline" />}
        onPress={() => router.push({ pathname: '/clients/[id]/health', params: { id: client.id } })}
        testID="overview-health"
        compact
      />
    );

  return (
    <View style={{ gap: Spacing.section }}>
      {archived ? (
        <Card testID="overview-archived">
          <Text variant="headline">{first} is archived</Text>
          <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.one }}>
            Archived clients are off your lists, and you can’t book them or send an invite. Restore {first} to work
            together again.
          </Text>
          <View style={{ marginTop: Spacing.gutter }}>
            <Button title="Restore client" variant="secondary" icon="arrow-undo-outline" onPress={onRestore} />
          </View>
        </Card>
      ) : status !== 'joined' ? (
        <InviteCard client={client} status={status} onInvite={onInvite} now={now} />
      ) : null}

      {/* Four in two rows, so each number keeps its room at 390 points. */}
      <View testID="overview-stats" style={{ gap: Spacing.two }}>
        {stats.length > 3 ? (
          <>
            <StatStrip items={stats.slice(0, 2)} />
            <StatStrip items={stats.slice(2)} />
          </>
        ) : (
          <StatStrip items={stats} />
        )}
      </View>

      {toMarkCount > 0 && sessions ? (
        <Group>
          <ListRow
            title={toMarkCount === 1 ? '1 session to mark' : `${toMarkCount} sessions to mark`}
            leading={<IconTile icon="checkmark-done-outline" />}
            onPress={() => setMarking(true)}
            testID="overview-to-mark"
            last
          />
        </Group>
      ) : null}

      {moneySection}

      <Section title="Next session">
        {!sessions ? (
          <Group>
            <SkeletonRows count={1} />
          </Group>
        ) : nextSession ? (
          <NextSession session={nextSession} name={fullName(client)} onApp={linked} now={now} />
        ) : client.status === 'active' ? (
          // Two ways to book, side by side under the words, so neither squeezes the line.
          <Group>
            <ListRow
              title="Nothing booked"
              subtitle={`Book ${first}’s next session.`}
              leading={<IconTile icon="calendar-clear-outline" />}
              compact
              last
            />
            <View style={{ flexDirection: 'row', gap: Spacing.two, padding: Spacing.gutter, paddingTop: 0 }}>
              <Button title="Book" variant="secondary" size="small" onPress={book} style={{ flex: 1 }} />
              <Button
                title="Book weekly"
                variant="secondary"
                size="small"
                icon="repeat-outline"
                onPress={bookWeekly}
                style={{ flex: 1 }}
                testID="overview-book-weekly"
              />
            </View>
          </Group>
        ) : (
          <EmptyState
            compact
            icon="calendar-clear-outline"
            title="Nothing booked"
            message={archived ? 'Archived clients can’t be booked.' : 'Paused clients can’t be booked.'}
          />
        )}
      </Section>

      {row && (row.plan_planned_week > 0 || row.program_id) ? (
        <Section title="Plan this week">
          <Group>
            <ListRow
              title={planTitle(row, today)}
              subtitle={
                row.plan_planned_week
                  ? linked && row.plan_done_week != null
                    ? `${row.plan_done_week} of ${row.plan_planned_week} done`
                    : `${row.plan_planned_week} ${row.plan_planned_week === 1 ? 'workout' : 'workouts'}`
                  : 'Nothing due this week'
              }
              leading={<IconTile icon="barbell-outline" />}
              onPress={() => onTab('plan')}
              last
            />
          </Group>
        </Section>
      ) : null}

      {row && row.unanswered_check_ins > 0 && row.unanswered_since ? (
        <Section title="Waiting for you">
          <Group>
            <ListRow
              // The day and the month stay together on one line.
              title={`Check-in waiting since ${dayMonth(new Date(row.unanswered_since)).replace(' ', '\u00a0')}`}
              titleLines={2}
              subtitle={
                row.unanswered_check_ins > 1 ? `${row.unanswered_check_ins} check-ins to answer` : 'Reply to it'
              }
              leading={<IconTile icon="chatbox-ellipses-outline" />}
              onPress={() => onTab('progress', row.unanswered_check_in_id ?? undefined)}
              last
            />
          </Group>
        </Section>
      ) : null}

      {sessions && !listed.length ? null : (
        <Section
          title="Sessions"
          action={{
            label: 'See all',
            onPress: () => router.push({ pathname: '/clients/[id]/sessions', params: { id: client.id } }),
            accessibilityLabel: `See all sessions with ${first}`,
          }}>
          {!sessions ? (
            <Group>
              <SkeletonRows count={3} />
            </Group>
          ) : listed.length ? (
            <Group>
              {listed.map((s, i) => (
                <SessionRow key={s.id} session={s} variant="grouped" showDay price last={i === listed.length - 1} />
              ))}
            </Group>
          ) : null}
        </Section>
      )}

      <Section title="About">
        <Group>
          {client.phone ? (
            <ListRow
              title={client.phone}
              leading={<IconTile icon="call-outline" />}
              onPress={() => setPhoneSheet(true)}
              accessibilityLabel={`Phone ${client.phone}. Call, WhatsApp or copy`}
              compact
            />
          ) : null}
          {client.email ? (
            <ListRow
              title={client.email}
              leading={<IconTile icon="mail-outline" />}
              accessibilityLabel={`Email ${client.email}`}
              compact
            />
          ) : null}
          <ListRow
            title="Session price"
            subtitle={
              <Text variant="footnote" tone="secondary" style={Tabular}>
                {price.cents == null
                  ? 'Not set'
                  : `${priceText} · ${price.own ? `${first}’s own price` : 'your usual price'}`}
              </Text>
            }
            leading={<IconTile icon="cash-outline" />}
            onPress={onPrice}
            accessibilityLabel={`Session price: ${
              price.cents == null
                ? 'not set'
                : `${spokenMoney(price.cents, currency)}, ${price.own ? 'own price' : 'usual price'}`
            }`}
            testID="overview-price"
            compact
          />
          <ListRow
            title="Voltrix"
            subtitle={
              linked && row?.joined_at ? `Joined ${dayMonth(new Date(row.joined_at))}` : APP_STATUS_LABELS[status]
            }
            leading={<IconTile icon="phone-portrait-outline" />}
            compact
          />
          {healthRow}
          {linked && bookingOn && !archived ? (
            <ListRow
              title="Books in Voltrix"
              subtitle={
                booksInApp
                  ? `${first} can book your open times in Voltrix.`
                  : `${first} can’t book in Voltrix. You book for them.`
              }
              subtitleLines={2}
              leading={<IconTile icon="calendar-number-outline" />}
              trailing={
                <Toggle
                  accessibilityLabel="Books in Voltrix"
                  value={booksInApp}
                  onValueChange={switchSelfBooking}
                  testID="overview-self-booking"
                />
              }
              compact
            />
          ) : null}
          {linked && row?.account_name ? (
            <View testID="overview-account">
              <ListRow
                title="Voltrix account"
                leading={<IconTile icon="person-circle-outline" />}
                subtitle={
                  <View style={{ gap: 2 }}>
                    <Text variant="footnote" tone="secondary" numberOfLines={1}>
                      {row.account_name}
                    </Text>
                    {sameName(row.account_name, fullName(client)) ? null : (
                      <Text variant="footnote" tone="tertiary">
                        Not who you expected? Ask {first}, and archive this client if it’s someone else.
                      </Text>
                    )}
                  </View>
                }
                compact
              />
            </View>
          ) : null}
          <ListRow
            title={`Client since ${monthYear(new Date(client.created_at))}`}
            leading={<IconTile icon="time-outline" />}
            compact
            last
          />
        </Group>
      </Section>

      <Section
        title="Notes"
        action={{
          label: client.notes ? 'Edit' : 'Add',
          onPress: onEdit,
          accessibilityLabel: client.notes ? 'Edit notes' : 'Add notes',
        }}>
        <Card onPress={onEdit} accessibilityLabel={client.notes ? `Notes: ${client.notes}. Edit` : 'Add notes'}>
          <Text variant="callout" tone={client.notes ? 'primary' : 'secondary'} numberOfLines={6}>
            {client.notes || 'Injuries, preferences, anything useful to remember.'}
          </Text>
        </Card>
      </Section>

      <ToMarkSheet
        visible={marking}
        sessions={sessions?.open ?? []}
        onClose={() => setMarking(false)}
        onChanged={() => {
          loadSessions();
          onChanged();
        }}
      />
      <MarkPaidSheet
        clientId={paying ? client.id : null}
        first={first}
        onClose={() => setPaying(false)}
        onDone={onChanged}
      />
      <SellPackSheet
        clientId={selling ? client.id : null}
        first={first}
        clientPriceCents={client.session_price_cents}
        onClose={() => setSelling(false)}
        onSold={() => {
          loadSessions();
          onChanged();
        }}
      />
      <Sheet visible={phoneSheet} onClose={() => setPhoneSheet(false)} title={client.phone ?? undefined}>
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title="Call"
            leading={<IconTile icon="call-outline" />}
            chevron={false}
            compact
            onPress={() => {
              openOutside(`tel:${(client.phone ?? '').replace(/[^\d+]/g, '')}`);
              setPhoneSheet(false);
            }}
          />
          {number ? (
            <ListRow
              title="WhatsApp"
              leading={<IconTile icon="logo-whatsapp" />}
              chevron={false}
              compact
              onPress={() => {
                openOutside(waChat(number));
                setPhoneSheet(false);
              }}
            />
          ) : null}
          <ListRow
            title="Copy number"
            leading={<IconTile icon="copy-outline" />}
            chevron={false}
            compact
            last
            onPress={async () => {
              setPhoneSheet(false);
              await Clipboard.setStringAsync(client.phone ?? '');
              toast('Number copied');
            }}
          />
        </Group>
      </Sheet>
    </View>
  );
}

function sameName(a: string, b: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const x = norm(a);
  const y = norm(b);
  return x === y || x.split(' ')[0] === y.split(' ')[0];
}

// When they last logged a workout, short enough for the strip ("Today", "Yesterday", "3 days"), and the
// words a screen reader says.
function lastWorkout(day: string | null, today: string) {
  if (!day) return { value: 'None yet', spoken: 'No workout logged yet' };
  const days = Math.max(0, daysBetween(day, today));
  if (days === 0) return { value: 'Today', spoken: 'Last workout today' };
  if (days === 1) return { value: 'Yesterday', spoken: 'Last workout yesterday' };
  return { value: `${days} days`, spoken: `Last workout ${days} days ago` };
}

// When they last checked in, in Monday weeks: "This week", "Last week", "3 weeks".
function lastCheckIn(week: string | null, today: string) {
  if (!week) return { value: 'None yet', spoken: 'No check-in yet' };
  const weeks = Math.max(0, Math.round(daysBetween(week, mondayOf(today)) / 7));
  if (weeks === 0) return { value: 'This week', spoken: 'Checked in this week' };
  if (weeks === 1) return { value: 'Last week', spoken: 'Last checked in last week' };
  return { value: `${weeks} weeks`, spoken: `Last check-in ${weeks} weeks ago` };
}

function planTitle(row: OverviewRow, today: string) {
  if (!row.program_id || !row.program_name || !row.program_starts_on || !row.program_weeks) return 'This week’s plan';
  const where = programWeek(
    { starts_on: row.program_starts_on, weeks: row.program_weeks, ends_on: row.program_ends_on },
    today,
  );
  if (!where.started) return `${row.program_name} · Starts ${longDate(fromDayKey(row.program_starts_on))}`;
  return `${row.program_name} · Week ${where.week} of ${where.weeks}`;
}

// The client's next booked session: when, where, and Join while the call is on.
function NextSession({ session, name, onApp, now }: { session: Session; name: string; onApp: boolean; now: Date }) {
  const start = new Date(session.starts_at);
  const end = endOf(session);
  const place = session.online ? 'Video call' : session.location;
  return (
    <Card
      onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: session.id } })}
      accessibilityLabel={`Next session: ${longDate(start)}, ${timeRange(start, end)}${place ? `, ${place}` : ''}`}
      footer={canJoin(session, now.getTime()) ? <JoinCall session={session} name={name} onApp={onApp} /> : null}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <Text variant="headline" style={{ flex: 1 }}>
          {longDate(start)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
      <Text variant="callout" style={[Tabular, { marginTop: Spacing.one }]}>
        {timeRange(start, end)}
      </Text>
      {place ? (
        <Text variant="callout" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
          {place}
        </Text>
      ) : null}
      {session.series_id ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.two }}>
          <Ionicons name="repeat-outline" size={14} color={Colors.textSecondary} />
          <Text variant="footnote" tone="secondary" style={Tabular}>
            {`Every ${weekdayLong(start)} at ${time24(start)}`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

// Where the client is with Voltrix while they aren't in it, and the one thing to do about it.
function InviteCard({
  client,
  status,
  onInvite,
  now,
}: {
  client: Client;
  status: AppStatus;
  onInvite: () => void;
  now: Date;
}) {
  const first = client.first_name;
  let headline: string;
  let callout: string;
  let button: ReactNode;
  switch (status) {
    case 'invited':
      headline = 'Invite sent';
      callout = client.invite_shared_at
        ? `You sent ${first} an invite ${waitedFor(client.invite_shared_at, now.getTime())} ago. They connect by entering the code from your message.`
        : `${first} has a Voltrix account with ${client.email}. Your invite is on their Home screen.`;
      button = <Button title="Send again" variant="secondary" icon="logo-whatsapp" onPress={onInvite} />;
      break;
    case 'declined':
      headline = `${first} said no to your invite`;
      callout = 'You’re not linked. You can invite them again when they’re ready.';
      button = <Button title="Invite again" variant="secondary" icon="logo-whatsapp" onPress={onInvite} />;
      break;
    case 'left':
      headline = client.invite_answered_at
        ? `${first} left on ${dayMonth(new Date(client.invite_answered_at))}`
        : `${first} left`;
      callout = `You no longer see their food diary, workouts, progress, check-ins, habits, chat or calls. Your notes, sessions and plans stay here. Only ${first} can rejoin on this client.`;
      button = <Button title="Invite again" variant="secondary" icon="logo-whatsapp" onPress={onInvite} />;
      break;
    case 'gone':
      headline = `${first} deleted their Voltrix account`;
      callout = 'Their chat and history stay with this client. To work with them again, add them as a new client.';
      button = (
        <Button
          title="Add as a new client"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/clients/new',
              params: { first: client.first_name, last: client.last_name ?? '', phone: client.phone ?? '' },
            })
          }
        />
      );
      break;
    default:
      headline = 'Not on Voltrix yet';
      callout = `Invite ${first} on WhatsApp. They get the app and a code to connect with you.${
        client.email ? ` They can also sign up with ${client.email}.` : ''
      }`;
      button = <Button title="Invite on WhatsApp" icon="logo-whatsapp" onPress={onInvite} />;
  }
  return (
    <View testID="overview-invite">
      <Card>
        <Text variant="headline">{headline}</Text>
        <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.one }}>
          {callout}
        </Text>
        <View style={{ marginTop: Spacing.gutter }}>{button}</View>
      </Card>
    </View>
  );
}
