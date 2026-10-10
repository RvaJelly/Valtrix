import { addDay, firstDayFrom, runsOn, timesThisWeek } from '@/lib/plan-dates';
import { callRpc } from '@/lib/rpc';
import { addDays, dayKey, startOfDay } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export { programWeek, runsOn, timesThisWeek } from '@/lib/plan-dates';

// The client's workout plan: workouts their trainers put on chosen days of the
// week, or on any day. The client ticks each one off when it's done.

// One workout in the plan, as the my_plan function returns it.
export type PlanItem = {
  plan_item_id: string;
  // The client's link with this trainer, which is also their chat.
  chat_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  trainer_avatar: string | null;
  workout_id: string;
  workout_name: string;
  workout_notes: string | null;
  workout_video_path: string | null;
  // 1 = Monday to 7 = Sunday. Empty means any day, once a week.
  weekdays: number[];
  note: string | null;
  position: number;
  exercise_count: number;
  // The days (YYYY-MM-DD) it was ticked off this week.
  done_on: string[];
  // The trainer's current weight units, for weights saved without their own unit.
  trainer_units: 'kg' | 'lb';
  // The rest come from my_plan_v2, and are null from my_plan (an older database) and for
  // workouts planned before programs, which run every week.
  // The first and last day it runs (YYYY-MM-DD): its own end or its program's, the earlier.
  starts_on: string | null;
  ends_on: string | null;
  // The program on the plan it came with.
  assignment_id: string | null;
  program_name: string | null;
  // A Monday.
  program_starts_on: string | null;
  program_weeks: number | null;
  // After "End program", the new end.
  program_ends_on: string | null;
};

// A program on the client's plan, as its workouts this week show it.
export type PlanProgram = {
  assignment_id: string;
  name: string;
  starts_on: string;
  weeks: number;
  ends_on: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
};

// One exercise in a planned workout, as my_plan_workout returns it.
export type PlanExercise = {
  id: string;
  position: number;
  exercise_name: string;
  muscle_group: string;
  equipment: string;
  instructions: string | null;
  sets: number;
  reps: string;
  weight: string | null;
  // The unit the trainer wrote the weight in.
  weight_unit: 'kg' | 'lb' | null;
  rest_seconds: number | null;
  notes: string | null;
  video_path: string | null;
};

// Monday first, like the trainer's calendar.
export const WEEKDAYS = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 7, short: 'Sun', long: 'Sunday' },
] as const;

export const MUSCLE_GROUPS: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  full_body: 'Full body',
  cardio: 'Cardio',
};

export const EQUIPMENT: Record<string, string> = {
  none: 'Bodyweight',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  cable: 'Cable',
  band: 'Band',
  other: 'Other',
};

// 1 = Monday to 7 = Sunday.
export function isoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

// Weeks start on Monday.
export function startOfWeek(date: Date) {
  return addDays(startOfDay(date), -(isoWeekday(date) - 1));
}

