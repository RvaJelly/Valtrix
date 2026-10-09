import { supabase } from '@/lib/supabase';

// Daily habits: water, steps and sleep (last night), against the client's own targets.
// Kept in ml, steps and minutes.

export type Habit = 'water' | 'steps' | 'sleep';

export type HabitDay = {
  day: string;
  water_ml: number;
  steps: number;
  sleep_minutes: number | null;
  // Null for a day with nothing saved yet.
  updated_at: string | null;
};

export type HabitTargets = { water_ml: number; steps: number; sleep_minutes: number };

export const DEFAULT_TARGETS: HabitTargets = { water_ml: 2500, steps: 8000, sleep_minutes: 480 };
// Habits can be logged for the last month (the database allows 31 days back).
export const HABIT_DAYS_BACK = 30;
// The targets' limits, as in the database: ml, steps and minutes.
export const TARGET_LIMITS: Record<Habit, { min: number; max: number }> = {
  water: { min: 250, max: 10000 },
  steps: { min: 500, max: 100000 },
  sleep: { min: 180, max: 960 },
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function emptyDay(day: string): HabitDay {
  return { day, water_ml: 0, steps: 0, sleep_minutes: null, updated_at: null };
}

function cleanDay(row: Record<string, unknown>): HabitDay {
  return {
    day: String(row.day),
    water_ml: num(row.water_ml) ?? 0,
    steps: num(row.steps) ?? 0,
    sleep_minutes: num(row.sleep_minutes),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

// The one saved later. Two quick taps both add on the server, and their answers can come back
// in either order, so the later one wins. A missing one loses.
export function newer(a: HabitDay | null | undefined, b: HabitDay | null | undefined): HabitDay | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (!b.updated_at) return a.updated_at ? a : b;
  if (!a.updated_at) return b;
  return Date.parse(b.updated_at) >= Date.parse(a.updated_at) ? b : a;
}

export async function loadHabitDays(from: string, to: string): Promise<HabitDay[]> {
  const { data, error } = await supabase
    .from('habit_days')
    .select('day, water_ml, steps, sleep_minutes, updated_at')
    .gte('day', from)
    .lte('day', to)
    .order('day');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(cleanDay);
}

// Adds to a habit (add, the default; a negative amount takes some off) or sets it, and returns
// the day as saved. The adding happens in the database, so two quick taps both count.
export async function logHabit(day: string, habit: Habit, amount: number, add = true): Promise<HabitDay> {
  const { data, error } = await supabase.rpc('log_habit', {
    p_day: day,
    p_habit: habit,
    p_amount: Math.round(amount),
    p_add: add,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error('No answer');
  return cleanDay(row);
}

// The defaults when the person never set any.
export async function loadTargets(): Promise<HabitTargets> {
  const { data, error } = await supabase.from('habit_targets').select('water_ml, steps, sleep_minutes').maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_TARGETS;
  const row = data as Record<string, unknown>;
  return {
    water_ml: num(row.water_ml) ?? DEFAULT_TARGETS.water_ml,
    steps: num(row.steps) ?? DEFAULT_TARGETS.steps,
    sleep_minutes: num(row.sleep_minutes) ?? DEFAULT_TARGETS.sleep_minutes,
  };
}

export async function saveTargets(targets: HabitTargets): Promise<void> {
  const { error } = await supabase.from('habit_targets').upsert(targets, { onConflict: 'user_id' });
  if (error) throw error;
}
