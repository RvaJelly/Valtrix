import { fromDayKey } from '@/lib/food';
import { dayMonthShort, weekdayShort } from '@/lib/format';

// Short dates for a client's workouts, progress and habits, written out the same way on every
// phone and browser (and the same as in Voltrix): "9 Oct", "Thu 9 Oct". Days are the client's
// own date (YYYY-MM-DD).

// '9 Oct'
export function dayMonth(day: string): string {
  return dayMonthShort(fromDayKey(day));
}

// 'Thu 9 Oct'
export function weekdayDayMonth(day: string): string {
  const date = fromDayKey(day);
  return `${weekdayShort(date)} ${dayMonthShort(date)}`;
}

// 'Thu'
export function weekdayOf(day: string): string {
  return weekdayShort(fromDayKey(day));
}