// A YYYY-MM-DD day as a local date, for showing it ("Sun 29 Nov").
export function dateOf(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The planned days written out: "Mon and Fri", "Mon, Wed and Fri", "Every day" or "Any day".
export function daysLabel(weekdays: number[]) {
  if (!weekdays.length) return 'Any day';
  if (weekdays.length === 7) return 'Every day';
  const names = [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS[d - 1]?.short ?? '');
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function trainerLabel(item: Pick<PlanItem, 'trainer_name' | 'business_name'>) {
  return item.trainer_name || item.business_name || 'Your trainer';
}

// How many times a workout is planned each week: once per chosen day, or once for "any day".
export function timesPerWeek(item: Pick<PlanItem, 'weekdays'>) {
  return item.weekdays.length || 1;
}

// Ticks count up to the times it is due in the week, whichever days they were done on. A program
// that ends on Wednesday is due only on its days up to then.
export function doneThisWeek(
  item: Pick<PlanItem, 'weekdays' | 'done_on' | 'starts_on' | 'ends_on'>,
  monday: Date = startOfWeek(new Date()),
) {
  return Math.min(item.done_on.length, timesThisWeek(item, dayKey(monday)));
}

// "{done} of {planned}" for the week: the same count the trainer sees for this client.
export function weekProgress(items: PlanItem[], monday: Date = startOfWeek(new Date())) {
  const key = dayKey(monday);
  return items.reduce(
    (sum, item) => ({
      planned: sum.planned + timesThisWeek(item, key),
      done: sum.done + Math.min(item.done_on.length, timesThisWeek(item, key)),
    }),
    { planned: 0, done: 0 },
  );
}

// What's on a day: workouts planned for that weekday, "any day" ones not yet done
// this week, and anything ticked off that day (so it stays with its tick, also
// when it was done on a different day than planned). Nothing outside its dates.
export function dueOn(item: PlanItem, day: Date) {
  const key = dayKey(day);
  if (item.done_on.includes(key)) return true;
  if (!runsOn(item, key)) return false;
  if (item.weekdays.length) return item.weekdays.includes(isoWeekday(day));
  return item.done_on.length === 0;
}

// The weekday workouts shown on a day of the week: the ones planned for it within their
// dates, and ones ticked off that day although they were planned for another day.
export function weekdayItems(plan: PlanItem[], day: Date) {
  const key = dayKey(day);
  return plan.filter(
    (item) =>
      item.weekdays.length > 0 &&
      ((item.weekdays.includes(isoWeekday(day)) && runsOn(item, key)) || item.done_on.includes(key)),
  );
}

// The programs among the week's workouts, one each, the one that started first first.
export function programsIn(items: PlanItem[]): PlanProgram[] {
  const programs = new Map<string, PlanProgram>();
  for (const item of items) {
    if (!item.assignment_id || !item.program_starts_on || !item.program_weeks || programs.has(item.assignment_id)) {
      continue;
    }
    programs.set(item.assignment_id, {
      assignment_id: item.assignment_id,
      name: item.program_name || 'Program',
      starts_on: item.program_starts_on,
      weeks: item.program_weeks,
      ends_on: item.program_ends_on ?? addDay(item.program_starts_on, item.program_weeks * 7 - 1),
      trainer_id: item.trainer_id,
      trainer_name: item.trainer_name,
      business_name: item.business_name,
    });
  }
  return [...programs.values()].sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.name.localeCompare(b.name));
}

const NO_DATES = {
  starts_on: null,
  ends_on: null,
  assignment_id: null,
  program_name: null,
  program_starts_on: null,
  program_weeks: null,
  program_ends_on: null,
} as const;

// The plan from all the client's trainers for the days from..to (at most 62), with their ticks in
// those days. An older database without my_plan_v2 answers through my_plan, with no dates.
async function planBetween(from: string, to: string): Promise<PlanItem[]> {
  const answer = await callRpc<PlanItem[]>('my_plan_v2', { p_from: from, p_to: to });
  let rows = answer.data;
  if (answer.missing) {
    const { data, error } = await supabase.rpc('my_plan', { p_from: from, p_to: to });
    if (error) throw error;
    rows = ((data ?? []) as PlanItem[]).map((item) => ({ ...item, ...NO_DATES }));
  }
  return (rows ?? []).map((item) => ({
    ...item,
    weekdays: item.weekdays ?? [],
    done_on: item.done_on ?? [],
    trainer_units: item.trainer_units === 'lb' ? ('lb' as const) : ('kg' as const),
    program_weeks: item.program_weeks == null ? null : Number(item.program_weeks),
  }));
}

// This week's plan (Monday to Sunday): only workouts that run on some day of it, with the week's ticks.
export async function loadPlan(today = new Date()) {
  const week = startOfWeek(today);
  return planBetween(dayKey(week), dayKey(addDays(week, 6)));
}

// When nothing is planned this week: the first workout in the next 8 weeks, and the day it is
// first due. Null when there is none.
export async function loadNextPlanned(today = new Date()) {
  const from = dayKey(addDays(startOfWeek(today), 7));
  const to = addDay(from, 55);
  const items = await planBetween(from, to);
  let next: { item: PlanItem; day: string } | null = null;
  for (const item of items) {
    const day = firstDayFrom(item, from, to);
    if (day && (!next || day < next.day)) next = { item, day };
  }
  return next;
}

export async function loadPlanWorkout(planItemId: string) {
  let { data, error } = await supabase.rpc('my_plan_workout_v2', { p_item: planItemId });
  // PGRST202: a database without the newer function yet. Its weights read in the trainer's units.
  if (error?.code === 'PGRST202') ({ data, error } = await supabase.rpc('my_plan_workout', { p_item: planItemId }));
  if (error) throw error;
  return ((data ?? []) as PlanExercise[]).map((ex) => ({
    ...ex,
    weight_unit: ex.weight_unit === 'kg' || ex.weight_unit === 'lb' ? ex.weight_unit : null,
  }));
}

// Ticks a workout off for a day (the phone's own date).
export async function markDone(planItemId: string, day: string) {
  const { error } = await supabase.from('plan_completions').insert({ plan_item_id: planItemId, done_on: day });
  // Ticking it twice (for example from two phones) is not an error.
  if (error && error.code !== '23505') throw error;
}

export async function undoDone(planItemId: string, day: string) {
  const { error } = await supabase.from('plan_completions').delete().eq('plan_item_id', planItemId).eq('done_on', day);
  if (error) throw error;
}
