// Weekly booking hours on the trainer's clock: ranges like Monday 06:00 to 12:00. The database checks
// them (booking_hours_ok); this says what's wrong in words while the trainer edits, and tidies them.
// Pure: only type imports, so the unit checks can load it as it is.

import type { HoursRange } from '@/lib/booking-rules';

export const MAX_RANGES = 42;
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FROM = /^([01][0-9]|2[0-3]):[0-5][05]$/;
const TO = /^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$/;

function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function clock(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// What's wrong with the hours, in words, or null when they're fine. Overlapping ranges on one day are
// named; touching ones are fine (they join when saved).
export function hoursProblem(ranges: HoursRange[]): string | null {
  if (ranges.length > MAX_RANGES) return `Keep to ${MAX_RANGES} sets of hours.`;
  for (const r of ranges) {
    if (!Number.isInteger(r.day) || r.day < 1 || r.day > 7) return 'Pick a day for these hours.';
    if (!FROM.test(r.from) || !TO.test(r.to)) return 'Pick times on the hour, or every 5 minutes.';
    if (r.to <= r.from) return 'End after it starts.';
  }
  for (let day = 1; day <= 7; day += 1) {
    const sorted = ranges.filter((r) => r.day === day).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    for (let i = 1; i < sorted.length; i += 1) {
      const before = sorted[i - 1];
      if (sorted[i].from < before.to) {
        return `${before.from} to ${before.to} overlaps ${sorted[i].from} to ${sorted[i].to}.`;
      }
    }
  }
  return null;
}

// Sorted by day and time, with touching or overlapping ranges on a day joined into one.
export function normaliseHours(ranges: HoursRange[]): HoursRange[] {
  const out: HoursRange[] = [];
  for (let day = 1 as HoursRange['day']; day <= 7; day = (day + 1) as HoursRange['day']) {
    const sorted = ranges
      .filter((r) => r.day === day && r.to > r.from)
      .map((r) => ({ from: minutes(r.from), to: minutes(r.to) }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    let current: { from: number; to: number } | null = null;
    for (const r of sorted) {
      if (current && r.from <= current.to) current.to = Math.max(current.to, r.to);
      else {
        if (current) out.push({ day, from: clock(current.from), to: clock(current.to) });
        current = { ...r };
      }
    }
    if (current) out.push({ day, from: clock(current.from), to: clock(current.to) });
  }
  return out;
}

// One day's hours: "06:00–12:00, 16:00–19:00", or "Closed".
export function dayHours(ranges: HoursRange[], day: number): string {
  const mine = normaliseHours(ranges).filter((r) => r.day === day);
  return mine.length ? mine.map((r) => `${r.from}–${r.to}`).join(', ') : 'Closed';
}

// The week in one line: "Mon–Fri 06:00–10:00 · Sat 08:00–12:00", or "Closed every day". Days in a row
// with the same hours share a span.
export function hoursSummary(ranges: HoursRange[]): string {
  const text = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const mine = normaliseHours(ranges).filter((r) => r.day === day);
    return mine.map((r) => `${r.from}–${r.to}`).join(', ');
  });
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    if (!text[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && text[j + 1] === text[i]) j += 1;
    const span = j > i ? `${DAYS_SHORT[i]}–${DAYS_SHORT[j]}` : DAYS_SHORT[i];
    parts.push(`${span} ${text[i]}`);
    i = j + 1;
  }
  return parts.length ? parts.join(' · ') : 'Closed every day';
}

// A length of time in words for the booking rules: '30 min', '1 hour', '12 hours', '1 day', '2 weeks'.
export function durationWords(total: number): string {
  if (total >= 10080 && total % 10080 === 0) return total === 10080 ? '1 week' : `${total / 10080} weeks`;
  if (total >= 1440 && total % 1440 === 0) return total === 1440 ? '1 day' : `${total / 1440} days`;
  if (total >= 60 && total % 60 === 0) return total === 60 ? '1 hour' : `${total / 60} hours`;
  return `${total} min`;
}
