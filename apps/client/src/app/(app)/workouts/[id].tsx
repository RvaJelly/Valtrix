import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PlanVideo } from '@/components/plan-video';
import { Body, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { restLabel, weightLabel } from '@/lib/units';
import { loadLastSets, loadPersonalBests, loggedOn } from '@/lib/workout-log';

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

  useEffect(() => {
    Promise.all([loadPlan(), loadPlanWorkout(id)])
      .then(([plan, list]) => {
        const found = plan.find((p) => p.plan_item_id === id);
        if (!found) return setError('This workout is no longer in your plan.');
        setItem(found);
        setExercises(list);
        setDoneToday(found.done_on.includes(dayKey(new Date())));
        // A copy on the phone, so the workout can be started with no signal.
        if (userId) rememberPlanWorkout(userId, found, list);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load this workout.'));
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      readActiveWorkout(userId).then((w) => {
        if (alive) setActive(w);
      });
      return () => {
        alive = false;
      };
    }, [userId]),
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
    const names = exercises.map((e) => e.exercise_name);
    const [last, bests] = await Promise.all([
      loadLastSets(names).catch(() => new Map()),
      loadPersonalBests().catch(() => []),
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
      <View style={{ padding: Spacing.four }}>
        <Stack.Screen options={{ title: 'Workout' }} />
        {error ? <Body secondary>{error}</Body> : <ActivityIndicator color={Colors.accentText} />}
      </View>
    );
  }

  const trainer = trainerLabel(item);
  // This workout is on the phone, being done or waiting to be saved.
  const resume = !!active && active.planItemId === id && isUnderway(active);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: item.workout_name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.title}>{item.workout_name}</Text>
          <View style={styles.meta}>
            <Avatar url={item.trainer_avatar} name={trainer} size={28} />
            <Text style={styles.metaText}>From {trainer}</Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              {daysLabel(item.weekdays)}
              {item.weekdays.length ? '' : ', once a week'}
            </Text>
          </View>
        </View>

        {item.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Note from {trainer}</Text>
            <Body>{item.note}</Body>
          </View>
        ) : null}
        {item.workout_notes ? <Body secondary>{item.workout_notes}</Body> : null}

        {item.workout_video_path ? (
          <Card>
            <PlanVideo path={item.workout_video_path} label="Workout video" title={item.workout_name} />
          </Card>
        ) : null}

        <Text style={styles.section}>{exercises.length === 1 ? '1 exercise' : `${exercises.length} exercises`}</Text>
        {exercises.length === 0 ? (
          <Card>
            <Body secondary>Your trainer hasn&apos;t added exercises to this workout yet.</Body>
          </Card>
        ) : null}
        {exercises.map((ex, index) => (
          <Card key={ex.id} style={{ gap: Spacing.three }}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.number}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                <Body secondary style={{ fontSize: 13 }}>
                  {[MUSCLE_GROUPS[ex.muscle_group], EQUIPMENT[ex.equipment]].filter(Boolean).join(' · ')}
                </Body>
              </View>
            </View>
            <Stats
              stats={[
                { label: 'Sets', value: String(ex.sets) },
                { label: 'Reps', value: ex.reps },
                ex.weight
                  ? {
                      label: 'Weight',
                      ...weightLabel(ex.weight, ex.weight_unit ?? item.trainer_units, settings.units),
                    }
                  : null,
                ex.rest_seconds != null ? { label: 'Rest', value: restLabel(ex.rest_seconds) } : null,
              ]}
            />
            {ex.notes ? <Body style={{ fontSize: 15 }}>{ex.notes}</Body> : null}
            {ex.instructions ? (
              <Body secondary style={{ fontSize: 14 }}>
                {ex.instructions}
              </Body>
            ) : null}
            {ex.video_path ? <PlanVideo path={ex.video_path} label="Demo video" title={ex.exercise_name} /> : null}
          </Card>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        {resume ? (
          <Button
            title="Continue workout"
            onPress={() => router.push({ pathname: '/workouts/live', params: { plan: id } })}
            testID="start-workout"
          />
        ) : doneToday ? (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={28} color={Colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.doneTitle}>Done today</Text>
              <Body secondary style={{ fontSize: 13 }}>
                Nice work! {trainer} can see it.
              </Body>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo"
              onPress={undo}
              disabled={busy}
              hitSlop={8}
              style={({ pressed }) => [styles.undo, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              {busy ? (
                <ActivityIndicator size="small" color={Colors.accentText} />
              ) : (
                <Text style={styles.undoText}>Undo</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <Button
              title="Start workout"
              onPress={start}
              loading={starting}
              testID="start-workout"
              accessibilityLabel={`Start ${item.workout_name}`}
            />
            <Button title="Just tick it off" variant="secondary" onPress={() => setDone(true)} loading={busy} />
          </>
        )}
        {doneToday && !resume ? (
          <Button title="Log your sets" variant="ghost" onPress={start} loading={starting} testID="log-your-sets" />
        ) : null}
      </View>
    </View>
  );
}

type StatProps = { label: string; value: string; also?: string };

// Two boxes to a row, so values like "20-25 lb" or "2:30 min" show in full on small phones.
function Stats({ stats }: { stats: (StatProps | null)[] }) {
  const shown = stats.filter((s): s is StatProps => !!s);
  const rows: StatProps[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));
  return (
    <View style={styles.stats}>
      {rows.map((row) => (
        <View key={row[0].label} style={styles.statRow}>
          {row.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
          {/* A box on its own stays the same size as the ones above it. */}
          {row.length === 1 ? <View style={styles.statSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

function Stat({ label, value, also }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      {also ? <Text style={styles.statAlso}>{also}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  noteBox: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  noteTitle: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
    overflow: 'hidden',
  },
  exerciseName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  stats: {
    gap: Spacing.two,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  // Same padding as a box, so both halves of the row get the same width.
  statSpacer: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
  statValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  statAlso: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
  },
  doneTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  undo: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '800',
  },
  problem: {
    color: Colors.danger,
    fontSize: 14,
  },
}));
