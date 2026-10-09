import { supabase } from '@/lib/supabase';
import { formatEstimate, formatNumber, formatWeight, type WeightUnit } from '@/lib/units';

// What a client logs in Voltrix, read here for their trainer: workouts and personal bests,
// body weight, measurements, progress photos, weekly check-ins (with the trainer's reply) and
// daily habits. The database hands these out only through the client_* functions, and only
// for a client who accepted this trainer (the same rule as the food diary). Weights are in kg
// and lengths in cm; the screens show them in the trainer's own units.

// ---------- Workouts (the same shapes as in Voltrix) ----------

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
  // This trainer set the plan workout it was started from.
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

// ---------- Body and check-ins (the same shapes as in Voltrix) ----------

export type BodyWeight = { day: string; weight_kg: number };

export type MeasurementKey = 'waist_cm' | 'hips_cm' | 'chest_cm' | 'arm_cm' | 'thigh_cm';
export type Measurements = { day: string } & Record<MeasurementKey, number | null>;

// The limits in cm are the database's.
export const MEASUREMENTS: readonly { key: MeasurementKey; label: string; min: number; max: number }[] = [
  { key: 'waist_cm', label: 'Waist', min: 20, max: 300 },
  { key: 'hips_cm', label: 'Hips', min: 20, max: 300 },
  { key: 'chest_cm', label: 'Chest', min: 20, max: 300 },
  { key: 'arm_cm', label: 'Arm', min: 10, max: 150 },
  { key: 'thigh_cm', label: 'Thigh', min: 10, max: 200 },
];

export type Pose = 'front' | 'side' | 'back';
export const POSES: readonly { key: Pose; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

export type ProgressPhoto = {
  id: string;
  day: string;
  pose: Pose;
  path: string;
  width: number | null;
  height: number | null;
};

export type CheckInQuestion = 'rating' | 'energy' | 'sleep' | 'stress';

// The words the client picked from, so the trainer reads exactly what they chose. The answers
// are 1 to 5; for stress, 5 is a lot of stress.
export const CHECK_IN_QUESTIONS: readonly {
  key: CheckInQuestion;
  // On the client's form.
  label: string;
  // In lists, and here.
  short: string;
  words: readonly [string, string, string, string, string];
}[] = [
  {
    key: 'rating',
    label: 'How was your week?',
    short: 'Overall',
    words: ['Rough', 'Not great', 'Okay', 'Good', 'Great'],
  },
  { key: 'energy', label: 'Energy', short: 'Energy', words: ['Very low', 'Low', 'Okay', 'High', 'Very high'] },
  { key: 'sleep', label: 'Sleep', short: 'Sleep', words: ['Very poor', 'Poor', 'Okay', 'Good', 'Great'] },
  { key: 'stress', label: 'Stress', short: 'Stress', words: ['Very low', 'Low', 'Some', 'High', 'Very high'] },
];

export type ClientCheckIn = {
  id: string;
  week_start: string;
  rating: number;
  energy: number;
  sleep: number;
  stress: number;
  wins: string | null;
  struggles: string | null;
  weight_kg: number | null;
  created_at: string;
  updated_at: string;
  // This trainer's own reply. Other trainers' replies stay between them and the client.
  my_reply: string | null;
  my_reply_at: string | null;
};

// ---------- Habits ----------

export type HabitDay = { day: string; water_ml: number; steps: number; sleep_minutes: number | null };
export type HabitTargets = { water_ml: number; steps: number; sleep_minutes: number };

// ---------- Helpers ----------

export const PHOTO_BUCKET = 'progress-photos';
export const PHOTO_LINK_SECONDS = 600;
export const REPLY_MAX = 2000;

const POSE_ORDER: Record<Pose, number> = { front: 0, side: 1, back: 2 };

// Numbers come back from the database as numbers or, for numeric columns, sometimes strings.
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function rows(data: unknown) {
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
}

// lower(btrim(name)), like the database, so the same exercise from two trainers counts once.
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase();
}

