import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ElapsedClock } from '@/components/elapsed-clock';
import { ExerciseCard } from '@/components/exercise-card';
import { RestTimer } from '@/components/rest-timer';
import { Sheet } from '@/components/sheet';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Section,
  Skeleton,
  StatStrip,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Radius, Spacing, themed, withAlpha } from '@/constants/theme';
import {
  canStillSave,
  clearActiveWorkout,
  convertUnits,
  FinishError,
  finishPayload,
  hasUntickedNumbers,
  isUnderway,
  readActiveWorkout,
  recallPlanWorkout,
  rememberPlanWorkout,
  saveActiveWorkout,
  setCounts,
  startWorkout,
  tickAll,
  tickSet,
  type ActiveExercise,
  type ActiveWorkout,
} from '@/lib/active-workout';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { weekdayDayMonth } from '@/lib/days';
import { saveError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { cancelRestAlert, scheduleRestAlert } from '@/lib/notify';
import { loadPlan, loadPlanWorkout, type PlanExercise, type PlanItem } from '@/lib/plan';
import {
  buzz,
  LATE_MS,
  loadRestSound,
  playRestBeep,
  prepareRestBeep,
  releaseRestBeep,
  saveRestSound,
  unlockRestBeep,
} from '@/lib/rest-timer';
import { within } from '@/lib/serial';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { formatNumber, fromKg, type WeightUnit } from '@/lib/units';
import {
  durationLabel,
  finishWorkout,
  loadLastSets,
  loadPersonalBests,
  loadWorkoutLog,
  recordLabel,
  topRecords,
  volumeKg,
  type LastSet,
  type NewRecord,
  type PersonalBest,
} from '@/lib/workout-log';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  // Nothing on the phone and no workout asked for.
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'gone' }
  | { kind: 'noExercises' }
  // A different workout is in progress on the phone.
  | { kind: 'conflict'; stored: ActiveWorkout; nextName: string | null };

type Saved = {
  name: string;
  minutes: number;
  sets: number;
  volumeKg: number;
  ticked: boolean;
  records: NewRecord[];
};

// The "Rest over" alert for a locked phone. One at a time; cancelling waits for the
// scheduling, so a quick lock and unlock can't leave one behind.
let restAlert: Promise<string | null> | null = null;

function scheduleRestOver(at: number) {
  clearRestOver();
  restAlert = scheduleRestAlert(new Date(at));
}

function clearRestOver() {
  const pending = restAlert;
  restAlert = null;
  pending?.then(cancelRestAlert);
}

// A rest that ended while the phone or tab slept is cleared without a sound.
function withoutLateRest(workout: ActiveWorkout | null): ActiveWorkout | null {
  if (!workout || workout.restEndsAt === null || workout.restEndsAt + LATE_MS >= Date.now()) return workout;
  return { ...workout, restEndsAt: null, restTotal: null };
}

// A workout opened earlier but never touched starts now: its clock and its day are from when
// the person really begins, not from when they first looked at it.
function begunNow(workout: ActiveWorkout): ActiveWorkout {
  if (isUnderway(workout)) return workout;
  return {
    ...workout,
    startedAt: Date.now(),
    day: dayKey(new Date()),
    restEndsAt: null,
    restTotal: null,
    lastTickAt: null,
  };
}

// The set the person is on: the next open set of the exercise they ticked last, else the first open
// set of the workout. Null once every set is ticked.
function currentSet(workout: ActiveWorkout): { exercise: number; set: number } | null {
  let latest = -1;
  let at = 0;
  workout.exercises.forEach((exercise, i) => {
    if (exercise.sets.every((s) => s.done)) return;
    const ticked = Math.max(0, ...exercise.sets.map((s) => s.doneAt ?? 0));
    if (ticked > at) {
      at = ticked;
      latest = i;
    }
  });
  const exercise = latest >= 0 ? latest : workout.exercises.findIndex((e) => e.sets.some((s) => !s.done));
  if (exercise < 0) return null;
  return { exercise, set: workout.exercises[exercise].sets.findIndex((s) => !s.done) };
}

type Fresh =
  | { kind: 'ready'; workout: ActiveWorkout; fromPhone: boolean }
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'noExercises' };

