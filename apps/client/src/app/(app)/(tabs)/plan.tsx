import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { JoinCall } from '@/components/join-call';
import { SessionRow } from '@/components/session-row';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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

type Tab = 'workouts' | 'sessions';
type When = 'upcoming' | 'past';

// How far ahead and back the session lists reach.
const DAYS = 180;

function openWorkout(item: PlanItem) {
  router.push({ pathname: '/workouts/[id]', params: { id: item.plan_item_id } });
}

// The client's training: the workouts their trainers planned for today and this
// week, and their booked sessions. Reminders for a session open the sessions here.
export default function Plan() {
  const params = useLocalSearchParams<{ view?: string }>();
  const tab: Tab = params.view === 'sessions' ? 'sessions' : 'workouts';
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [when, setWhen] = useState<When>('upcoming');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The day the plan was loaded for: its ticks and "Today" belong to that day.
  const loadedFor = useRef('');

  // The plan and the sessions load on their own, so one failing doesn't hide the other,
  // and a failed refresh keeps what was already on screen.
  const load = useCallback(async () => {
    const now = new Date();
    loadedFor.current = dayKey(now);
    const [items, list] = await Promise.all([
      loadPlan(now).catch(() => null),
      loadSessions(addDays(now, -DAYS), addDays(now, DAYS)).catch(() => null),
    ]);
    if (items) setPlan(items);
    if (list) setSessions(list);
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
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      <View style={styles.segmented}>
        {(['workouts', 'sessions'] as const).map((key) => {
          const selected = key === tab;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => router.setParams({ view: key })}
              style={[styles.segment, selected && { backgroundColor: Colors.accent }]}>
              <Text style={[styles.segmentText, selected && { color: Colors.onAccent }]}>
                {key === 'workouts' ? 'Workouts' : 'Sessions'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* A web page can't be pulled down to refresh, so there's always a button. */}
      {error ? (
        <View style={{ gap: Spacing.two }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={retry} loading={retrying} />
        </View>
      ) : null}
      {tab === 'workouts' ? (
        plan ? (
          <Workouts plan={plan} />
        ) : !error ? (
          <ActivityIndicator color={Colors.accentText} />
        ) : null
      ) : sessions ? (
        <Sessions sessions={sessions} when={when} onWhen={setWhen} />
      ) : !error ? (
        <ActivityIndicator color={Colors.accentText} />
      ) : null}
    </ScrollView>
  );
}

function Workouts({ plan }: { plan: PlanItem[] }) {
  const today = new Date();
  const todayKey = dayKey(today);
  const week = startOfWeek(today);
  const due = plan.filter((item) => dueOn(item, today));
  const anyDay = plan.filter((item) => !item.weekdays.length);
  const progress = weekProgress(plan);
  // Say who each workout is from when more than one trainer planned something.
  const manyTrainers = new Set(plan.map((p) => p.trainer_id)).size > 1;

  if (!plan.length) {
    return (
      <Card style={{ gap: Spacing.three, alignItems: 'center', paddingVertical: Spacing.five }}>
        <View style={styles.emptyIcon}>
          <Ionicons name="barbell" size={28} color={Colors.accentText} />
        </View>
        <Text style={styles.cardTitle}>No workouts yet</Text>
        <Body secondary style={{ textAlign: 'center' }}>
          When your trainer adds workouts to your plan, they show up here, day by day.
        </Body>
      </Card>
    );
  }

  return (
    <>
      <View style={{ gap: Spacing.two }}>
        <View style={styles.header}>
          <Text style={[styles.heading, { flex: 1 }]}>Today</Text>
          <Text style={styles.date}>
            {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        {due.length ? (
          due.map((item) => (
            <WorkoutCard
              key={item.plan_item_id}
              item={item}
              done={item.done_on.includes(todayKey)}
              showTrainer={manyTrainers}
            />
          ))
        ) : (
          <Card>
            <Body secondary>Nothing planned for today. Enjoy your rest day!</Body>
          </Card>
        )}
      </View>

      <View style={{ gap: Spacing.two }}>
        <View style={styles.header}>
          <Text style={[styles.heading, { flex: 1 }]}>This week</Text>
          <Text style={styles.progress}>
            Done {progress.done} of {progress.planned}
          </Text>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((d) => {
            const date = addDays(week, d.day - 1);
            const isToday = sameDay(date, today);
            return (
              <WeekRow
                key={d.day}
                label={d.short}
                date={String(date.getDate())}
                isToday={isToday}
                items={weekdayItems(plan, date).map((item) => ({ item, done: item.done_on.includes(dayKey(date)) }))}
              />
            );
          })}
          {anyDay.length ? (
            <WeekRow label="Any" date="day" items={anyDay.map((item) => ({ item, done: item.done_on.length > 0 }))} />
          ) : null}
        </View>
      </View>
    </>
  );
}

function WorkoutCard({ item, done, showTrainer }: { item: PlanItem; done: boolean; showTrainer: boolean }) {
  const details = [
    showTrainer ? `With ${trainerLabel(item)}` : daysLabel(item.weekdays),
    item.exercise_count === 1 ? '1 exercise' : `${item.exercise_count} exercises`,
  ].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.workout_name}${done ? ', done today' : ''}`}
      onPress={() => openWorkout(item)}
      style={({ pressed }) => [styles.workout, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={[styles.workoutIcon, done && { backgroundColor: Colors.accent }]}>
        <Ionicons name={done ? 'checkmark' : 'barbell'} size={22} color={done ? Colors.onAccent : Colors.accentText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.workoutName}>{item.workout_name}</Text>
        <Body secondary style={{ fontSize: 13 }}>
          {done ? 'Done today' : details}
        </Body>
        {item.note ? (
          <Text style={styles.note} numberOfLines={2}>
            “{item.note}”
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

function WeekRow({
  label,
  date,
  isToday,
  items,
}: {
  label: string;
  date: string;
  isToday?: boolean;
  items: { item: PlanItem; done: boolean }[];
}) {
  return (
    <View style={[styles.weekRow, isToday && { backgroundColor: Colors.surface }]}>
      <View style={styles.weekDay}>
        <Text style={[styles.weekDayName, isToday && { color: Colors.accentText }]}>{label}</Text>
        <Text style={styles.weekDate}>{date}</Text>
      </View>
      <View style={styles.weekItems}>
        {items.length ? (
          items.map(({ item, done }) => (
            <Pressable
              key={item.plan_item_id}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${date}: ${item.workout_name}${done ? ', done' : ''}`}
              onPress={() => openWorkout(item)}
              style={({ pressed }) => [styles.pill, done && styles.pillDone, pressed && { opacity: 0.7 }]}>
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={done ? Colors.onAccent : Colors.textSecondary}
              />
              <Text style={[styles.pillText, done && { color: Colors.onAccent }]} numberOfLines={1}>
                {item.workout_name}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.rest}>Rest</Text>
        )}
      </View>
    </View>
  );
}

