import { fromDayKey } from '@/lib/food';
import { addDays, dayKey } from '@/lib/sessions';

// Short dates for the training and progress screens, written out the same way on every
// phone and browser: "9 Oct", "Thu 9 Oct". Days are the person's own date (YYYY-MM-DD).

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '9 Oct'
export function dayMonth(day: string): string {
  const date = fromDayKey(day);
  return `${date.getDate()} ${MONTH[date.getMonth()]}`;
}

// 'Thu 9 Oct'
export function weekdayDayMonth(day: string): string {
  const date = fromDayKey(day);
  return `${WEEKDAY[date.getDay()]} ${date.getDate()} ${MONTH[date.getMonth()]}`;
}

// 'Today', 'Yesterday' or 'Mon 6 Oct'.
export function relativeDay(day: string, today = new Date()): string {
  if (day === dayKey(today)) return 'Today';
  if (day === dayKey(addDays(today, -1))) return 'Yesterday';
  return weekdayDayMonth(day);
}

// One letter for a 7-day bar chart: 'M', 'T', 'W'…
export function weekdayLetter(day: string): string {
  return WEEKDAY[fromDayKey(day).getDay()].slice(0, 1);
}

// '17:05' from an ISO time.
export function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