// How long to wait for the plan before using the copy on the phone, and for last time's
// numbers and the bests before starting without them. A weak gym connection can hang for
// minutes rather than fail.
const PLAN_MS = 6_000;
const EXTRAS_MS = 4_000;
// Checking whether a save that seemed to fail went through after all.
const CHECK_MS = 10_000;

// A new workout from the plan. Without a connection it uses the copy kept on the phone the
// last time this workout was opened.
async function freshWorkout(userId: string, planItemId: string, unit: WeightUnit): Promise<Fresh> {
  let item: PlanItem;
  let exercises: PlanExercise[];
  let fromPhone = false;
  try {
    const [plan, list] = await within(Promise.all([loadPlan(), loadPlanWorkout(planItemId)]), PLAN_MS);
    const found = plan.find((p) => p.plan_item_id === planItemId);
    if (!found) return { kind: 'gone' };
    item = found;
    exercises = list;
    rememberPlanWorkout(userId, found, list);
  } catch {
    const copy = await recallPlanWorkout(userId, planItemId);
    if (!copy) return { kind: 'error' };
    item = copy.item;
    exercises = copy.exercises;
    fromPhone = true;
  }
  if (!exercises.length) return { kind: 'noExercises' };
  const names = exercises.map((e) => e.exercise_name);
  const [last, bests] = await Promise.all([
    within(loadLastSets(names), EXTRAS_MS).catch(() => new Map<string, LastSet[]>()),
    within(loadPersonalBests(), EXTRAS_MS).catch((): PersonalBest[] => []),
  ]);
  return { kind: 'ready', workout: startWorkout({ userId, item, exercises, last, bests, unit }), fromPhone };
}

async function workoutName(userId: string, planItemId: string) {
  const copy = await recallPlanWorkout(userId, planItemId);
  if (copy) return copy.item.workout_name;
  const plan = await loadPlan().catch(() => null);
  return plan?.find((p) => p.plan_item_id === planItemId)?.workout_name ?? null;
}

