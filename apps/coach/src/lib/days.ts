import { fromDayKey } from '@/lib/food';

// Short dates for a client's workouts, progress and habits, written out the same way on every
// phone and browser (and the same as in Voltrix): "9 Oct", "Thu 9 Oct". Days are the client's
// own date (YYYY-MM-DD).

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

// 'Thu'
export function weekdayShort(day: string): string {
  return WEEKDAY[fromDayKey(day).getDay()];
}
