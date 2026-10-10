// A client's workout plan: workouts on chosen days of the week, or on any day, from a first day
// to a last one (none: every week). A program given to the client adds its workouts dated to their
// weeks. The client ticks each one off in the Voltrix app.

import { timesThisWeek } from '@/lib/plan-dates';

export { runsOn, timesThisWeek } from '@/lib/plan-dates';

export type PlanItem = {
  id: string;
  client_id: string;
  workout_id: string;
  position: number;
  // 1 = Monday to 7 = Sunday. Empty means any day, once a week.
  weekdays: number[];
  note: string | null;
  // The first and last day it runs (YYYY-MM-DD); none on workouts added on their own.
  starts_on: string | null;
  ends_on: string | null;
  // The program on the client's plan it came with.
  assignment_id: string | null;
  workouts: { name: string; client_id?: string | null } | null;
};

export const PLAN_COLUMNS =
  'id, client_id, workout_id, position, weekdays, note, starts_on, ends_on, assignment_id, workouts(name, client_id)';

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

// The week starting `monday`: how many plan workouts are due (only days inside each one's dates
// and its program's end) and how many of those are ticked. The same count as clients_overview
// and Voltrix.
export function weekProgress(
  items: PlanItem[],
  ticks: Map<string, string[]>,
  monday?: string,
  assignmentEnds?: Map<string, string>,
) {
  let planned = 0;
  let done = 0;
  for (const item of items) {
    const times = monday
      ? timesThisWeek(item, monday, item.assignment_id ? assignmentEnds?.get(item.assignment_id) : null)
      : timesPerWeek(item);
    planned += times;
    done += Math.min(ticks.get(item.id)?.length ?? 0, times);
  }
  return { planned, done };
}
