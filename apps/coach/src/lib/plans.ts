// A client's workout plan: workouts from the trainer's library on chosen days of
// the week, or on any day. The client ticks each one off in the Voltrix app.

export type PlanItem = {
  id: string;
  client_id: string;
  workout_id: string;
  position: number;
  // 1 = Monday to 7 = Sunday. Empty means any day, once a week.
  weekdays: number[];
  note: string | null;
  workouts: { name: string } | null;
};

export const PLAN_COLUMNS = 'id, client_id, workout_id, position, weekdays, note, workouts(name)';

// Monday first, like the calendar.
export const WEEKDAYS = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 7, short: 'Sun', long: 'Sunday' },
] as const;

export function daysLabel(weekdays: number[]) {
  if (!weekdays.length) return 'Any day';
  if (weekdays.length === 7) return 'Every day';
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d - 1]?.short)
    .join(' · ');
}

// How many times a workout is planned each week: once per chosen day, or once for "any day".
export function timesPerWeek(item: Pick<PlanItem, 'weekdays'>) {
  return item.weekdays.length || 1;
}

// Ticks this week count up to the planned number, whichever days they were done on.
export function doneThisWeek(item: Pick<PlanItem, 'weekdays'>, ticks: string[] | undefined) {
  return Math.min(ticks?.length ?? 0, timesPerWeek(item));
}

export function weekProgress(items: PlanItem[], ticks: Map<string, string[]>) {
  let planned = 0;
  let done = 0;
  for (const item of items) {
    planned += timesPerWeek(item);
    done += doneThisWeek(item, ticks.get(item.id));
  }
  return { planned, done };
}
