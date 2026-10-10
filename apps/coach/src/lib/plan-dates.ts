// Days and weeks for plans and programs, on the person's own dates as "YYYY-MM-DD". Weeks run
// Monday to Sunday. The same rules as the database (plan_item_runs, assign_program) and as
// Voltrix, so the trainer and the client count the same. Pure: no runtime imports, so the unit
// checks can load it as it is.

const DAY_MS = 86_400_000;

function toTime(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function fromTime(time: number) {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysTo(day: string, days: number): string {
  return fromTime(toTime(day) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

// 1 = Monday … 7 = Sunday.
export function isoWeekday(day: string): number {
  return ((new Date(toTime(day)).getUTCDay() + 6) % 7) + 1;
}

export function mondayOf(day: string): string {
  return addDaysTo(day, 1 - isoWeekday(day));
}

function earlier(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

type Dated = { starts_on: string | null; ends_on: string | null };

// Does a plan workout run on this day: from its first day to its last, and not after its
// program's end (the earlier of the two). No dates: every day, as before round 2.
export function runsOn(item: Dated, day: string, assignmentEnd?: string | null): boolean {
  const end = earlier(item.ends_on, assignmentEnd);
  return (!item.starts_on || day >= item.starts_on) && (!end || day <= end);
}

// How many times a plan workout is due in the week starting `monday`: each chosen weekday it
// runs on, or once for an any-day workout that runs on some day of the week.
export function timesThisWeek(item: Dated & { weekdays: number[] }, monday: string, assignmentEnd?: string | null) {
  if (item.weekdays.length) {
    return item.weekdays.filter((d) => runsOn(item, addDaysTo(monday, d - 1), assignmentEnd)).length;
  }
  const end = earlier(item.ends_on, assignmentEnd);
  const sunday = addDaysTo(monday, 6);
  return (!item.starts_on || item.starts_on <= sunday) && (!end || end >= monday) ? 1 : 0;
}

// Where a program on a plan is: "Week 3 of 8", and whether this is its last week.
export function programWeek(
  p: { starts_on: string; weeks: number; ends_on?: string | null },
  today: string,
): { week: number; weeks: number; last: boolean; started: boolean } {
  const days = daysBetween(p.starts_on, today);
  const started = days >= 0;
  const week = Math.min(p.weeks, Math.floor(days / 7) + 1);
  const end = p.ends_on ?? addDaysTo(p.starts_on, p.weeks * 7 - 1);
  return { week: Math.max(1, week), weeks: p.weeks, last: started && mondayOf(today) === mondayOf(end), started };
}

// Mondays a program can start on: this week's while it is Monday to Wednesday, then the next ones,
// four in all.
export function startChoices(today: string): string[] {
  const monday = mondayOf(today);
  const first = isoWeekday(today) <= 3 ? monday : addDaysTo(monday, 7);
  return [0, 1, 2, 3].map((i) => addDaysTo(first, i * 7));
}

// The last day of what a new program replaces: the day before it starts, or yesterday when it
// starts earlier this week (the database's rule).
export function cutDate(startMonday: string, today: string): string {
  const a = addDaysTo(startMonday, -1);
  const b = addDaysTo(today, -1);
  return a > b ? a : b;
}

type WeekSpan = { week_from: number; week_to: number | null };

// The distinct week ranges of a program's slots ("Weeks 1–4", "Weeks 5–8"), sorted. Slots that
// start after the program's last week are left out.
export function weekRanges(slots: WeekSpan[], weeks: number): [number, number][] {
  const seen = new Map<string, [number, number]>();
  for (const s of slots) {
    if (s.week_from > weeks) continue;
    const range: [number, number] = [s.week_from, Math.min(s.week_to ?? weeks, weeks)];
    seen.set(range.join('-'), range);
  }
  return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// The weeks a slot runs in, within the program.
export function slotWeeks(s: WeekSpan, weeks: number): [number, number] | null {
  if (s.week_from > weeks) return null;
  return [s.week_from, Math.min(s.week_to ?? weeks, weeks)];
}

// "3 days a week": the most training days in any one week (the distinct weekdays used, plus one
// for each any-day slot).
export function daysPerWeek(slots: ({ weekdays: number[] } & Partial<WeekSpan>)[], weeks = 52): number {
  if (!slots.length) return 0;
  let best = 0;
  const last = Math.min(52, Math.max(1, weeks));
  for (let w = 1; w <= last; w++) {
    const running = slots.filter((s) => (s.week_from ?? 1) <= w && w <= Math.min(s.week_to ?? last, last));
    const days = new Set(running.flatMap((s) => s.weekdays));
    best = Math.max(best, Math.min(7, days.size + running.filter((s) => !s.weekdays.length).length));
  }
  return best;
}
