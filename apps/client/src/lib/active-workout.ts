import AsyncStorage from '@react-native-async-storage/async-storage';

import { newId } from '@/lib/chat';
import { trainerLabel, type PlanExercise, type PlanItem } from '@/lib/plan';
import { DEFAULT_REST_SECONDS } from '@/lib/rest-timer';
import { addDays, dayKey } from '@/lib/sessions';
import { parseNumber, toKg, weightInput, type WeightUnit } from '@/lib/units';
import {
  estimatedOneRepMax,
  exerciseKey,
  type FinishPayload,
  type LastSet,
  type LoggedSet,
  type PersonalBest,
} from '@/lib/workout-log';

// The workout the client is doing now. It lives on the phone until it is saved or
// discarded, so closing the app, a reload or a lost connection never loses a set. The plan
// workouts they opened are kept on the phone too, so a workout can start with no signal.

export type ActiveSet = {
  // A stable React key.
  key: string;
  // As shown, in ActiveWorkout.unit.
  weight: string;
  // The kg value `weight` was made from (last time's set, or the plan's weight), so a set saved
  // untouched keeps exactly that weight. Null once the person edits the weight text.
  kg: number | null;
  reps: string;
  done: boolean;
  // When it was ticked (epoch ms).
  doneAt: number | null;
};

export type ActiveExercise = {
  // The plan exercise id.
  key: string;
  name: string;
  target: {
    sets: number;
    // The trainer's text: '8-12', '30 s', 'AMRAP'.
    reps: string;
    weight: string | null;
    // Already resolved: the exercise's own unit, else the trainer's.
    weightUnit: WeightUnit;
    restSeconds: number | null;
    notes: string | null;
    instructions: string | null;
    videoPath: string | null;
  };
  // The rest after each set: the plan's, else 90 s. A rest of 0 stays 0.
  restSeconds: number;
  last: { day: string; sets: { weight_kg: number | null; reps: number | null }[] } | null;
  // The best before this workout, for "New best!" on a ticked set; null the first time.
  best: { weightKg: number | null; e1rmKg: number | null; reps: number | null } | null;
  sets: ActiveSet[];
};

export type ActiveWorkout = {
  v: 1;
  // The workout_logs id, picked at the start, so saving twice keeps one.
  id: string;
  userId: string;
  planItemId: string | null;
  name: string;
  trainerName: string | null;
  planNote: string | null;
  // The phone's date at the start.
  day: string;
  // Epoch ms.
  startedAt: number;
  // The unit of every ActiveSet.weight.
  unit: WeightUnit;
  // At most 50.
  exercises: ActiveExercise[];
  restEndsAt: number | null;
  // Seconds, for the bar.
  restTotal: number | null;
  lastTickAt: number | null;
  note: string;
  // Any edit or tick.
  touched: boolean;
  // Set on the first Save tap, so a retry sends the same time.
  finishedAt: number | null;
};

export class FinishError extends Error {}

// A workout that was opened but never touched is forgotten after this long.
export const STALE_UNTOUCHED_MS = 3 * 60 * 60 * 1000;
const MAX_EXERCISES = 50;
const MAX_SETS = 30;
const HOUR = 60 * 60 * 1000;

export const activeWorkoutKey = (userId: string) => `voltrix.activeWorkout.${userId}`;
const planCopiesKey = (userId: string) => `voltrix.planWorkouts.${userId}`;

// Writes go one at a time, in order, so a late save can't bring back a workout that was
// just saved and cleared.
let writes: Promise<unknown> = Promise.resolve();
function inOrder(write: () => Promise<unknown>): Promise<void> {
  const next = writes.then(write).then(
    () => {},
    () => {},
  );
  writes = next;
  return next;
}

function isActiveSet(value: unknown): value is ActiveSet {
  const s = value as ActiveSet | null;
  return (
    !!s &&
    typeof s.key === 'string' &&
    typeof s.weight === 'string' &&
    typeof s.reps === 'string' &&
    typeof s.done === 'boolean' &&
    (s.kg === null || typeof s.kg === 'number')
  );
}

function isActiveExercise(value: unknown): value is ActiveExercise {
  const e = value as ActiveExercise | null;
  return (
    !!e &&
    typeof e.key === 'string' &&
    typeof e.name === 'string' &&
    !!e.target &&
    typeof e.restSeconds === 'number' &&
    Array.isArray(e.sets) &&
    e.sets.every(isActiveSet)
  );
}

