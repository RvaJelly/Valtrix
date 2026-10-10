// Repeat bookings in words and numbers, for the booking form. The database makes the sessions (12
// weeks ahead, topped up as time goes on); this only counts what the button will book. Pure: no
// runtime imports, so the unit checks can load it as it is.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function utc(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function keyOf(time: number) {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// How many sessions a repeat books now: every week from the first day to the earlier of `until` and
// today + 83 days (the database makes 12 weeks at a time), less the skipped days.
export function seriesCount(firstDay: string, until: string | null, today: string, skip: string[]): number {
  const horizon = utc(today) + 83 * DAY_MS;
  const last = until ? Math.min(utc(until), horizon) : horizon;
  const skipped = new Set(skip);
  let count = 0;
  for (let t = utc(firstDay); t <= last; t += 7 * DAY_MS) {
    if (!skipped.has(keyOf(t))) count += 1;
  }
  return count;
}

// The day of the last session of a repeat that runs `weeks` weeks: firstDay + 7 × (weeks − 1).
export function untilDay(firstDay: string, weeks: number): string {
  return keyOf(utc(firstDay) + 7 * Math.max(0, weeks - 1) * DAY_MS);
}

// "Every Tuesday at 07:00" (weekday Monday 1 … Sunday 7).
export function repeatLabel(weekday: number, time: string): string {
  return `Every ${WEEKDAYS[(weekday + 6) % 7]} at ${time.slice(0, 5)}`;
}

// "Tuesday" for weekday 2.
export function weekdayName(weekday: number): string {
  return WEEKDAYS[(weekday + 6) % 7];
}
