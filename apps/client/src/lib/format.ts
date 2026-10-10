// Dates and times the South African way, built by hand so every phone and browser agrees:
// 24-hour times ('18:00'), day before month ('Friday 9 October'), weeks from Monday.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const two = (n: number) => String(n).padStart(2, '0');

// '07:05', '18:00'
export function time24(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

// '18:00–19:00'
export function timeRange(a: Date, b: Date): string {
  return `${time24(a)}–${time24(b)}`;
}

// 'Friday 9 October', with the year when it isn't this year.
export function longDate(d: Date, now = new Date()): string {
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

// 'Fri 9 Oct', with the year when it isn't this year.
export function shortDate(d: Date, now = new Date()): string {
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${weekdayShort(d)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${year}`;
}

// '18 October'
export function dayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// 'October 2026'
export function monthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// '18 Oct'
export function dayMonthShort(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

// 'Mon'
export function weekdayShort(d: Date): string {
  return WEEKDAYS[d.getDay()].slice(0, 3);
}

// 'Monday'
export function weekdayLong(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

// 'now', 'in 25 min', 'in 3 h', 'tomorrow', 'in 4 days'
export function relative(d: Date, now = new Date()): string {
  const minutes = Math.round((d.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86_400_000);
  if (days === 0) return `in ${Math.round(minutes / 60)} h`;
  if (days === 1) return minutes < 12 * 60 ? `in ${Math.round(minutes / 60)} h` : 'tomorrow';
  return `in ${days} days`;
}

// 'just now', '5 min ago', '3 hours ago', 'yesterday', '4 days ago', else 'on 12 Oct'.
export function ago(d: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const hours = Math.floor(minutes / 60);
  if (days === 0 || hours < 12) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${dayMonthShort(d)}`;
}