// 'Heaviest: 65 kg × 6 (was 62.5 kg)', 'Best one-rep max (estimated): 80 kg (was 77.5 kg)',
// 'Most reps: 22 (was 20)'.
export function recordLabel(
  record: Pick<RecordRow, 'exercise_name' | 'kind' | 'value' | 'reps' | 'previous'>,
  unit: WeightUnit,
): string {
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
export function topRecords<T extends Pick<RecordRow, 'exercise_name' | 'kind'> & { log_id?: string }>(
  records: T[],
): T[] {
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

// The words for one check-in answer: 'Very high'. Blank for a number out of range.
export function answerWord(question: CheckInQuestion, value: number): string {
  return CHECK_IN_QUESTIONS.find((q) => q.key === question)?.words[value - 1] ?? '';
}

// What to show when the reply couldn't be saved. The database's own messages for a refused
// reply (codes 22023 and 42501) are written for people, so they are shown as they come,
// except its row-level security wording. Anything else is most likely the connection.
export function replyErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  if (
    (e?.code === '22023' || e?.code === '42501') &&
    message &&
    !/row-level security|permission denied/i.test(message)
  ) {
    return message;
  }
  return "That didn't save. Check your connection and try again.";
}

// ---------- Workouts ----------

function cleanSet(row: Record<string, unknown>): LoggedSet {
  return {
    position: num(row.position) ?? 0,
    exercise_name: String(row.exercise_name ?? ''),
    set_number: num(row.set_number) ?? 1,
    weight_kg: num(row.weight_kg),
    reps: num(row.reps),
  };
}

function cleanLog(row: Record<string, unknown>): WorkoutLog {
  return {
    id: String(row.id),
    plan_item_id: text(row.plan_item_id),
    from_my_plan: row.from_my_plan === true,
    workout_name: String(row.workout_name ?? ''),
    day: String(row.day ?? ''),
    started_at: String(row.started_at ?? ''),
    finished_at: String(row.finished_at ?? ''),
    note: text(row.note),
    sets: rows(row.sets)
      .map(cleanSet)
      .sort((a, b) => a.position - b.position || a.set_number - b.set_number),
  };
}

// The client's workouts, newest first. `before` (a finished_at) pages back.
export async function loadClientWorkoutLogs(clientId: string, before?: string | null, limit = 20) {
  const { data, error } = await supabase.rpc('client_workout_logs', {
    p_client: clientId,
    p_before: before ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return rows(data).map(cleanLog);
}

// Each exercise's bests, the exercise done most recently first.
export async function loadClientPersonalBests(clientId: string): Promise<PersonalBest[]> {
  const { data, error } = await supabase.rpc('client_personal_bests', { p_client: clientId });
  if (error) throw error;
  return rows(data).map((row) => ({
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
  }));
}

// The times the client beat one of their bests, newest first.
export async function loadClientRecords(clientId: string, limit = 50): Promise<RecordRow[]> {
  const { data, error } = await supabase.rpc('client_records', { p_client: clientId, p_limit: limit });
  if (error) throw error;
  return rows(data).map((row) => ({
    log_id: String(row.log_id ?? ''),
    day: String(row.day ?? ''),
    finished_at: String(row.finished_at ?? ''),
    exercise_name: String(row.exercise_name ?? ''),
    kind: row.kind === 'e1rm' || row.kind === 'reps' ? row.kind : 'weight',
    value: num(row.value) ?? 0,
    reps: num(row.reps),
    previous: num(row.previous) ?? 0,
  }));
}

// ---------- Body ----------

// Between two days (at most 400 days apart), oldest first.
export async function loadClientBodyWeights(clientId: string, from: string, to: string): Promise<BodyWeight[]> {
  const { data, error } = await supabase.rpc('client_body_weights', { p_client: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return rows(data)
    .map((row) => ({ day: String(row.day), weight_kg: num(row.weight_kg) ?? 0 }))
    .filter((w) => w.weight_kg > 0);
}

// Between two days (at most 400 days apart), oldest first.
export async function loadClientMeasurements(clientId: string, from: string, to: string): Promise<Measurements[]> {
  const { data, error } = await supabase.rpc('client_measurements', { p_client: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return rows(data).map((row) => ({
    day: String(row.day),
    waist_cm: num(row.waist_cm),
    hips_cm: num(row.hips_cm),
    chest_cm: num(row.chest_cm),
    arm_cm: num(row.arm_cm),
    thigh_cm: num(row.thigh_cm),
  }));
}

// ---------- Photos ----------

// Newest day first, then front, side, back.
export async function loadClientPhotos(clientId: string, limit = 30): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase.rpc('client_progress_photos', { p_client: clientId, p_limit: limit });
  if (error) throw error;
  return rows(data)
    .map(
      (row): ProgressPhoto => ({
        id: String(row.id),
        day: String(row.day),
        pose: row.pose === 'side' || row.pose === 'back' ? row.pose : 'front',
        path: String(row.path),
        width: num(row.width),
        height: num(row.height),
      }),
    )
    .sort((a, b) => (a.day === b.day ? POSE_ORDER[a.pose] - POSE_ORDER[b.pose] : a.day < b.day ? 1 : -1));
}

export type SignedPhoto = { url: string; signedAt: number };

// Links to the private photos last 10 minutes. They are kept in memory while they have a
// minute left, so coming back to the client's page doesn't ask for new ones. Only the links
// are kept, never the photos: the screens draw them from memory, not the phone's storage.
const links = new Map<string, SignedPhoto>();
const LINK_MS = PHOTO_LINK_SECONDS * 1000;

function stillGood(link: SignedPhoto | undefined, margin: number): link is SignedPhoto {
  return !!link && Date.now() - link.signedAt < LINK_MS - margin;
}

// A link for each photo the trainer may see. One that couldn't be signed (the client left
// meanwhile) is missing from the answer.
export async function photoUrls(paths: string[]): Promise<Map<string, SignedPhoto>> {
  const result = new Map<string, SignedPhoto>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const link = links.get(path);
    if (stillGood(link, 60_000)) result.set(path, link);
    else missing.push(path);
  }
  if (missing.length) {
    const signedAt = Date.now();
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_LINK_SECONDS);
    if (error) throw error;
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) continue;
      const link = { url: item.signedUrl, signedAt };
      links.set(item.path, link);
      result.set(item.path, link);
    }
  }
  return result;
}

// One link for the full-screen viewer, asked for again once the one kept is 9 minutes old.
export async function freshPhotoUrl(path: string): Promise<SignedPhoto> {
  const kept = links.get(path);
  if (stillGood(kept, 60_000)) return kept;
  const signedAt = Date.now();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_LINK_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error('No link');
  const link = { url: data.signedUrl, signedAt };
  links.set(path, link);
  return link;
}

// ---------- Check-ins ----------

// Newest week first, each with this trainer's own reply.
export async function loadClientCheckIns(clientId: string, limit = 12): Promise<ClientCheckIn[]> {
  const { data, error } = await supabase.rpc('client_check_ins', { p_client: clientId, p_limit: limit });
  if (error) throw error;
  return rows(data).map((row) => ({
    id: String(row.id),
    week_start: String(row.week_start),
    rating: num(row.rating) ?? 0,
    energy: num(row.energy) ?? 0,
    sleep: num(row.sleep) ?? 0,
    stress: num(row.stress) ?? 0,
    wins: text(row.wins),
    struggles: text(row.struggles),
    weight_kg: num(row.weight_kg),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    my_reply: text(row.my_reply),
    my_reply_at: text(row.my_reply_at),
  }));
}

// Writes (or changes) the trainer's reply; the client sees it in Voltrix. Throws an Error
// with the message to show.
export async function replyToCheckIn(checkInId: string, body: string): Promise<{ body: string; updated_at: string }> {
  const { data, error } = await supabase.rpc('reply_to_check_in', { p_check_in: checkInId, p_body: body });
  if (error) throw new Error(replyErrorMessage(error));
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    body: text(row?.body) ?? body.trim(),
    updated_at: text(row?.updated_at) ?? new Date().toISOString(),
  };
}

// ---------- Habits ----------

// Between two days (at most 92 days apart), oldest first. Days with nothing logged are missing.
export async function loadClientHabits(clientId: string, from: string, to: string): Promise<HabitDay[]> {
  const { data, error } = await supabase.rpc('client_habits', { p_client: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return rows(data).map((row) => ({
    day: String(row.day),
    water_ml: num(row.water_ml) ?? 0,
    steps: num(row.steps) ?? 0,
    sleep_minutes: num(row.sleep_minutes),
  }));
}

// The client's own targets (the defaults when they never set any); null when not allowed.
export async function loadClientHabitTargets(clientId: string): Promise<HabitTargets | null> {
  const { data, error } = await supabase.rpc('client_habit_targets', { p_client: clientId });
  if (error) throw error;
  const row = rows(data)[0];
  if (!row) return null;
  return {
    water_ml: num(row.water_ml) ?? 2500,
    steps: num(row.steps) ?? 8000,
    sleep_minutes: num(row.sleep_minutes) ?? 480,
  };
}