// Workout mode: the planned workout, set by set. The person types the weight and reps they did,
// ticks each set, rests between sets, and finishes to save it. Everything stays on the phone
// until it is saved, so closing the app loses nothing.
export default function LiveWorkout() {
  const params = useLocalSearchParams<{ plan?: string }>();
  const plan = typeof params.plan === 'string' && params.plan ? params.plan : null;
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { settings } = useSettings();
  const unit = settings.units;
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  // The screen stays on during a workout. On the web this uses the Wake Lock API where there is one.
  useKeepAwake('workout', { suppressDeactivateWarnings: true });

  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [fromPhone, setFromPhone] = useState(false);
  // Bumped by Try again and by discarding to start another workout.
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sound, setSound] = useState(true);
  const [finishing, setFinishing] = useState(false);
  // When the finish sheet was opened, for the time it shows.
  const [finishOpenedAt, setFinishOpenedAt] = useState(0);
  const [saving, setSaving] = useState(false);
  // Keep logging: asking whether the save that seemed to fail went through.
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Where each exercise card is, to scroll to the next one when an exercise is done.
  const cardY = useRef(new Map<number, number>());
  // The workout as last drawn, for the tick handler (which stays the same between draws).
  const latest = useRef<ActiveWorkout | null>(null);

  // Switched between kg and lb: weights are rebuilt from their kg, so nothing drifts.
  if (workout && workout.unit !== unit) setWorkout(convertUnits(workout, unit));

  // The phase is set to loading by whatever starts this again (Try again, Discard it).
  const startUp = useEffectEvent(
    async (person: string, planItemId: string | null, stored: ActiveWorkout | null, alive: () => boolean) => {
      if (stored && (!planItemId || stored.planItemId === planItemId)) {
        setWorkout(withoutLateRest(begunNow(stored)));
        setPhase({ kind: 'ready' });
        return;
      }
      if (stored && isUnderway(stored) && planItemId) {
        const nextName = await workoutName(person, planItemId);
        if (alive()) setPhase({ kind: 'conflict', stored, nextName });
        return;
      }
      if (!planItemId) {
        setPhase({ kind: 'empty' });
        return;
      }
      const fresh = await freshWorkout(person, planItemId, unit);
      if (!alive()) return;
      if (fresh.kind !== 'ready') return setPhase({ kind: fresh.kind });
      // Kept in memory only until the first tick or edit, so opening and leaving it leaves nothing behind.
      setWorkout(fresh.workout);
      setFromPhone(fresh.fromPhone);
      setPhase({ kind: 'ready' });
    },
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    readActiveWorkout(userId).then((stored) => {
      if (alive) startUp(userId, plan, stored, () => alive);
    });
    return () => {
      alive = false;
    };
  }, [userId, plan, attempt]);

  // Saved to the phone after every change once the person has done anything.
  useEffect(() => {
    latest.current = workout;
    if (!workout || saved || !(workout.touched || workout.finishedAt !== null)) return;
    saveActiveWorkout(workout);
  }, [workout, saved]);

  useEffect(() => {
    let alive = true;
    loadRestSound().then((on) => {
      if (alive) setSound(on);
    });
    prepareRestBeep();
    return () => {
      alive = false;
      releaseRestBeep();
      clearRestOver();
    };
  }, []);

  // Once Save has been tried the workout is locked until it is saved, or until Keep logging
  // finds it wasn't: a save whose answer was lost may have gone through, and a later save
  // with the same id would quietly drop anything added since.
  async function save(tickEverything = false) {
    if (!workout || !userId || saving) return;
    const ticked = tickEverything ? tickAll(workout) : workout;
    // The first tap fixes the finish time, so a retry sends the same workout.
    const next: ActiveWorkout = { ...ticked, touched: true, finishedAt: ticked.finishedAt ?? Date.now() };
    let payload;
    try {
      payload = finishPayload(next);
    } catch (e) {
      setProblem(e instanceof FinishError ? e.message : saveError(e));
      return;
    }
    setWorkout(next);
    setSaving(true);
    setProblem(null);
    try {
      const result = await finishWorkout(payload);
      haptic.success();
      setSaved({
        name: next.name,
        minutes: Math.max(0, Math.round((Date.parse(payload.finished_at) - Date.parse(payload.started_at)) / 60_000)),
        sets: payload.sets.length,
        volumeKg: volumeKg(payload.sets),
        ticked: result.ticked,
        records: topRecords(result.records),
      });
      setWorkout(null);
      setFinishing(false);
      clearRestOver();
      await clearActiveWorkout(userId, next.id);
    } catch (e) {
      // Still on the phone: the same button, or coming back online, tries again.
      setProblem(saveError(e));
    }
    setSaving(false);
  }

  // Back to logging after a save that didn't go through. If it went through after all, the
  // same save answers with what was saved.
  async function keepLogging() {
    if (!workout || saving || checking) return;
    const id = workout.id;
    setChecking(true);
    setProblem(null);
    let landed = false;
    try {
      landed = (await within(loadWorkoutLog(id), CHECK_MS)) !== null;
      if (!landed) setWorkout((w) => (w && w.id === id ? { ...w, finishedAt: null } : w));
    } catch {
      setProblem('Check your connection and try again.');
    }
    setChecking(false);
    if (landed) save();
  }

  // A save that didn't go through tries once more when the connection or the app comes back.
  // The workout is locked meanwhile, so it sends exactly what the person saved.
  function retrySave() {
    if (workout?.finishedAt != null && !saving && !checking && !saved) save();
  }

  useChatEvents((event) => {
    if (event.type === 'reconnected') retrySave();
  });

  const onAppState = useEffectEvent((state: AppStateStatus) => {
    if (state === 'background') {
      // Locked mid-rest: the phone says when it's over (only if notifications are allowed).
      if (workout?.restEndsAt && workout.restEndsAt > Date.now()) scheduleRestOver(workout.restEndsAt);
      return;
    }
    if (state === 'active') {
      clearRestOver();
      setWorkout(withoutLateRest);
      retrySave();
    }
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => onAppState(state));
    // Browsers pause timers in a hidden tab: back on it, a rest that ended meanwhile goes quietly.
    const visible = () => {
      if (document.visibilityState === 'visible') setWorkout(withoutLateRest);
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined')
      document.addEventListener('visibilitychange', visible);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visible);
      }
    };
  }, []);

  // Neither changes a locked workout (one that Save was tried on).
  const onChange = useCallback((index: number, next: ActiveExercise) => {
    setWorkout((w) =>
      w && w.finishedAt === null
        ? { ...w, touched: true, exercises: w.exercises.map((e, i) => (i === index ? next : e)) }
        : w,
    );
  }, []);

  const onTick = useCallback((index: number, setIndex: number, done: boolean) => {
    if (latest.current?.finishedAt != null) return;
    Keyboard.dismiss();
    // iPhone browsers only play the rest beep later if a sound started during a tap.
    if (done) unlockRestBeep();
    const before = latest.current;
    setWorkout((w) => (w && w.finishedAt === null ? tickSet(w, index, setIndex, done) : w));
    if (!done || !before) return;
    // The last set of an exercise: bring the next exercise into view.
    const exercise = before.exercises[index];
    const lastOfExercise = !!exercise && exercise.sets.every((s, j) => j === setIndex || s.done);
    const y = cardY.current.get(index + 1);
    if (lastOfExercise && y !== undefined)
      scroll.current?.scrollTo({ y: Math.max(0, y - Spacing.three), animated: true });
  }, []);

  const onLayoutY = useCallback((index: number, y: number) => {
    cardY.current.set(index, y);
  }, []);

  const addRest = useCallback(() => {
    setWorkout((w) =>
      w && w.restEndsAt !== null ? { ...w, restEndsAt: w.restEndsAt + 15_000, restTotal: (w.restTotal ?? 0) + 15 } : w,
    );
  }, []);

  const skipRest = useCallback(() => {
    clearRestOver();
    setWorkout((w) => (w && w.restEndsAt !== null ? { ...w, restEndsAt: null, restTotal: null } : w));
  }, []);

  function restDone() {
    buzz();
    if (sound) playRestBeep();
    AccessibilityInfo.announceForAccessibility('Rest over');
  }

  function toggleSound() {
    setSound(!sound);
    saveRestSound(!sound);
  }

  async function discard() {
    if (!workout || !userId) return;
    const sure = await confirm('Discard workout?', "The sets you ticked won't be saved.", 'Discard');
    if (!sure) return;
    const id = workout.id;
    setWorkout(null);
    setPhase({ kind: 'empty' });
    clearRestOver();
    await clearActiveWorkout(userId, id);
    goBack('/plan');
  }

  async function discardAndStart(stored: ActiveWorkout) {
    if (!userId) return;
    const sure = await confirm('Discard workout?', `The sets you ticked in ${stored.name} won't be saved.`, 'Discard');
    if (!sure) return;
    await clearActiveWorkout(userId, stored.id);
    setPhase({ kind: 'loading' });
    setAttempt((a) => a + 1);
  }

  const header = (
    <Stack.Screen
      options={{
        title: saved?.name ?? workout?.name ?? 'Workout',
        headerRight: workout && !saved ? () => <ElapsedClock startedAt={workout.startedAt} /> : undefined,
      }}
    />
  );

  if (saved) {
    const volume = fromKg(saved.volumeKg, unit);
    return (
      <ScrollView contentContainerStyle={[styles.content, styles.savedContent]}>
        {header}
        <View style={styles.savedTop}>
          <View style={styles.bigCheck}>
            <Ionicons name="checkmark" size={36} color={Colors.success} />
          </View>
          <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
            Workout saved
          </Text>
          {saved.ticked ? (
            <View style={styles.tickedRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
              <Text variant="callout" tone="secondary">
                Ticked off in your plan
              </Text>
            </View>
          ) : null}
        </View>
        <StatStrip
          items={[
            saved.minutes < 60
              ? { value: saved.minutes, label: saved.minutes === 1 ? 'Minute' : 'Minutes' }
              : {
                  value: `${Math.floor(saved.minutes / 60)}:${String(saved.minutes % 60).padStart(2, '0')}`,
                  label: 'Hours',
                  spoken: durationLabel(new Date(0).toISOString(), new Date(saved.minutes * 60_000).toISOString()),
                },
            { value: saved.sets, label: saved.sets === 1 ? 'Set' : 'Sets' },
            ...(volume > 0
              ? [
                  {
                    value: formatNumber(volume),
                    label: `${unit} lifted`,
                    spoken: `${formatNumber(volume)} ${unit} lifted`,
                  },
                ]
              : []),
          ]}
        />
        {saved.records.length ? (
          <Section title="New bests">
            <Group>
              {saved.records.map((r, i) => (
                <ListRow
                  key={`${r.exercise_name}-${r.kind}`}
                  title={r.exercise_name}
                  subtitle={
                    <Text variant="footnote" tone="secondary">
                      {recordLabel(r, unit)}
                    </Text>
                  }
                  leading={<IconTile icon="trophy-outline" color={Colors.text} />}
                  last={i === saved.records.length - 1}
                />
              ))}
            </Group>
          </Section>
        ) : null}
        <Button title="Done" onPress={() => goBack('/plan')} />
      </ScrollView>
    );
  }

  if (!userId || phase.kind === 'loading' || (phase.kind === 'ready' && !workout)) {
    return (
      <View style={styles.content}>
        {header}
        <LoadingWorkout />
      </View>
    );
  }

  if (phase.kind !== 'ready' || !workout) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {phase.kind === 'empty' ? (
          <EmptyState
            icon="barbell-outline"
            title="No workout in progress"
            message="Start one from your plan."
            action={<Button title="Go to your plan" onPress={() => router.navigate('/plan')} />}
          />
        ) : null}
        {phase.kind === 'error' ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this workout"
            message="Check your connection and try again."
            action={
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => {
                  setPhase({ kind: 'loading' });
                  setAttempt((a) => a + 1);
                }}
              />
            }
          />
        ) : null}
        {phase.kind === 'gone' ? (
          <EmptyState
            icon="calendar-outline"
            title="Not in your plan any more"
            message="Your trainer has taken this workout out of your plan."
            action={<Button title="Go to your plan" variant="secondary" onPress={() => router.navigate('/plan')} />}
          />
        ) : null}
        {phase.kind === 'noExercises' ? (
          <EmptyState
            icon="barbell-outline"
            title="No exercises yet"
            message="Your trainer hasn't added exercises to this workout yet."
          />
        ) : null}
        {phase.kind === 'conflict' ? (
          <Card style={{ gap: Spacing.tight }}>
            <Text variant="label" tone="secondary">
              Workout in progress
            </Text>
            <Text variant="headline">{phase.stored.name}</Text>
            <Body secondary>Finish or discard it before you start another one.</Body>
            <View style={{ gap: Spacing.tight, marginTop: Spacing.two }}>
              <Button title="Continue it" onPress={() => router.setParams({ plan: phase.stored.planItemId ?? '' })} />
              <Button
                title={`Discard it and start ${phase.nextName ?? 'this workout'}`}
                variant="secondary"
                onPress={() => discardAndStart(phase.stored)}
              />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  if (!canStillSave(workout)) {
    return (
      <View style={styles.content}>
        {header}
        <Card style={{ gap: Spacing.tight }}>
          <Text variant="headline">Too old to save</Text>
          <Body secondary>
            This workout from {weekdayDayMonth(workout.day)} is more than a week old, so it can&apos;t be saved.
          </Body>
          <Button title="Discard" variant="destructive" onPress={discard} style={{ marginTop: Spacing.two }} />
        </Card>
      </View>
    );
  }

  const { done, total } = setCounts(workout);
  const unticked = total - done;
  const locked = workout.finishedAt !== null;
  const current = locked ? null : currentSet(workout);
  const soFar = durationLabel(
    new Date(workout.startedAt).toISOString(),
    new Date(workout.finishedAt ?? Math.max(finishOpenedAt, workout.startedAt)).toISOString(),
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {fromPhone ? (
          <Text variant="footnote" tone="secondary">
            Using the copy of this workout saved on this phone.
          </Text>
        ) : null}
        {workout.planNote ? (
          <View style={styles.note}>
            <Text variant="label" tone="secondary">
              Note from {workout.trainerName ?? 'your trainer'}
            </Text>
            <Text variant="callout">{workout.planNote}</Text>
          </View>
        ) : null}
        {workout.exercises.map((exercise, index) => (
          <ExerciseCard
            key={exercise.key}
            exercise={exercise}
            index={index}
            unit={workout.unit}
            locked={locked}
            current={current?.exercise === index ? current.set : null}
            onChange={onChange}
            onTick={onTick}
            onLayoutY={onLayoutY}
          />
        ))}
        <Button
          title="Discard workout"
          variant="destructive"
          onPress={discard}
          testID="discard-workout"
          style={{ alignSelf: 'center' }}
        />
      </ScrollView>

      {workout.restEndsAt !== null ? (
        <RestTimer
          endsAt={workout.restEndsAt}
          total={workout.restTotal ?? 0}
          sound={sound}
          onAdd={addRest}
          onSkip={skipRest}
          onToggleSound={toggleSound}
          onDone={restDone}
        />
      ) : null}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {locked ? (
          <View style={[styles.footerInner, { gap: Spacing.two }]} testID="workout-not-saved">
            <Text variant="headline">Your workout isn&apos;t saved yet.</Text>
            <ErrorText>{problem}</ErrorText>
            <Button
              title="Save workout"
              testID="save-workout-again"
              onPress={() => save()}
              loading={saving}
              disabled={saving || checking}
            />
            <Button
              title="Keep logging"
              variant="secondary"
              testID="keep-logging"
              onPress={keepLogging}
              loading={checking}
              disabled={saving || checking}
            />
          </View>
        ) : (
          <View style={styles.footerInner}>
            {/* Secondary while sets are left (Log set is the orange button), primary once all are ticked. */}
            <Button
              title="Finish workout"
              variant={current ? 'secondary' : 'primary'}
              testID="finish-workout"
              onPress={() => {
                Keyboard.dismiss();
                setProblem(null);
                setFinishOpenedAt(Date.now());
                setFinishing(true);
              }}
            />
          </View>
        )}
      </View>

      <Sheet visible={finishing} onClose={() => setFinishing(false)} title="Finish workout">
        <Body secondary>
          {done} of {total} sets ticked · {soFar}
        </Body>
        <TextField
          label="Note for your trainers (optional)"
          value={workout.note}
          onChangeText={(note) => setWorkout((w) => (w && w.finishedAt === null ? { ...w, note, touched: true } : w))}
          editable={!locked}
          multiline
          maxLength={1000}
          style={{ minHeight: 88, paddingTop: Spacing.tight, textAlignVertical: 'top' }}
        />
        {unticked > 0 ? (
          <Text variant="footnote" tone="secondary">
            {unticked === 1
              ? "1 set isn't ticked off. It won't be saved."
              : `${unticked} sets aren't ticked off. They won't be saved.`}
          </Text>
        ) : null}
        <ErrorText>{problem}</ErrorText>
        <Button title="Save workout" testID="save-workout" onPress={() => save()} loading={saving} disabled={saving} />
        {!locked && hasUntickedNumbers(workout) ? (
          <Button
            title="Tick all and save"
            variant="secondary"
            testID="tick-all-save"
            onPress={() => save(true)}
            disabled={saving}
          />
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// The shape of an exercise card while the workout loads: a name, a line, and three set rows.
function LoadingWorkout() {
  const shown = useDelayed();
  if (!shown) return null;
  return (
    <View accessible accessibilityLabel="Loading" style={{ gap: Spacing.three }}>
      {[0, 1].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.tight }}>
            <Skeleton width={28} height={28} radius={14} />
            <Skeleton width="50%" height={16} />
          </View>
          <Skeleton width="70%" height={12} />
          {[0, 1, 2].map((j) => (
            <Skeleton key={j} height={44} radius={10} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.gutter,
    paddingBottom: Spacing.section,
    gap: Spacing.three,
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
  },
  savedContent: {
    paddingTop: Spacing.hero,
    gap: Spacing.section,
  },
  savedTop: {
    alignItems: 'center',
    gap: Spacing.tight,
  },
  bigCheck: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(Colors.success, 0.12),
  },
  tickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  note: {
    gap: Spacing.one,
    paddingLeft: Spacing.tight,
    paddingVertical: Spacing.one,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderStrong,
  },
  skeletonCard: {
    gap: Spacing.tight,
    padding: Spacing.gutter,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  footer: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerInner: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
  },
}));
