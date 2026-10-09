import { addDays, dayKey, startOfDay } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

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
  // The units the trainer writes weights in, from their own app settings.
  trainer_units: 'kg' | 'lb';
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

export function daysLabel(weekdays: number[]) {
  if (!weekdays.length) return 'Any day';
  if (weekdays.length === 7) return 'Every day';
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d - 1]?.short)
    .join(' · ');
}

export function trainerLabel(item: Pick<PlanItem, 'trainer_name' | 'business_name'>) {
  return item.trainer_name || item.business_name || 'Your trainer';
}

// How many times a workout is planned each week: once per chosen day, or once for "any day".
export function timesPerWeek(item: Pick<PlanItem, 'weekdays'>) {
  return item.weekdays.length || 1;
}

// Ticks count up to the planned number, whichever days they were done on.
export function doneThisWeek(item: Pick<PlanItem, 'weekdays' | 'done_on'>) {
  return Math.min(item.done_on.length, timesPerWeek(item));
}

export function weekProgress(items: PlanItem[]) {
  return items.reduce(
    (sum, item) => ({ planned: sum.planned + timesPerWeek(item), done: sum.done + doneThisWeek(item) }),
    { planned: 0, done: 0 },
  );
}

// What's on a day: workouts planned for that weekday, "any day" ones not yet done
// this week, and anything ticked off that day (so it stays with its tick, also
// when it was done on a different day than planned).
export function dueOn(item: PlanItem, day: Date) {
  if (item.done_on.includes(dayKey(day))) return true;
  if (item.weekdays.length) return item.weekdays.includes(isoWeekday(day));
  return item.done_on.length === 0;
}

// The weekday workouts shown on a day of the week: the ones planned for it, and
// ones ticked off that day although they were planned for another day.
export function weekdayItems(plan: PlanItem[], day: Date) {
  const key = dayKey(day);
  return plan.filter(
    (item) => item.weekdays.length > 0 && (item.weekdays.includes(isoWeekday(day)) || item.done_on.includes(key)),
  );
}

// The plan from all the client's trainers, with this week's ticks.
export async function loadPlan(today = new Date()) {
  const week = startOfWeek(today);
  const { data, error } = await supabase.rpc('my_plan', { p_from: dayKey(week), p_to: dayKey(addDays(week, 6)) });
  if (error) throw error;
  return ((data ?? []) as PlanItem[]).map((item) => ({
    ...item,
    weekdays: item.weekdays ?? [],
    done_on: item.done_on ?? [],
    trainer_units: item.trainer_units === 'lb' ? ('lb' as const) : ('kg' as const),
  }));
}

export async function loadPlanWorkout(planItemId: string) {
  const { data, error } = await supabase.rpc('my_plan_workout', { p_item: planItemId });
  if (error) throw error;
  return (data ?? []) as PlanExercise[];
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
