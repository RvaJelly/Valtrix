import { within } from '@/lib/serial';
import { supabase } from '@/lib/supabase';
import { formatEstimate, formatNumber, formatWeight, type WeightUnit } from '@/lib/units';

// Workouts the client logged in Voltrix: the sets they really did, their personal bests and
// the times they beat one. Weights are in kg. Their trainers read the same logs in Voltrix Coach.

export type LoggedSet = {
  position: number;
  exercise_name: string;
  set_number: number;
  weight_kg: number | null;
  // Both null: a set that was just done (a plank, a stretch).
  reps: number | null;
};

export type WorkoutLog = {
  id: string;
  plan_item_id: string | null;
  // Only meaningful in Voltrix Coach: the signed-in trainer set the plan workout.
  from_my_plan: boolean;
  workout_name: string;
  // The client's own date (YYYY-MM-DD).
  day: string;
  started_at: string;
  finished_at: string;
  note: string | null;
  // By position, then set number.
  sets: LoggedSet[];
};

export type PersonalBest = {
  exercise_name: string;
  best_weight_kg: number | null;
  best_weight_reps: number | null;
  best_weight_on: string | null;
  best_e1rm_kg: number | null;
  best_e1rm_on: string | null;
  // Sets without weights only.
  most_reps: number | null;
  most_reps_on: string | null;
  last_done_on: string;
  times_done: number;
};

export type RecordKind = 'weight' | 'e1rm' | 'reps';

export type RecordRow = {
  log_id: string;
  day: string;
  finished_at: string;
  exercise_name: string;
  kind: RecordKind;
  // kg for weight and e1rm, a count for reps.
  value: number;
  // The reps done at the weight (kind 'weight').
  reps: number | null;
  previous: number;
};

export type NewRecord = Pick<RecordRow, 'exercise_name' | 'kind' | 'value' | 'reps' | 'previous'>;
export type FinishResult = { log_id: string; ticked: boolean; records: NewRecord[] };

export type LastSet = {
  exercise_key: string;
  log_id: string;
  day: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
};

export type FinishPayload = {
  id: string;
  plan_item_id: string | null;
  workout_name: string;
  day: string;
  started_at: string;
  finished_at: string;
  note: string | null;
  sets: LoggedSet[];
};

// Numbers come back from the database as numbers or, for numeric columns, sometimes strings.
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// lower(btrim(name)), like the database, so the same exercise from two trainers counts once.
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase();
}

// Same as the database (Epley): a single is its own weight; 2–12 reps use
// weight × (1 + reps / 30); anything else gives no estimate.
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0)) return null;
  if (reps === 1) return weightKg;
  if (reps >= 2 && reps <= 12) return Math.round(weightKg * (1 + reps / 30) * 1000) / 1000;
  return null;
}

// 'Heaviest: 65 kg × 6 (was 62.5 kg)', 'Best one-rep max (estimated): 80 kg (was 77.5 kg)',
// 'Most reps: 22 (was 20)'.
export function recordLabel(record: NewRecord, unit: WeightUnit): string {
  if (record.kind === 'weight') {
    const reps = record.reps ? ` × ${record.reps}` : '';
    return `Heaviest: ${formatWeight(record.value, unit)}${reps} (was ${formatWeight(record.previous, unit)})`;
  }
  if (record.kind === 'e1rm') {
    return `Best one-rep max (estimated): ${formatEstimate(record.value, unit)} (was ${formatEstimate(record.previous, unit)})`;
  }
  return `Most reps: ${formatNumber(record.value)} (was ${formatNumber(record.previous)})`;
}

const RANK: Record<RecordKind, number> = { weight: 0, e1rm: 1, reps: 2 };

// At most one record per exercise in each workout: the heaviest weight, else the estimated
// max, else most reps. Keeps the input order.
export function topRecords<T extends NewRecord & { log_id?: string }>(records: T[]): T[] {
  const best = new Map<string, T>();
  for (const record of records) {
    const key = `${record.log_id ?? ''}|${exerciseKey(record.exercise_name)}`;
    const held = best.get(key);
    if (!held || RANK[record.kind] < RANK[held.kind]) best.set(key, record);
  }
  const keep = new Set(best.values());
  return records.filter((record) => keep.has(record));
}

// '48 min', '1 h 05 min'
export function durationLabel(startedAt: string, finishedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60_000));
  if (!Number.isFinite(minutes)) return '–';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')} min` : `${minutes / 60} h`;
}

// Everything lifted: Σ weight × reps over the sets that have both.
export function volumeKg(sets: LoggedSet[]): number {
  return sets.reduce((sum, s) => (s.weight_kg !== null && s.reps !== null ? sum + s.weight_kg * s.reps : sum), 0);
}

function cleanSet(row: Record<string, unknown>): LoggedSet {
  return {
    position: num(row.position) ?? 0,
    exercise_name: String(row.exercise_name ?? ''),
    set_number: num(row.set_number) ?? 1,
    weight_kg: num(row.weight_kg),
    reps: num(row.reps),
  };
}

function bySetOrder(a: LoggedSet, b: LoggedSet) {
  return a.position - b.position || a.set_number - b.set_number;
}