// A broken or unknown value counts as no workout.
function isActiveWorkout(value: unknown, userId: string): value is ActiveWorkout {
  const w = value as ActiveWorkout | null;
  return (
    !!w &&
    w.v === 1 &&
    w.userId === userId &&
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.day === 'string' &&
    typeof w.startedAt === 'number' &&
    (w.unit === 'kg' || w.unit === 'lb') &&
    typeof w.touched === 'boolean' &&
    Array.isArray(w.exercises) &&
    w.exercises.every(isActiveExercise)
  );
}

// Null for a missing or broken value, and for an untouched workout older than 3 h (which it removes).
export async function readActiveWorkout(userId: string): Promise<ActiveWorkout | null> {
  try {
    await writes;
    const raw = await AsyncStorage.getItem(activeWorkoutKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isActiveWorkout(parsed, userId)) return null;
    const workout: ActiveWorkout = {
      ...parsed,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      finishedAt: typeof parsed.finishedAt === 'number' ? parsed.finishedAt : null,
      restEndsAt: typeof parsed.restEndsAt === 'number' ? parsed.restEndsAt : null,
      restTotal: typeof parsed.restTotal === 'number' ? parsed.restTotal : null,
      lastTickAt: typeof parsed.lastTickAt === 'number' ? parsed.lastTickAt : null,
    };
    if (!isUnderway(workout) && Date.now() - workout.startedAt > STALE_UNTOUCHED_MS) {
      await clearActiveWorkout(userId);
      return null;
    }
    return workout;
  } catch {
    return null;
  }
}

// Workouts saved or discarded on this phone. A late write of one (a screen's save that was
// still on its way) is dropped, so it can't come back as "in progress".
const ended = new Set<string>();

export function saveActiveWorkout(workout: ActiveWorkout): Promise<void> {
  if (ended.has(workout.id)) return Promise.resolve();
  const raw = JSON.stringify(workout);
  return inOrder(() => AsyncStorage.setItem(activeWorkoutKey(workout.userId), raw));
}

// workoutId: the workout was saved or discarded, so it is never written back.
export function clearActiveWorkout(userId: string, workoutId?: string): Promise<void> {
  if (workoutId) ended.add(workoutId);
  return inOrder(() => AsyncStorage.removeItem(activeWorkoutKey(userId)));
}

// Something to continue or to save.
export function isUnderway(workout: ActiveWorkout): boolean {
  return workout.touched || workout.finishedAt !== null;
}

// ---------- Plan workouts kept on the phone ----------

export type PlanCopy = { item: PlanItem; exercises: PlanExercise[]; savedAt: number };

const MAX_COPIES = 20;

async function readCopies(userId: string): Promise<PlanCopy[]> {
  try {
    const raw = await AsyncStorage.getItem(planCopiesKey(userId));
    const parsed = raw ? (JSON.parse(raw) as { v?: number; items?: unknown }) : null;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return [];
    return (parsed.items as PlanCopy[]).filter(
      (c) => c && c.item && typeof c.item.plan_item_id === 'string' && Array.isArray(c.exercises),
    );
  } catch {
    return [];
  }
}

// Newest first, at most 20.
export function rememberPlanWorkout(userId: string, item: PlanItem, exercises: PlanExercise[]): Promise<void> {
  return inOrder(async () => {
    const copies = (await readCopies(userId)).filter((c) => c.item.plan_item_id !== item.plan_item_id);
    const items = [{ item, exercises, savedAt: Date.now() }, ...copies].slice(0, MAX_COPIES);
    await AsyncStorage.setItem(planCopiesKey(userId), JSON.stringify({ v: 1, items }));
  });
}

export async function recallPlanWorkout(userId: string, planItemId: string): Promise<PlanCopy | null> {
  await writes;
  return (await readCopies(userId)).find((c) => c.item.plan_item_id === planItemId) ?? null;
}

// ---------- Building and changing a workout ----------

// The first number in the trainer's weight text ("20-25" → 20), in kg; null for "light band".
export function plannedWeightKg(weight: string | null, unit: WeightUnit): number | null {
  if (!weight) return null;
  const match = /^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(kgs?|lbs?)?$/i.exec(weight.trim());
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const written = match[2] ? (match[2].toLowerCase().startsWith('lb') ? 'lb' : 'kg') : unit;
  const kg = toKg(amount, written);
  return kg > 0 && kg <= 1000 ? kg : null;
}

