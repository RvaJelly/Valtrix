import { fromDayKey } from '@/lib/food';
import { dayMonthShort, time24, weekdayShort } from '@/lib/format';
import { addDays, dayKey } from '@/lib/sessions';

// Short dates for the training and progress screens, written out the same way on every
// phone and browser: "9 Oct", "Thu 9 Oct". Days are the person's own date (YYYY-MM-DD).

// '9 Oct'
export function dayMonth(day: string): string {
  return dayMonthShort(fromDayKey(day));
}

// 'Thu 9 Oct'
export function weekdayDayMonth(day: string): string {
  const date = fromDayKey(day);
  return `${weekdayShort(date)} ${dayMonthShort(date)}`;
}

// 'Today', 'Yesterday' or 'Mon 6 Oct'.
export function relativeDay(day: string, today = new Date()): string {
  if (day === dayKey(today)) return 'Today';
  if (day === dayKey(addDays(today, -1))) return 'Yesterday';
  return weekdayDayMonth(day);
}

// One letter for a 7-day bar chart: 'M', 'T', 'W'…
export function weekdayLetter(day: string): string {
  return weekdayShort(fromDayKey(day)).slice(0, 1);
}

// '17:05' from an ISO time.
export function clockTime(iso: string): string {
  return time24(new Date(iso));
}