function cleanLog(row: Record<string, unknown>, sets: unknown): WorkoutLog {
  return {
    id: String(row.id),
    plan_item_id: text(row.plan_item_id),
    from_my_plan: row.from_my_plan === true,
    workout_name: String(row.workout_name ?? ''),
    day: String(row.day ?? ''),
    started_at: String(row.started_at ?? ''),
    finished_at: String(row.finished_at ?? ''),
    note: text(row.note),
    sets: (Array.isArray(sets) ? (sets as Record<string, unknown>[]) : []).map(cleanSet).sort(bySetOrder),
  };
}

function cleanBest(row: Record<string, unknown>): PersonalBest {
  return {
    exercise_name: String(row.exercise_name ?? ''),
    best_weight_kg: num(row.best_weight_kg),
    best_weight_reps: num(row.best_weight_reps),
    best_weight_on: text(row.best_weight_on),
    best_e1rm_kg: num(row.best_e1rm_kg),
    best_e1rm_on: text(row.best_e1rm_on),
    most_reps: num(row.most_reps),
    most_reps_on: text(row.most_reps_on),
    last_done_on: String(row.last_done_on ?? ''),
    times_done: num(row.times_done) ?? 0,
  };
}

function cleanRecord(row: Record<string, unknown>): RecordRow {
  const kind = row.kind === 'e1rm' || row.kind === 'reps' ? row.kind : 'weight';
  return {
    log_id: String(row.log_id ?? ''),
    day: String(row.day ?? ''),
    finished_at: String(row.finished_at ?? ''),
    exercise_name: String(row.exercise_name ?? ''),
    kind,
    value: num(row.value) ?? 0,
    reps: num(row.reps),
    previous: num(row.previous) ?? 0,
  };
}

// The signed-in person's workouts, newest first. `before` (a finished_at) pages back.
export async function loadWorkoutLogs(before?: string | null, limit = 20): Promise<WorkoutLog[]> {
  const { data, error } = await supabase.rpc('my_workout_logs', { p_before: before ?? null, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => cleanLog(row, row.sets));
}

// One workout with its sets; null when it is gone.
export async function loadWorkoutLog(id: string): Promise<WorkoutLog | null> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select(
      'id, plan_item_id, workout_name, day, started_at, finished_at, note, workout_sets(position, exercise_name, set_number, weight_kg, reps)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return cleanLog(row, row.workout_sets);
}

export async function loadPersonalBests(): Promise<PersonalBest[]> {
  const { data, error } = await supabase.rpc('my_personal_bests');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(cleanBest);
}

// The times the person beat a best, newest first.
export async function loadRecords(limit = 50): Promise<RecordRow[]> {
  const { data, error } = await supabase.rpc('my_records', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(cleanRecord);
}

// The sets from the last time the person did each of these exercises, by exerciseKey.
export async function loadLastSets(exerciseNames: string[]): Promise<Map<string, LastSet[]>> {
  const names = [...new Set(exerciseNames.map((n) => n.trim()).filter(Boolean))].slice(0, 50);
  const found = new Map<string, LastSet[]>();
  const finished = new Set<string>();
  if (!names.length) return found;
  const { data, error } = await supabase.rpc('my_last_sets', { p_exercises: names });
  if (error) throw error;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const set: LastSet = {
      exercise_key: String(row.exercise_key ?? ''),
      log_id: String(row.log_id ?? ''),
      day: String(row.day ?? ''),
      set_number: num(row.set_number) ?? 1,
      weight_kg: num(row.weight_kg),
      reps: num(row.reps),
    };
    // Rows come in workout order. An exercise done twice that day (bench press first and
    // last) only shows its first go, so the sets don't get mixed up.
    if (finished.has(set.exercise_key)) continue;
    const list = found.get(set.exercise_key) ?? [];
    if (list.length && set.set_number <= list[list.length - 1].set_number) {
      finished.add(set.exercise_key);
      continue;
    }
    list.push(set);
    found.set(set.exercise_key, list);
  }
  return found;
}

// A save that hangs on a bad connection gives up after this, so Save never spins forever.
const SAVE_MS = 20_000;

// Saves a finished workout. Saving the same id again is safe: the database answers with what
// was saved. Two saves that crossed (a double tap) can give 23505 once; asking again gets the
// saved answer.
export async function finishWorkout(payload: FinishPayload): Promise<FinishResult> {
  const save = () => within(supabase.rpc('finish_workout', { p_log: payload }), SAVE_MS);
  let { data, error } = await save();
  if (error?.code === '23505') ({ data, error } = await save());
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  const records = Array.isArray(result.records) ? (result.records as Record<string, unknown>[]) : [];
  return {
    log_id: String(result.log_id ?? payload.id),
    ticked: result.ticked === true,
    records: records.map((r) => {
      const { exercise_name, kind, value, reps, previous } = cleanRecord(r);
      return { exercise_name, kind, value, reps, previous };
    }),
  };
}

// Removes a workout; its sets go with it. A tick on the plan stays.
export async function deleteWorkoutLog(id: string): Promise<void> {
  const { error } = await supabase.from('workout_logs').delete().eq('id', id);
  if (error) throw error;
}

// Whether a workout from this plan item was logged on that day (for the Undo question).
export async function loggedOn(planItemId: string, day: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('plan_item_id', planItemId)
    .eq('day', day)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