// A number only for plain reps ("8-12" → 8, "10 reps" → 10). "30 s", "1 min" and "AMRAP" give
// null, and the reps field shows the text as its placeholder instead.
export function plannedReps(reps: string): number | null {
  const match = /^\s*(\d+)(\s*[-–]\s*\d+)?\s*(reps?)?\s*$/i.exec(reps);
  if (!match) return null;
  const n = Number(match[1]);
  return n <= 1000 ? n : null;
}

// A new workout (untouched): one set per planned set, each prefilled with last time's same
// set, else last time's last set, else the planned weight and plain reps.
export function startWorkout(args: {
  userId: string;
  item: PlanItem;
  exercises: PlanExercise[];
  last: Map<string, LastSet[]>;
  bests?: PersonalBest[];
  unit: WeightUnit;
  now?: Date;
}): ActiveWorkout {
  const { userId, item, last, unit } = args;
  const now = args.now ?? new Date();
  const bests = new Map((args.bests ?? []).map((b) => [exerciseKey(b.exercise_name), b]));
  const exercises = [...args.exercises]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_EXERCISES)
    .map((ex): ActiveExercise => {
      const weightUnit = ex.weight_unit ?? item.trainer_units;
      const before = last.get(exerciseKey(ex.exercise_name)) ?? [];
      const planned = plannedWeightKg(ex.weight, weightUnit);
      const plainReps = plannedReps(ex.reps);
      const count = Math.min(Math.max(Math.round(ex.sets) || 1, 1), MAX_SETS);
      const best = bests.get(exerciseKey(ex.exercise_name));
      return {
        key: ex.id,
        name: ex.exercise_name,
        target: {
          sets: ex.sets,
          reps: ex.reps,
          weight: ex.weight,
          weightUnit,
          restSeconds: ex.rest_seconds,
          notes: ex.notes,
          instructions: ex.instructions,
          videoPath: ex.video_path,
        },
        restSeconds: ex.rest_seconds ?? DEFAULT_REST_SECONDS,
        last: before.length
          ? { day: before[0].day, sets: before.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps })) }
          : null,
        best: best ? { weightKg: best.best_weight_kg, e1rmKg: best.best_e1rm_kg, reps: best.most_reps } : null,
        sets: Array.from({ length: count }, (_, i): ActiveSet => {
          const source = before[i] ?? before.at(-1) ?? null;
          const kg = source ? source.weight_kg : planned;
          const reps = source ? source.reps : plainReps;
          return {
            key: newId(),
            weight: weightInput(kg, unit),
            kg,
            reps: reps === null ? '' : String(reps),
            done: false,
            doneAt: null,
          };
        }),
      };
    });
  return {
    v: 1,
    id: newId(),
    userId,
    planItemId: item.plan_item_id,
    name: item.workout_name,
    trainerName: trainerLabel(item),
    planNote: item.note,
    day: dayKey(now),
    startedAt: now.getTime(),
    unit,
    exercises,
    restEndsAt: null,
    restTotal: null,
    lastTickAt: null,
    note: '',
    touched: false,
    finishedAt: null,
  };
}

// Ticks a set on or off. Ticking starts the exercise's rest, unless its rest is 0 or that
// was the last set of the whole workout. Unticking leaves the rest timer alone.
export function tickSet(
  workout: ActiveWorkout,
  index: number,
  setIndex: number,
  done: boolean,
  now = Date.now(),
): ActiveWorkout {
  const exercises = workout.exercises.map((ex, i) =>
    i !== index
      ? ex
      : { ...ex, sets: ex.sets.map((s, j) => (j !== setIndex ? s : { ...s, done, doneAt: done ? now : null })) },
  );
  const next: ActiveWorkout = { ...workout, exercises, touched: true };
  if (!done) return next;
  next.lastTickAt = now;
  const rest = exercises[index]?.restSeconds ?? 0;
  const allDone = exercises.every((ex) => ex.sets.every((s) => s.done));
  if (rest > 0 && !allDone) {
    next.restEndsAt = now + rest * 1000;
    next.restTotal = rest;
  }
  return next;
}

// The kg of a set's weight: the value it was made from, else the typed text in the workout's
// unit. Undefined for text that isn't a number.
function setKg(set: ActiveSet, unit: WeightUnit): number | null | undefined {
  if (set.kg !== null) return set.kg;
  if (!set.weight.trim()) return null;
  const typed = parseNumber(set.weight);
  return typed === null ? undefined : toKg(typed, unit);
}

