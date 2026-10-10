import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PlanVideo } from '@/components/plan-video';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  Section,
  Skeleton,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import {
  isUnderway,
  readActiveWorkout,
  rememberPlanWorkout,
  saveActiveWorkout,
  startWorkout,
  type ActiveWorkout,
} from '@/lib/active-workout';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import {
  daysLabel,
  EQUIPMENT,
  loadPlan,
  loadPlanWorkout,
  markDone,
  MUSCLE_GROUPS,
  trainerLabel,
  undoDone,
  type PlanExercise,
  type PlanItem,
} from '@/lib/plan';
import { within } from '@/lib/serial';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { restLabel, weightLabel, type WeightUnit } from '@/lib/units';
import { loadLastSets, loadPersonalBests, loggedOn, type LastSet, type PersonalBest } from '@/lib/workout-log';

// How long Start waits for last time's numbers and the bests before starting without them.
const EXTRAS_MS = 4_000;

// One workout from the client's plan: its exercises with sets, reps, weight, rest,
// notes and demo videos, Start workout to log the sets, and a quick tick for today.
export default function PlanWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The workout on the phone, read each time this screen shows.
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const [starting, setStarting] = useState(false);
  const [item, setItem] = useState<PlanItem | null>(null);
  const [exercises, setExercises] = useState<PlanExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  // Loaded each time the screen shows, so coming back from a saved workout shows it done
  // today. A failed reload keeps what is on screen.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (userId) {
        readActiveWorkout(userId).then((w) => {
          if (alive) setActive(w);
        });
      }
      Promise.all([loadPlan(), loadPlanWorkout(id)]).then(
        ([plan, list]) => {
          if (!alive) return;
          const found = plan.find((p) => p.plan_item_id === id);
          if (!found) {
            setItem(null);
            setExercises(null);
            return setError('This workout is no longer in your plan.');
          }
          setItem(found);
          setExercises(list);
          setDoneToday(found.done_on.includes(dayKey(new Date())));
          // A copy on the phone, so the workout can be started with no signal.
          if (userId) rememberPlanWorkout(userId, found, list);
        },
        (e: unknown) => {
          if (alive) setError(plainError(e, 'Could not load this workout.'));
        },
      );
      return () => {
        alive = false;
      };
    }, [id, userId]),
  );

  // Builds the workout from what this screen loaded, so it starts with no signal too.
  async function start() {
    if (!userId || !item || !exercises || starting) return;
    setStarting(true);
    setProblem(null);
    const stored = await readActiveWorkout(userId);
    if (stored && isUnderway(stored)) {
      // This workout is already going and carries on, or a different one is in progress and
      // the live screen asks what to do. Either way the sets on the phone are kept.
      setStarting(false);
      return router.push({ pathname: '/workouts/live', params: { plan: id } });
    }
    // Last time's numbers and the bests are extras: a slow connection doesn't hold up the start.
    const names = exercises.map((e) => e.exercise_name);
    const [last, bests] = await Promise.all([
      within(loadLastSets(names), EXTRAS_MS).catch(() => new Map<string, LastSet[]>()),
      within(loadPersonalBests(), EXTRAS_MS).catch((): PersonalBest[] => []),
    ]);
    await saveActiveWorkout(startWorkout({ userId, item, exercises, last, bests, unit: settings.units }));
    setStarting(false);
    router.push({ pathname: '/workouts/live', params: { plan: id } });
  }

  async function undo() {
    const today = dayKey(new Date());
    setBusy(true);
    const logged = await loggedOn(id, today).catch(() => false);
    setBusy(false);
    if (logged && !(await confirm('Undo done today?', 'Your logged workout stays in your history.', 'Undo'))) return;
    await setDone(false);
  }

  async function setDone(done: boolean) {
    const today = dayKey(new Date());
    setBusy(true);
    setProblem(null);
    try {
      if (done) await markDone(id, today);
      else await undoDone(id, today);
      setDoneToday(done);
    } catch {
      setProblem('That didn’t save. Check your connection and try again.');
    }
    setBusy(false);
  }

  if (!item || !exercises) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: '' }} />
        {error ? (
          <EmptyState
            icon="barbell-outline"
            title="Workout unavailable"
            message={error}
            action={<Button title="Back to your plan" variant="secondary" size="medium" onPress={backToPlan} />}
          />
        ) : showSkeleton ? (
          <View accessible accessibilityLabel="Loading" style={{ gap: Spacing.four }}>
            <View style={{ gap: Spacing.tight }}>
              <Skeleton width="70%" height={28} />
              <Skeleton width="45%" height={14} radius={7} />
            </View>
            <SkeletonRows count={3} avatar />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const trainer = trainerLabel(item);
  const first = trainer.split(' ')[0] || trainer;
  // This workout is on the phone, being done or waiting to be saved.
  const resume = !!active && active.planItemId === id && isUnderway(active);
  const count = exercises.length === 1 ? '1 exercise' : `${exercises.length} exercises`;
  return (
    <View style={styles.screen}>
      {/* The name shows once, big, on the page; the bar above it stays empty. */}
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.tight }}>
          <Text variant="largeTitle" accessibilityRole="header">
            {item.workout_name}
          </Text>
          <View style={styles.meta}>
            <Avatar url={item.trainer_avatar} name={trainer} size={24} />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {`From ${trainer} · ${daysLabel(item.weekdays)}${item.weekdays.length ? '' : ', once a week'}`}
            </Text>
          </View>
        </View>

        {item.note ? (
          <View style={styles.quote}>
            <Text variant="label" tone="secondary">
              From {first}
            </Text>
            <Text variant="callout">{item.note}</Text>
          </View>
        ) : null}
        {item.workout_notes ? <Body secondary>{item.workout_notes}</Body> : null}

        {item.workout_video_path ? (
          <Card style={{ paddingVertical: Spacing.tight }}>
            <PlanVideo path={item.workout_video_path} label="Workout video" title={item.workout_name} />
          </Card>
        ) : null}

        <Section title={count}>
          {exercises.length === 0 ? (
            <EmptyState
              compact
              icon="list-outline"
              title="No exercises yet"
              message={`${first} hasn’t added exercises to this workout yet.`}
            />
          ) : (
            <Group>
              {exercises.map((ex, index) => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  number={index + 1}
                  trainerUnits={item.trainer_units}
                  myUnits={settings.units}
                  last={index === exercises.length - 1}
                />
              ))}
            </Group>
          )}
        </Section>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.footerInner}>
          {problem ? <ErrorText>{problem}</ErrorText> : null}
          {resume ? (
            <Button
              title="Continue workout"
              onPress={() => router.push({ pathname: '/workouts/live', params: { plan: id } })}
              testID="start-workout"
            />
          ) : doneToday ? (
            <View style={styles.done}>
              <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">Done today</Text>
                <Text variant="footnote" tone="secondary">
                  Nice work. {first} can see it.
                </Text>
              </View>
              <Button title="Undo" variant="secondary" size="small" onPress={undo} loading={busy} />
            </View>
          ) : (
            <>
              <Button
                title="Start workout"
                icon="play"
                onPress={start}
                loading={starting}
                testID="start-workout"
                accessibilityLabel={`Start ${item.workout_name}`}
              />
              <Button title="Just tick it off" variant="ghost" onPress={() => setDone(true)} loading={busy} />
            </>
          )}
          {doneToday && !resume ? (
            <Button title="Log your sets" variant="ghost" onPress={start} loading={starting} testID="log-your-sets" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function backToPlan() {
  if (router.canGoBack()) router.back();
  else router.replace('/plan');
}

// "4 × 6–8 · 70 kg · 2 min rest": the whole prescription on one line (two on a small phone).
function prescription(ex: PlanExercise, trainerUnits: WeightUnit, myUnits: WeightUnit) {
  const parts = [ex.reps ? `${ex.sets} × ${ex.reps}` : ex.sets === 1 ? '1 set' : `${ex.sets} sets`];
  if (ex.weight) {
    const w = weightLabel(ex.weight, ex.weight_unit ?? trainerUnits, myUnits);
    parts.push(w.also ? `${w.value} (${w.also})` : w.value);
  }
  if (ex.rest_seconds != null) parts.push(`${restLabel(ex.rest_seconds)} rest`);
  return parts.join(' · ');
}

function ExerciseRow({
  exercise: ex,
  number,
  trainerUnits,
  myUnits,
  last,
}: {
  exercise: PlanExercise;
  number: number;
  trainerUnits: WeightUnit;
  myUnits: WeightUnit;
  last: boolean;
}) {
  const kind = [MUSCLE_GROUPS[ex.muscle_group], EQUIPMENT[ex.equipment]].filter(Boolean).join(' · ');
  return (
    <View style={styles.exercise}>
      <View style={styles.thumb}>
        <Text variant="title" tone="secondary" style={Tabular}>
          {number}
        </Text>
      </View>
      <View style={[styles.exerciseBody, !last && styles.line]}>
        <Text variant="rowTitle">{ex.exercise_name}</Text>
        {kind ? (
          <Text variant="footnote" tone="secondary">
            {kind}
          </Text>
        ) : null}
        <Text variant="callout" style={[Tabular, { fontFamily: Fonts.textMedium, marginTop: Spacing.one }]}>
          {prescription(ex, trainerUnits, myUnits)}
        </Text>
        {ex.notes ? (
          <Text variant="footnote" style={{ marginTop: Spacing.one }}>
            {ex.notes}
          </Text>
        ) : null}
        {ex.instructions ? (
          <Text variant="footnote" tone="secondary">
            {ex.instructions}
          </Text>
        ) : null}
        {ex.video_path ? <PlanVideo path={ex.video_path} label="Demo video" title={ex.exercise_name} /> : null}
      </View>
    </View>
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
    paddingTop: Spacing.two,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quote: {
    gap: Spacing.one,
    paddingLeft: Spacing.tight,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderStrong,
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: Spacing.gutter,
  },
  thumb: {
    width: 56,
    height: 56,
    marginTop: Spacing.tight,
    marginRight: Spacing.tight,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  exerciseBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: Spacing.tight,
    paddingRight: Spacing.gutter,
  },
  line: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  footer: {
    paddingTop: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerInner: {
    width: '100%',
    maxWidth: Layout.maxClient - Spacing.gutter * 2,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 52,
  },
}));
