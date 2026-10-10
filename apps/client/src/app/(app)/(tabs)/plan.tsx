import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips } from '@/components/chips';
import { SessionRow } from '@/components/session-row';
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
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { dayMonth } from '@/lib/format';
import {
  daysLabel,
  dueOn,
  loadPlan,
  startOfWeek,
  trainerLabel,
  weekdayItems,
  WEEKDAYS,
  weekProgress,
  type PlanItem,
} from '@/lib/plan';
import { addDays, dayKey, endOf, formatDay, loadSessions, sameDay, type Session } from '@/lib/sessions';
import { loadTrainers, trainerTitle, type Trainer } from '@/lib/trainers';

type Tab = 'workouts' | 'sessions';
type When = 'upcoming' | 'past';

const WHEN: Record<When, string> = { upcoming: 'Upcoming', past: 'Past' };

// How far ahead and back the session lists reach.
const DAYS = 180;

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
  const [sessions, setSessions] = useState<Session[] | null>(null);
  // Only for the empty states' "Message {trainer}": a failure just leaves the action out.
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [when, setWhen] = useState<When>('upcoming');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);
  // The day the plan was loaded for: its ticks and "Today" belong to that day.
  const loadedFor = useRef('');

  // The plan and the sessions load on their own, so one failing doesn't hide the other,
  // and a failed refresh keeps what was already on screen.
  const load = useCallback(async () => {
    const now = new Date();
    loadedFor.current = dayKey(now);
    const [items, list, linked] = await Promise.all([
      loadPlan(now).catch(() => null),
      loadSessions(addDays(now, -DAYS), addDays(now, DAYS)).catch(() => null),
      loadTrainers().catch(() => null),
    ]);
    if (items) setPlan(items);
    if (list) setSessions(list);
    if (linked) setTrainers(linked);
    setError(items && list ? null : 'Could not load your plan. Check your internet connection.');
  }, []);

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
            <Workouts plan={plan} trainers={trainers} />
          ) : !error && showSkeleton ? (
            <SkeletonRows count={3} />
          ) : null
        ) : sessions ? (
          <Sessions sessions={sessions} trainers={trainers} when={when} onWhen={setWhen} />
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

function Workouts({ plan, trainers }: { plan: PlanItem[]; trainers: Trainer[] | null }) {
  const today = new Date();
  const todayKey = dayKey(today);
  const week = startOfWeek(today);
  const due = plan.filter((item) => dueOn(item, today));
  const anyDay = plan.filter((item) => !item.weekdays.length);
  const progress = weekProgress(plan);
  // Say who each workout is from when more than one trainer planned something.
  const manyTrainers = new Set(plan.map((p) => p.trainer_id)).size > 1;
  // The screen's one orange button: Start on the first workout still to do today.
  const main = due.find((item) => !item.done_on.includes(todayKey));

  if (!plan.length) {
    const single = trainers?.length === 1 ? firstName(trainerTitle(trainers[0])) : null;
    return (
      <View style={{ gap: Spacing.three }}>
        <EmptyState
          icon="barbell-outline"
          title="No workouts yet"
          message={`When ${single ?? 'your trainer'} adds workouts to your plan, they show up here, day by day.`}
          action={<TrainerAction trainers={trainers} />}
        />
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
  anyDay.forEach((item, i) =>
    rows.push({
      key: `any-${item.plan_item_id}`,
      day: 'Any',
      date: 'day',
      showDay: i === 0,
      today: false,
      item,
      done: item.done_on.length > 0,
    }),
  );

  return (
    <>
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
  ].join(' · ');
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
  last,
}: {
  day: string;
  date: string;
  showDay: boolean;
  today: boolean;
  item: PlanItem | null;
  done: boolean;
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
      leading={leading}
      trailing={done ? <Ionicons name="checkmark-circle" size={22} color={Colors.success} /> : null}
      accessibilityLabel={`${day === 'Today' ? 'Today' : `${day} ${date}`}: ${item.workout_name}${done ? ', done' : ''}`}
      onPress={() => openWorkout(item)}
      last={last}
    />
  );
}

function Sessions({
  sessions,
  trainers,
  when,
  onWhen,
}: {
  sessions: Session[];
  trainers: Trainer[] | null;
  when: When;
  onWhen: (when: When) => void;
}) {
  const now = new Date();
  const shown = sessions.filter((s) =>
    when === 'upcoming' ? s.status === 'scheduled' && endOf(s) > now : endOf(s) <= now || s.status !== 'scheduled',
  );
  if (when === 'past') shown.reverse();
  // The trainer's name only matters when there are several.
  const manyTrainers = new Set(sessions.map((s) => s.client_id)).size > 1;

  // Group by day, keeping the order.
  const days: { key: string; date: Date; items: Session[] }[] = [];
  for (const s of shown) {
    const date = new Date(s.starts_at);
    const key = dayKey(date);
    if (days.at(-1)?.key !== key) days.push({ key, date, items: [] });
    days.at(-1)!.items.push(s);
  }
  const single = trainers?.length === 1 ? firstName(trainerTitle(trainers[0])) : null;

  return (
    <>
      <Chips options={WHEN} value={when} onChange={(next) => next && onWhen(next)} />
      {days.length === 0 ? (
        when === 'upcoming' ? (
          <EmptyState
            icon="calendar-outline"
            title="Nothing booked"
            message={`Sessions ${single ?? 'your trainer'} books for you show up here.`}
            action={<TrainerAction trainers={trainers} />}
          />
        ) : (
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
              />
            ))}
          </Group>
        </Section>
      ))}
    </>
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
