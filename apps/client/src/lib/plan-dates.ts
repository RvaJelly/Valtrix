// The dates a plan workout runs on, worked out on YYYY-MM-DD days (the person's own dates), the
// same way the database does. No runtime imports, so it can be checked on its own.
//
// A plan workout runs from starts_on to ends_on, both included. Rows made before programs have no
// dates and run every week. A program's rows each run for their own weeks of it; ends_on is
// already the earlier of the row's own end and its program's.

type Dated = { starts_on: string | null; ends_on: string | null };

const DAY_MS = 86_400_000;

function toUtc(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number) {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

// The day `days` after `day` (before it when negative).
export function addDay(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS);
}

// Whole days from `from` to `to`.
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

// 1 = Monday to 7 = Sunday.
export function weekdayOf(day: string): number {
  return ((new Date(toUtc(day)).getUTCDay() + 6) % 7) + 1;
}

// The Monday of the week that holds `day`.
export function mondayOf(day: string): string {
  return addDay(day, 1 - weekdayOf(day));
}

// `assignmentEnd`, when given, is its program's last day; the earlier end wins. (my_plan_v2 already
// gives each row the earlier of the two as its ends_on.)
export function runsOn(item: Dated, day: string, assignmentEnd?: string | null): boolean {
  if (assignmentEnd && day > assignmentEnd) return false;
  return (!item.starts_on || day >= item.starts_on) && (!item.ends_on || day <= item.ends_on);
}

// How many times a workout is due in the week starting `monday`: once for each chosen weekday it
// runs on that week, or, for an any-day workout, once when it runs on any day of that week.
export function timesThisWeek(
  item: Dated & { weekdays: number[] },
  monday: string,
  assignmentEnd?: string | null,
): number {
  if (item.weekdays.length) {
    return [...new Set(item.weekdays)].filter(
      (wd) => wd >= 1 && wd <= 7 && runsOn(item, addDay(monday, wd - 1), assignmentEnd),
    ).length;
  }
  const sunday = addDay(monday, 6);
  const end = assignmentEnd && (!item.ends_on || assignmentEnd < item.ends_on) ? assignmentEnd : item.ends_on;
  return (!item.starts_on || item.starts_on <= sunday) && (!end || end >= monday) ? 1 : 0;
}

// Where a program is on `today`: "Week 3 of 8". `last` is true from the week that holds its last
// day (which is earlier than planned after "End program").
export function programWeek(
  p: { starts_on: string; weeks: number; ends_on?: string | null },
  today: string,
): { week: number; weeks: number; last: boolean } {
  const now = Math.floor(daysBetween(p.starts_on, today) / 7) + 1;
  const endWeek = p.ends_on ? Math.floor(daysBetween(p.starts_on, p.ends_on) / 7) + 1 : p.weeks;
  return { week: Math.min(Math.max(now, 1), p.weeks), weeks: p.weeks, last: now >= Math.min(endWeek, p.weeks) };
}

// The first day from `from` (included) up to `to` that a workout is due: its first chosen weekday
// within its dates, or its first day for an any-day workout. Null when there is none.
export function firstDayFrom(item: Dated & { weekdays: number[] }, from: string, to: string): string | null {
  let day = item.starts_on && item.starts_on > from ? item.starts_on : from;
  const last = item.ends_on && item.ends_on < to ? item.ends_on : to;
  for (let i = 0; i < 7 && day <= last; i += 1, day = addDay(day, 1)) {
    if (!item.weekdays.length || item.weekdays.includes(weekdayOf(day))) return day;
  }
  return null;
}