function setReps(set: ActiveSet): number | null | undefined {
  const typed = set.reps.trim();
  if (!typed) return null;
  if (!/^\d+$/.test(typed)) return undefined;
  const n = Number(typed);
  return n <= 1000 ? n : undefined;
}

const CHECK_SETS = 'Check the weight and reps in the sets you ticked.';

// What finish_workout gets: only the ticked sets, numbered 1, 2, 3… within each exercise,
// with weights in kg. A ticked set with no numbers is sent with both empty ("done").
export function finishPayload(workout: ActiveWorkout, now = Date.now()): FinishPayload {
  const sets: LoggedSet[] = [];
  workout.exercises.forEach((ex, position) => {
    let number = 0;
    for (const set of ex.sets) {
      if (!set.done) continue;
      const weightKg = setKg(set, workout.unit);
      const reps = setReps(set);
      if (weightKg === undefined || reps === undefined || (weightKg !== null && weightKg > 1000)) {
        throw new FinishError(CHECK_SETS);
      }
      number += 1;
      sets.push({
        position,
        exercise_name: ex.name.trim().slice(0, 120),
        set_number: number,
        weight_kg: weightKg,
        reps,
      });
    }
  });
  if (!sets.length) throw new FinishError('Tick off at least one set to save the workout.');

  // A workout left open overnight finishes a minute after its last tick, and it always
  // stays within the 24 hours a workout may last.
  let finished = workout.finishedAt ?? now;
  if (finished - workout.startedAt > 12 * HOUR) finished = (workout.lastTickAt ?? workout.startedAt) + 60_000;
  finished = Math.min(Math.max(finished, workout.startedAt), workout.startedAt + 24 * HOUR);

  return {
    id: workout.id,
    plan_item_id: workout.planItemId,
    workout_name: workout.name.trim().slice(0, 120),
    day: workout.day,
    started_at: new Date(workout.startedAt).toISOString(),
    finished_at: new Date(finished).toISOString(),
    note: workout.note.trim().slice(0, 1000) || null,
    sets,
  };
}

function hasNumbers(set: ActiveSet) {
  return !!(set.weight.trim() || set.reps.trim());
}

// Unticked sets that have a weight or reps become done.
export function tickAll(workout: ActiveWorkout, now = Date.now()): ActiveWorkout {
  return {
    ...workout,
    touched: true,
    exercises: workout.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => (!s.done && hasNumbers(s) ? { ...s, done: true, doneAt: now } : s)),
    })),
  };
}

export function hasUntickedNumbers(workout: ActiveWorkout): boolean {
  return workout.exercises.some((ex) => ex.sets.some((s) => !s.done && hasNumbers(s)));
}

// A ticked set beats the best before this workout: 0.05 kg more weight, 0.5 kg more estimated
// max, or, without weights, more reps (the same rules as the database). Never the first time:
// that sets the bar.
export function isNewBest(exercise: ActiveExercise, set: ActiveSet, unit: WeightUnit): boolean {
  const best = exercise.best;
  if (!set.done || !best) return false;
  const kg = setKg(set, unit);
  const reps = setReps(set);
  if (kg === undefined || reps === undefined) return false;
  if (kg !== null && kg > 0) {
    if (best.weightKg !== null && kg >= best.weightKg + 0.05) return true;
    const estimate = reps !== null ? estimatedOneRepMax(kg, reps) : null;
    return estimate !== null && best.e1rmKg !== null && estimate >= best.e1rmKg + 0.5;
  }
  return reps !== null && reps > 0 && best.reps !== null && reps > best.reps;
}

// Workouts can be saved up to a week after they were done.
export function canStillSave(workout: ActiveWorkout, today = new Date()): boolean {
  return workout.day >= dayKey(addDays(today, -7));
}

// The person switched between kg and lb. Typed weights are first turned into kg in the old
// unit; then every weight is rebuilt from its kg, so text is never converted twice.
export function convertUnits(workout: ActiveWorkout, unit: WeightUnit): ActiveWorkout {
  if (workout.unit === unit) return workout;
  return {
    ...workout,
    unit,
    exercises: workout.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => {
        const kg = setKg(s, workout.unit);
        // Text that isn't a number stays as it is, for the person to fix.
        if (kg === undefined) return s;
        return { ...s, kg, weight: weightInput(kg, unit) };
      }),
    })),
  };
}

export function setCounts(workout: ActiveWorkout): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      total += 1;
      if (s.done) done += 1;
    }
  }
  return { done, total };
}
