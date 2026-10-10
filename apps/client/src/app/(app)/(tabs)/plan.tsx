import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerNotice } from '@/components/answer-notice';
import { Chips } from '@/components/chips';
import { SessionRow } from '@/components/session-row';
import { SessionSheet } from '@/components/session-sheet';
import {
  Button,
  Card,
  EmptyState,
  Group,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { WaitingSheet } from '@/components/waiting-sheet';
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { firstOf } from '@/lib/book-times';
import {
  loadBookingInfo,
  loadMyPacks,
  loadMyTimeRequests,
  type BookingInfo,
  type MyPack,
  type MyTimeRequest,
} from '@/lib/booking';
import { useChatEvents } from '@/lib/chat-live';
import { ago, dayMonth, longDate, shortDate, timeRange } from '@/lib/format';
import {
  dateOf,
  daysLabel,
  dueOn,
  loadNextPlanned,
  loadPlan,
  programsIn,
  programWeek,
  startOfWeek,
  trainerLabel,
  weekdayItems,
  WEEKDAYS,
  weekProgress,
  type PlanItem,
  type PlanProgram,
} from '@/lib/plan';
import { addDays, dayKey, endOf, formatDay, loadSessions, sameDay, type Session } from '@/lib/sessions';
import { loadTrainers, trainerTitle, type Trainer } from '@/lib/trainers';
import { dayFromKey } from '@/lib/zones';

type Tab = 'workouts' | 'sessions';
type When = 'upcoming' | 'past';

const WHEN: Record<When, string> = { upcoming: 'Upcoming', past: 'Past' };

// How far ahead and back the session lists reach.
const DAYS = 180;

// Booking in the app: what each trainer allows (by trainer id), the times the person asked for, and
// their packs. Empty on an older database, which hides each part.
type Booking = { infos: Record<string, BookingInfo>; requests: MyTimeRequest[]; packs: MyPack[] };
const NO_BOOKING: Booking = { infos: {}, requests: [], packs: [] };

// The trainers the person has, and what each allows, or null when they couldn't load.
async function loadLinked() {
  try {
    const linked = await loadTrainers();
    const answers = await Promise.all(linked.map((t) => loadBookingInfo(t.trainer_id).catch(() => null)));
    const infos: Record<string, BookingInfo> = {};
    linked.forEach((t, i) => {
      const info = answers[i];
      if (info) infos[t.trainer_id] = info;
    });
    return { linked, infos };
  } catch {
    return null;
  }
}

function openWorkout(item: PlanItem) {
  router.push({ pathname: '/workouts/[id]', params: { id: item.plan_item_id } });
}

function startWorkout(item: PlanItem) {
  router.push({ pathname: '/workouts/live', params: { plan: item.plan_item_id } });
}

// The client's training: the workouts their trainers planned for today and this
// week, and their booked sessions. Reminders for a session open the sessions here.
export default function Plan() {
  const params = useLocalSearchParams<{ view?: string }>();
  const tab: Tab = params.view === 'sessions' ? 'sessions' : 'workouts';
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  // Only when nothing is planned this week: the first workout in the next 8 weeks, if any.
  const [next, setNext] = useState<Ahead>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  // Only for the empty states' "Message {trainer}": a failure just leaves the action out.
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [booking, setBooking] = useState<Booking>(NO_BOOKING);
  const [when, setWhen] = useState<When>('upcoming');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);
  // The day the plan was loaded for: its ticks and "Today" belong to that day.
  const loadedFor = useRef('');
  // Loads overlap (focus, live news, pull to refresh): only the newest one's answer shows.
  const loads = useRef(0);
  const newsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The plan and the sessions load on their own, so one failing doesn't hide the other,
  // and a failed refresh keeps what was already on screen.
  const load = useCallback(async () => {
    const mine = ++loads.current;
    const now = new Date();
    loadedFor.current = dayKey(now);
    // A failed call is undefined (what was shown stays); null is an older database (the part hides).
    const [items, list, linked, requests, packs] = await Promise.all([
      loadPlan(now).catch(() => null),
      loadSessions(addDays(now, -DAYS), addDays(now, DAYS)).catch(() => null),
      loadLinked(),
      loadMyTimeRequests().catch(() => undefined),
      loadMyPacks().catch(() => undefined),
    ]);
    // A week with nothing in it asks once what comes later.
    const ahead = items && !items.length ? await loadNextPlanned(now).catch(() => null) : null;
    if (mine !== loads.current) return;
    if (items) {
      setPlan(items);
      setNext(ahead);
    }
    if (list) setSessions(list);
    if (linked) setTrainers(linked.linked);
    setBooking((old) => ({
      infos: linked ? linked.infos : old.infos,
      requests: requests === undefined ? old.requests : (requests ?? []),
      packs: packs === undefined ? old.packs : (packs ?? []),
    }));
    setError(items && list ? null : 'Could not load your plan. Check your internet connection.');
  }, []);

  // A trainer changed the plan or a session, answered a time the person asked for, or a trainer link
  // changed (or news may have been missed while the connection was down): load again once the news
  // stops, a second after the last.
  useChatEvents((event) => {
    if (!['plan', 'session', 'news', 'link', 'reconnected'].includes(event.type)) return;
    if (newsTimer.current) clearTimeout(newsTimer.current);
    newsTimer.current = setTimeout(() => {
      newsTimer.current = null;
      load();
    }, 1000);
  });
  useEffect(
    () => () => {
      if (newsTimer.current) clearTimeout(newsTimer.current);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // Tabs stay open in the background: load again when the app comes back, and when
      // the date moves on (past midnight) while this tab shows.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') load();
      });
      const timer = setInterval(() => {
        if (dayKey(new Date()) !== loadedFor.current) load();
      }, 60_000);
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />
        }>
        <PageHeader title="Plan" />
        <Segmented
          options={[
            { value: 'workouts', label: 'Workouts' },
            { value: 'sessions', label: 'Sessions' },
          ]}
          value={tab}
          onChange={(view) => router.setParams({ view })}
        />

        {/* A web page can't be pulled down to refresh, so there's always a button. */}
        {error ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {error}
          </Notice>
        ) : null}
        {tab === 'workouts' ? (
          plan ? (
            <Workouts plan={plan} next={next} trainers={trainers} />
          ) : !error && showSkeleton ? (
            <SkeletonRows count={3} />
          ) : null
        ) : sessions ? (
          <Sessions
            sessions={sessions}
            trainers={trainers}
            booking={booking}
            when={when}
            onWhen={setWhen}
            onChanged={load}
          />
        ) : !error && showSkeleton ? (
          <SkeletonRows count={3} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// The workouts the client logged, with their personal bests: a quiet action beside a section title.
const HISTORY = { label: 'Workout history', onPress: () => router.push('/workouts/history') };

function firstName(name: string) {
  return name.split(' ')[0] || name;
}

// The empty states' one action: write to the trainer (or pick one of several in Chats), or find
// a trainer when there is none yet.
function TrainerAction({ trainers }: { trainers: Trainer[] | null }) {
  if (!trainers) return null;
  if (!trainers.length) {
    return <Button title="Find a trainer" size="medium" onPress={() => router.push('/trainers')} />;
  }
  if (trainers.length > 1) {
    return <Button title="Message your trainers" size="medium" onPress={() => router.navigate('/chats')} />;
  }
  const t = trainers[0];
  const name = trainerTitle(t);
  return (
    <Button
      title={`Message ${firstName(name)}`}
      size="medium"
      icon="chatbubble-outline"
      onPress={() =>
        router.push({ pathname: '/chat/[id]', params: { id: t.client_id, name, avatar: t.trainer_avatar ?? '' } })
      }
    />
  );
}

// The first workout in the next 8 weeks when nothing is planned this week, and the day it is first due.
type Ahead = { item: PlanItem; day: string } | null;

// Nothing this week, but something later: a rest week in a running program, or a program or
// workout that starts later.
function WeekAhead({ next, monday }: { next: { item: PlanItem; day: string }; monday: string }) {
  const { item, day } = next;
  const when = longDate(dateOf(day));
  const running = !!item.program_starts_on && item.program_starts_on < monday;
  return (
    <EmptyState
      icon="calendar-outline"
      title={running ? 'Rest week' : 'Nothing planned this week'}
      message={
        running
          ? `${item.program_name || 'Your program'} carries on ${when}.`
          : `${item.program_name || item.workout_name} starts ${when}.`
      }
      testID="plan-week-ahead"
    />
  );
}

function Workouts({ plan, next, trainers }: { plan: PlanItem[]; next: Ahead; trainers: Trainer[] | null }) {
  const today = new Date();
  const todayKey = dayKey(today);
  const week = startOfWeek(today);
  const due = plan.filter((item) => dueOn(item, today));
  const anyDay = plan.filter((item) => !item.weekdays.length);
  const progress = weekProgress(plan, week);
  // Say who each workout is from when more than one trainer planned something.
  const manyTrainers = new Set(plan.map((p) => p.trainer_id)).size > 1;
  // The screen's one orange button: Start on the first workout still to do today.
  const main = due.find((item) => !item.done_on.includes(todayKey));
  const programs = programsIn(plan);

  if (!plan.length) {
    const single = trainers?.length === 1 ? firstName(trainerTitle(trainers[0])) : null;
    return (
      <View style={{ gap: Spacing.three }}>
        {next ? (
          <WeekAhead next={next} monday={dayKey(week)} />
        ) : (
          <EmptyState
            icon="barbell-outline"
            title="No workouts yet"
            message={`When ${single ?? 'your trainer'} adds workouts to your plan, they show up here, day by day.`}
            action={<TrainerAction trainers={trainers} />}
          />
        )}
        <Group>
          <ListRow
            title={HISTORY.label}
            subtitle="Your workouts and personal bests"
            leading={<IconTile icon="time-outline" />}
            onPress={HISTORY.onPress}
            last
          />
        </Group>
      </View>
    );
  }

  // One row per day of the week, and one per extra workout on a busy day. Only a day's first row shows
  // the day; the others keep it for VoiceOver.
  const rows: {
    key: string;
    day: string;
    date: string;
    showDay: boolean;
    today: boolean;
    item: PlanItem | null;
    done: boolean;
    until?: string | null;
  }[] = [];
  for (const d of WEEKDAYS) {
    const date = addDays(week, d.day - 1);
    const items = weekdayItems(plan, date);
    const isToday = sameDay(date, today);
    const base = { day: isToday ? 'Today' : d.short, date: String(date.getDate()), today: isToday };
    if (!items.length) rows.push({ key: `${d.day}`, ...base, showDay: true, item: null, done: false });
    items.forEach((item, i) =>
      rows.push({
        key: `${d.day}-${item.plan_item_id}`,
        ...base,
        showDay: i === 0,
        item,
        done: item.done_on.includes(dayKey(date)),
      }),
    );
  }
  // An any-day workout that stops before Sunday (its program was ended early) says until when.
  const sunday = dayKey(addDays(week, 6));
  anyDay.forEach((item, i) =>
    rows.push({
      key: `any-${item.plan_item_id}`,
      day: 'Any',
      date: 'day',
      showDay: i === 0,
      today: false,
      item,
      done: item.done_on.length > 0,
      until: item.ends_on && item.ends_on < sunday ? `Until ${shortDate(dateOf(item.ends_on))}` : null,
    }),
  );

  return (
    <>
      {programs.length ? (
        <View style={{ gap: Spacing.tight }}>
          {programs.map((p) => (
            <ProgramCard key={p.assignment_id} program={p} today={todayKey} showTrainer={manyTrainers} />
          ))}
        </View>
      ) : null}

      <Section title={`Today · ${dayMonth(today)}`} action={HISTORY}>
        {due.length ? (
          <View style={{ gap: Spacing.tight }}>
            {due.map((item) => (
              <WorkoutCard
                key={item.plan_item_id}
                item={item}
                done={item.done_on.includes(todayKey)}
                main={item === main}
                showTrainer={manyTrainers}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            compact
            icon="cafe-outline"
            title="Rest day"
            message="Nothing planned for today. Enjoy your rest day."
          />
        )}
      </Section>

      <View style={{ gap: Spacing.tight }}>
        <View style={styles.weekHeader}>
          <Text variant="label" tone="secondary" accessibilityRole="header" style={{ flex: 1 }}>
            This week
          </Text>
          <Text variant="footnote" tone="secondary" style={Tabular}>
            {`${progress.done} of ${progress.planned} done`}
          </Text>
          <View style={styles.weekBar}>
            <ProgressBar progress={progress.planned ? progress.done / progress.planned : 0} color={Colors.text} />
          </View>
        </View>
        <Group>
          {rows.map(({ key, ...row }, i) => (
            <WeekRow key={key} {...row} last={i === rows.length - 1} />
          ))}
        </Group>
      </View>
    </>
  );
}

// A program on the plan: where the client is in it. Not pressable: its workouts are the rows below.
function ProgramCard({ program, today, showTrainer }: { program: PlanProgram; today: string; showTrainer: boolean }) {
  const { week, weeks, last } = programWeek(program, today);
  const ends = dateOf(program.ends_on);
  const from = showTrainer ? firstName(trainerLabel(program)) : null;
  const where = last ? 'Last week' : `Week ${week} of ${weeks}`;
  return (
    <Card style={{ gap: Spacing.two }} testID={`plan-program-${program.assignment_id}`}>
      <View
        accessible
        accessibilityLabel={`Program${from ? ` from ${from}` : ''}: ${program.name}. ${where}, ends ${longDate(ends)}.`}
        style={{ gap: Spacing.one }}>
        <Text variant="label" tone="secondary">
          {from ? `Program · From ${from}` : 'Program'}
        </Text>
        <Text variant="headline" numberOfLines={2}>
          {program.name}
        </Text>
        <Text variant="footnote" tone="secondary" style={Tabular}>
          {`${where} · ends ${shortDate(ends)}`}
        </Text>
      </View>
      <ProgressBar progress={week / weeks} color={Colors.text} />
    </Card>
  );
}

// "Strength Base · Week 3" for a workout that came with a program.
function programLine(item: PlanItem, today: string) {
  if (!item.assignment_id || !item.program_name || !item.program_starts_on || !item.program_weeks) return null;
  const { week } = programWeek(
    { starts_on: item.program_starts_on, weeks: item.program_weeks, ends_on: item.program_ends_on },
    today,
  );
  return `${item.program_name} · Week ${week}`;
}

function WorkoutCard({
  item,
  done,
  main,
  showTrainer,
}: {
  item: PlanItem;
  done: boolean;
  main: boolean;
  showTrainer: boolean;
}) {
  const details = [
    item.exercise_count === 1 ? '1 exercise' : `${item.exercise_count} exercises`,
    showTrainer ? `With ${trainerLabel(item)}` : daysLabel(item.weekdays),
    programLine(item, dayKey(new Date())),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      onPress={() => openWorkout(item)}
      accessibilityLabel={`${item.workout_name}${done ? ', done today' : ''}`}
      footer={
        done ? null : (
          <Button
            title="Start"
            icon="play"
            size="medium"
            variant={main ? 'primary' : 'secondary'}
            accessibilityLabel={`Start ${item.workout_name}`}
            onPress={() => startWorkout(item)}
          />
        )
      }>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text variant="title" numberOfLines={2}>
            {item.workout_name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {details}
          </Text>
        </View>
        {done ? <StatusPill tone="success" label="Done" /> : null}
      </View>
      {item.note ? (
        <View style={styles.quote}>
          <Text variant="callout" tone="secondary" numberOfLines={3}>
            “{item.note}”
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function WeekRow({
  day,
  date,
  showDay,
  today,
  item,
  done,
  until,
  last,
}: {
  day: string;
  date: string;
  showDay: boolean;
  today: boolean;
  item: PlanItem | null;
  done: boolean;
  until?: string | null;
  last: boolean;
}) {
  // The day column grows with the text size, so "Today" never runs into the workout's name.
  const { fontScale } = useWindowDimensions();
  const leading = (
    <View style={[styles.weekDay, { minWidth: Math.round(44 * Math.min(Math.max(fontScale, 1), 2)) }]}>
      {showDay ? (
        <>
          <Text variant="footnote" tone={today ? 'primary' : 'secondary'} style={today && styles.today}>
            {day}
          </Text>
          <Text variant="footnote" tone="tertiary" style={Tabular}>
            {date}
          </Text>
        </>
      ) : null}
    </View>
  );
  if (!item) return <ListRow compact title="Rest" titleTone="tertiary" leading={leading} last={last} />;
  return (
    <ListRow
      compact
      title={item.workout_name}
      subtitle={until ?? undefined}
      leading={leading}
      trailing={done ? <Ionicons name="checkmark-circle" size={22} color={Colors.success} /> : null}
      accessibilityLabel={`${day === 'Today' ? 'Today' : `${day} ${date}`}: ${item.workout_name}${until ? `, ${until.toLowerCase()}` : ''}${done ? ', done' : ''}`}
      onPress={() => openWorkout(item)}
      last={last}
    />
  );
}

function Sessions({
  sessions,
  trainers,
  booking,
  when,
  onWhen,
  onChanged,
}: {
  sessions: Session[];
  trainers: Trainer[] | null;
  booking: Booking;
  when: When;
  onWhen: (when: When) => void;
  onChanged: () => void;
}) {
  // The open sheets, by id, so a reload shows what is true now.
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const now = new Date();
  const upcoming = sessions.filter((s) => s.status === 'scheduled' && endOf(s) > now);
  const shown =
    when === 'upcoming' ? upcoming : sessions.filter((s) => endOf(s) <= now || s.status !== 'scheduled').reverse();
  // The trainer's name only matters when there are several.
  const manyTrainers = new Set(sessions.map((s) => s.client_id)).size > 1 || (trainers?.length ?? 0) > 1;

  // Group by day, keeping the order.
  const days: { key: string; date: Date; items: Session[] }[] = [];
  for (const s of shown) {
    const date = new Date(s.starts_at);
    const key = dayKey(date);
    if (days.at(-1)?.key !== key) days.push({ key, date, items: [] });
    days.at(-1)!.items.push(s);
  }
  const single = trainers?.length === 1 ? firstName(trainerTitle(trainers[0])) : null;
  // The only trainer paused this person's sessions: they can't book, so the empty state says so.
  const paused = !!single && booking.infos[trainers![0].trainer_id]?.reason === 'paused';

  // The trainers who take bookings in the app from this person, in the order of their links.
  const bookable = (trainers ?? []).filter((t) => booking.infos[t.trainer_id]?.can_book);
  const bookFirst =
    bookable.length === 1 ? firstOf(booking.infos[bookable[0].trainer_id], firstName(trainerTitle(bookable[0]))) : null;
  const openBook = () =>
    router.push(bookable.length === 1 ? { pathname: '/book', params: { trainer: bookable[0].trainer_id } } : '/book');
  const waiting = booking.requests
    .filter((r) => r.status === 'pending' || r.status === 'expired')
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  // Times a trainer declined in the last 14 days, newest first, so an answer seen once can be found again.
  const declined = booking.requests
    .filter(
      (r) => r.status === 'declined' && now.getTime() - Date.parse(r.answered_at ?? r.created_at) < 14 * 86_400_000,
    )
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : a.starts_at > b.starts_at ? -1 : 0));
  // Nothing coming up and nothing waiting: the empty state holds the Book button instead of the card.
  const empty = upcoming.length === 0 && waiting.length === 0;
  const showCard = bookable.length > 0 && !(when === 'upcoming' && empty);
  const packs = booking.packs;

  const openedSession = openSession ? (sessions.find((s) => s.id === openSession) ?? null) : null;
  const openedRequest = openRequest ? (booking.requests.find((r) => r.id === openRequest) ?? null) : null;

  return (
    <>
      <AnswerNotice place="plan" testID="plan-answer" />
      {showCard ? (
        <Card hero testID="plan-book-card" style={{ gap: Spacing.one }}>
          <Text variant="headline">{bookFirst ? `Book with ${bookFirst}` : 'Book a session'}</Text>
          <Text variant="callout" tone="secondary">
            {bookFirst ? 'Pick a time that suits you.' : 'Pick a trainer and a time that suits you.'}
          </Text>
          <Button title="Book a session" onPress={openBook} testID="plan-book" style={{ marginTop: Spacing.three }} />
        </Card>
      ) : null}
      {packs.length ? <Packs packs={packs} many={new Set(packs.map((p) => p.trainer_id)).size > 1} /> : null}

      <Chips options={WHEN} value={when} onChange={(next) => next && onWhen(next)} />
      {when === 'upcoming' && waiting.length ? (
        <Section title="Waiting for an answer">
          <Group>
            {waiting.map((r, i) => (
              <WaitingRow
                key={r.id}
                request={r}
                showTrainer={manyTrainers}
                last={i === waiting.length - 1}
                onPress={() => setOpenRequest(r.id)}
              />
            ))}
          </Group>
        </Section>
      ) : null}
      {when === 'past' && declined.length ? (
        <Section title="Not booked">
          <Group>
            {declined.map((r, i) => (
              <WaitingRow
                key={r.id}
                request={r}
                showTrainer={manyTrainers}
                last={i === declined.length - 1}
                onPress={() => setOpenRequest(r.id)}
              />
            ))}
          </Group>
        </Section>
      ) : null}
      {days.length === 0 ? (
        when === 'upcoming' ? (
          waiting.length ? null : (
            <EmptyState
              icon="calendar-outline"
              title="Nothing booked"
              message={
                paused
                  ? `Your sessions with ${single} are paused. Sessions ${single} books for you show here.`
                  : bookable.length
                    ? `Sessions you book, or ${single ?? 'your trainer'} books for you, show here.`
                    : `Sessions ${single ?? 'your trainer'} books for you show here.`
              }
              action={
                bookable.length ? (
                  <Button title="Book a session" size="medium" onPress={openBook} testID="plan-book" />
                ) : (
                  <TrainerAction trainers={trainers} />
                )
              }
            />
          )
        ) : declined.length ? null : (
          <EmptyState compact icon="time-outline" title="No past sessions" message="Finished sessions show up here." />
        )
      ) : null}
      {days.map((d) => (
        <Section key={d.key} title={formatDay(d.date)}>
          <Group>
            {d.items.map((s, i) => (
              <SessionRow
                key={s.id}
                session={s}
                variant="grouped"
                showTrainer={manyTrainers}
                muted={when === 'past'}
                join={when === 'upcoming'}
                last={i === d.items.length - 1}
                onPress={() => setOpenSession(s.id)}
              />
            ))}
          </Group>
        </Section>
      ))}

      <SessionSheet session={openedSession} onClose={() => setOpenSession(null)} onChanged={onChanged} />
      <WaitingSheet request={openedRequest} onClose={() => setOpenRequest(null)} onChanged={onChanged} />
    </>
  );
}

// A time the person asked for: the day and time, when they asked, Waiting (or, muted, Expired when the
// time passed before the trainer answered, Declined when the trainer couldn't take it).
function WaitingRow({
  request,
  showTrainer,
  last,
  onPress,
}: {
  request: MyTimeRequest;
  showTrainer: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const start = new Date(request.starts_at);
  const end = new Date(start.getTime() + request.duration_minutes * 60_000);
  const expired = request.status === 'expired';
  const declined = request.status === 'declined';
  const asked = `asked ${ago(new Date(request.created_at))}`;
  const subtitle = showTrainer ? `With ${firstOf(request)} · ${asked}` : asked.charAt(0).toUpperCase() + asked.slice(1);
  // When it wraps beside the pill, it breaks after the day ("Mon 19 Oct ·" / "10:00–11:00"), never inside.
  const title = `${shortDate(start).replace(/ /g, '\u00a0')} · ${timeRange(start, end).replace('–', '\u2060–\u2060')}`;
  const pill = expired ? 'Expired' : declined ? 'Declined' : 'Waiting';
  return (
    <ListRow
      title={title}
      titleTone={expired || declined ? 'secondary' : undefined}
      titleStyle={Tabular}
      titleLines={2}
      subtitle={subtitle}
      status={<StatusPill tone="neutral" label={pill} />}
      onPress={onPress}
      accessibilityLabel={`${title}, ${subtitle}, ${pill}`}
      accessibilityHint="Opens the request"
      testID={`plan-waiting-${request.id}`}
      last={last}
    />
  );
}

// The person's packs of sessions: how many are left of how many, and until when. Never a price.
function Packs({ packs, many }: { packs: MyPack[]; many: boolean }) {
  return (
    <Group testID="plan-pack">
      {packs.map((p, i) => {
        const ends = p.expires_on ? dayFromKey(p.expires_on) : null;
        const title =
          p.ended && ends
            ? `Pack ended ${dayMonth(ends)}`
            : p.sessions_left === 0
              ? 'Pack used up'
              : `Your pack · ${p.sessions_left} of ${p.sessions_total} left`;
        const details = [
          p.ended ? `${p.used} of ${p.sessions_total} used` : ends ? `ends ${dayMonth(ends)}` : 'no end date',
          many ? `with ${firstOf(p)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <ListRow
            key={p.id}
            title={title}
            titleTone={p.ended ? 'secondary' : undefined}
            titleStyle={Tabular}
            leading={<IconTile icon="albums-outline" />}
            subtitle={
              <View style={{ gap: Spacing.two }}>
                <Text variant="footnote" tone="secondary" style={Tabular}>
                  {details.charAt(0).toUpperCase() + details.slice(1)}
                </Text>
                {p.ended ? null : (
                  <ProgressBar
                    progress={p.sessions_total ? p.sessions_left / p.sessions_total : 0}
                    color={Colors.text}
                  />
                )}
              </View>
            }
            accessibilityLabel={`${title}, ${details}`}
            testID={`plan-pack-${p.id}`}
            last={i === packs.length - 1}
          />
        );
      })}
    </Group>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.tight,
  },
  quote: {
    marginTop: Spacing.three,
    paddingLeft: Spacing.tight,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderStrong,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 22,
  },
  weekBar: {
    width: 56,
  },
  weekDay: {
    alignItems: 'flex-start',
  },
  today: {
    fontFamily: Fonts.textSemi,
  },
}));