function Sessions({ sessions, when, onWhen }: { sessions: Session[]; when: When; onWhen: (when: When) => void }) {
  const now = new Date();
  const shown = sessions.filter((s) =>
    when === 'upcoming' ? s.status === 'scheduled' && endOf(s) > now : endOf(s) <= now || s.status !== 'scheduled',
  );
  if (when === 'past') shown.reverse();

  // Group by day, keeping the order.
  const days: { key: string; date: Date; items: Session[] }[] = [];
  for (const s of shown) {
    const date = new Date(s.starts_at);
    const key = dayKey(date);
    if (days.at(-1)?.key !== key) days.push({ key, date, items: [] });
    days.at(-1)!.items.push(s);
  }

  return (
    <>
      <View style={styles.pills}>
        {(['upcoming', 'past'] as const).map((key) => {
          const selected = key === when;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onWhen(key)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && { color: Colors.onAccent }]}>
                {key === 'upcoming' ? 'Upcoming' : 'Past'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {days.length === 0 ? (
        <Card>
          <Body secondary>
            {when === 'upcoming'
              ? 'Nothing booked yet. Sessions your trainer books will show here.'
              : 'Your finished sessions will show here.'}
          </Body>
        </Card>
      ) : null}
      {days.map((d) => (
        <View key={d.key} style={{ gap: Spacing.two }}>
          <Text style={styles.day}>{formatDay(d.date)}</Text>
          {d.items.map((s) => (
            <View key={s.id} style={{ gap: Spacing.two }}>
              <SessionRow session={s} />
              <JoinCall session={s} />
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  segmented: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  segmentText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  heading: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  date: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  progress: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '800',
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  workout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  workoutIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  workoutName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  note: {
    color: Colors.text,
    fontSize: 14,
    fontStyle: 'italic',
  },
  week: {
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  weekDay: {
    width: 40,
    alignItems: 'center',
  },
  weekDayName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  weekDate: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  weekItems: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surfaceRaised,
  },
  pillDone: {
    backgroundColor: Colors.accent,
  },
  pillText: {
    flexShrink: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rest: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  pills: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  day: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
}));
