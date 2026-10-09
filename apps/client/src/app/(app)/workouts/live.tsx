import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ElapsedClock } from '@/components/elapsed-clock';
import { ExerciseCard } from '@/components/exercise-card';
import { RestTimer } from '@/components/rest-timer';
import { Sheet } from '@/components/sheet';
import { Body, Button, Card, EmptyState, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
import { useSettings } from '@/lib/settings';
import { formatNumber, fromKg, type WeightUnit } from '@/lib/units';
import {
  durationLabel,
  finishWorkout,
  loadLastSets,
  loadPersonalBests,
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
  duration: string;
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

type Fresh =
  | { kind: 'ready'; workout: ActiveWorkout; fromPhone: boolean }
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'noExercises' };

// A new workout from the plan. Without a connection it uses the copy kept on the phone the
// last time this workout was opened.
async function freshWorkout(userId: string, planItemId: string, unit: WeightUnit): Promise<Fresh> {
  let item: PlanItem;
  let exercises: PlanExercise[];
  let fromPhone = false;
  try {
    const [plan, list] = await Promise.all([loadPlan(), loadPlanWorkout(planItemId)]);
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
    loadLastSets(names).catch(() => new Map<string, LastSet[]>()),
    loadPersonalBests().catch((): PersonalBest[] => []),
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
        setWorkout(withoutLateRest(stored));
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
      setSaved({
        name: next.name,
        duration: durationLabel(payload.started_at, payload.finished_at),
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

  // A save that didn't go through tries once more when the connection or the app comes back.
  function retrySave() {
    if (workout?.finishedAt != null && !saving && !saved) save();
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

  const onChange = useCallback((index: number, next: ActiveExercise) => {
    setWorkout((w) =>
      w ? { ...w, touched: true, exercises: w.exercises.map((e, i) => (i === index ? next : e)) } : w,
    );
  }, []);

  const onTick = useCallback((index: number, setIndex: number, done: boolean) => {
    Keyboard.dismiss();
    // iPhone browsers only play the rest beep later if a sound started during a tap.
    if (done) unlockRestBeep();
    const before = latest.current;
    setWorkout((w) => (w ? tickSet(w, index, setIndex, done) : w));
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
        <View style={styles.bigCheck}>
          <Ionicons name="checkmark" size={56} color={Colors.onAccent} />
        </View>
        <Text style={styles.savedTitle}>Workout saved</Text>
        <Body secondary style={{ textAlign: 'center' }}>
          {[
            saved.duration,
            saved.sets === 1 ? '1 set' : `${saved.sets} sets`,
            volume > 0 ? `${formatNumber(volume)} ${unit} lifted` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Body>
        {saved.ticked ? (
          <View style={styles.tickedRow}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.accentText} />
            <Text style={styles.tickedText}>Ticked off in your plan</Text>
          </View>
        ) : null}
        {saved.records.length ? (
          <Card style={{ gap: Spacing.two, alignSelf: 'stretch' }}>
            <View style={styles.tickedRow}>
              <Ionicons name="trophy" size={20} color={Colors.accentText} />
              <Text style={styles.bestsTitle}>New bests</Text>
            </View>
            {saved.records.map((r) => (
              <View key={`${r.exercise_name}-${r.kind}`} style={{ gap: 2 }}>
                <Text style={styles.recordName}>{r.exercise_name}</Text>
                <Body secondary style={{ fontSize: 15 }}>
                  {recordLabel(r, unit)}
                </Body>
              </View>
            ))}
          </Card>
        ) : null}
        <View style={{ alignSelf: 'stretch' }}>
          <Button title="Done" onPress={() => goBack('/plan')} />
        </View>
      </ScrollView>
    );
  }

  if (!userId || phase.kind === 'loading' || (phase.kind === 'ready' && !workout)) {
    return (
      <View style={styles.content}>
        {header}
        <ActivityIndicator color={Colors.accentText} />
      </View>
    );
  }

  if (phase.kind !== 'ready' || !workout) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {phase.kind === 'empty' ? (
          <EmptyState
            icon="barbell"
            title="No workout in progress"
            message="Start one from your plan."
            action={<Button title="Go to your plan" onPress={() => router.navigate('/plan')} />}
          />
        ) : null}
        {phase.kind === 'error' ? (
          <View style={{ gap: Spacing.three }}>
            <ErrorText>Could not load this workout. Check your internet connection.</ErrorText>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => {
                setPhase({ kind: 'loading' });
                setAttempt((a) => a + 1);
              }}
            />
          </View>
        ) : null}
        {phase.kind === 'gone' ? <Body secondary>This workout is no longer in your plan.</Body> : null}
        {phase.kind === 'noExercises' ? (
          <Body secondary>Your trainer hasn&apos;t added exercises to this workout yet.</Body>
        ) : null}
        {phase.kind === 'conflict' ? (
          <Card style={{ gap: Spacing.three }}>
            <Text style={styles.conflictTitle}>You have a workout in progress: {phase.stored.name}</Text>
            <Button title="Continue it" onPress={() => router.setParams({ plan: phase.stored.planItemId ?? '' })} />
            <Button
              title={`Discard it and start ${phase.nextName ?? 'this workout'}`}
              variant="secondary"
              onPress={() => discardAndStart(phase.stored)}
            />
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  if (!canStillSave(workout)) {
    return (
      <View style={styles.content}>
        {header}
        <Card style={{ gap: Spacing.three }}>
          <Body>This workout from {weekdayDayMonth(workout.day)} is too old to save.</Body>
          <Button title="Discard" variant="secondary" onPress={discard} />
        </Card>
      </View>
    );
  }

  const { done, total } = setCounts(workout);
  const unticked = total - done;
  const soFar = durationLabel(
    new Date(workout.startedAt).toISOString(),
    new Date(workout.finishedAt ?? Math.max(finishOpenedAt, workout.startedAt)).toISOString(),
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {fromPhone ? <Body secondary>Using the workout saved on this phone.</Body> : null}
        {workout.planNote ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Note from {workout.trainerName ?? 'your trainer'}</Text>
            <Body>{workout.planNote}</Body>
          </View>
        ) : null}
        {workout.exercises.map((exercise, index) => (
          <ExerciseCard
            key={exercise.key}
            exercise={exercise}
            index={index}
            unit={workout.unit}
            onChange={onChange}
            onTick={onTick}
            onLayoutY={onLayoutY}
          />
        ))}
        <Button title="Discard workout" variant="ghost" onPress={discard} testID="discard-workout" />
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
        <View style={styles.footerInner}>
          <Button
            title="Finish workout"
            testID="finish-workout"
            onPress={() => {
              Keyboard.dismiss();
              setProblem(null);
              setFinishOpenedAt(Date.now());
              setFinishing(true);
            }}
          />
        </View>
      </View>

      <Sheet visible={finishing} onClose={() => setFinishing(false)} title="Finish workout">
        <Body>
          {done} of {total} sets ticked · {soFar}
        </Body>
        <TextField
          label="Note for your trainers (optional)"
          value={workout.note}
          onChangeText={(note) => setWorkout((w) => (w ? { ...w, note, touched: true } : w))}
          multiline
          maxLength={1000}
          style={{ minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' }}
        />
        {unticked > 0 ? (
          <Body secondary style={{ fontSize: 14 }}>
            {unticked === 1
              ? "1 set isn't ticked off. It won't be saved."
              : `${unticked} sets aren't ticked off. They won't be saved.`}
          </Body>
        ) : null}
        <ErrorText>{problem}</ErrorText>
        <Button title="Save workout" testID="save-workout" onPress={() => save()} loading={saving} disabled={saving} />
        {hasUntickedNumbers(workout) ? (
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

const styles = themed(() => ({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  savedContent: {
    alignItems: 'center',
    paddingTop: Spacing.five,
  },
  bigCheck: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  savedTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  tickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tickedText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  bestsTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  recordName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  conflictTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
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
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerInner: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
}));
