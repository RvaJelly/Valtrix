// Time zones, the same file in Voltrix and Voltrix Coach. The database keeps the trainer's zone and
// answers times on the trainer's clock itself; the apps only compare zones and name them, and work
// out a day and time on a zone's clock for the booking form's words. Pure: no runtime imports, so the
// unit checks can load it as it is.

export const HOME_ZONE = 'Africa/Johannesburg';

// The short list in the time zone picker: southern Africa first, then the places trainers and clients
// travel to most.
export const COMMON_ZONES: string[] = [
  'Africa/Johannesburg',
  'Africa/Harare',
  'Africa/Windhoek',
  'Africa/Gaborone',
  'Africa/Maputo',
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Cairo',
  'Europe/London',
  'Asia/Dubai',
  'Australia/Sydney',
  'America/New_York',
];

const DAY_MS = 86_400_000;
const two = (n: number) => String(n).padStart(2, '0');

// The phone's own zone ('Africa/Johannesburg'), or null when the phone can't say.
export function deviceZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone ? zone : null;
  } catch {
    return null;
  }
}

// The wall clock of an instant in a zone, or null when this phone can't work it out.
function wallClock(at: Date, zone: string): { y: number; m: number; d: number; h: number; min: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const clock = { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
    return Object.values(clock).every(Number.isFinite) ? clock : null;
  } catch {
    return null;
  }
}

// How many minutes a zone is ahead of UTC at an instant, or null when this phone can't say.
function offsetMinutes(zone: string, at: Date): number | null {
  const c = wallClock(at, zone);
  if (!c) return null;
  const asUtc = Date.UTC(c.y, c.m - 1, c.d, c.h, c.min);
  const instant = Math.floor(at.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - instant) / 60_000);
}

// The same zone: equal names, or the same offset now, in mid-January and in mid-July, so either
// hemisphere's daylight saving shows (Johannesburg and Harare are the same clock all year;
// Johannesburg and Paris, or London and Lagos, are not).
export function sameZone(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const now = new Date();
  const year = now.getUTCFullYear();
  for (const at of [now, new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12))]) {
    const x = offsetMinutes(a, at);
    const y = offsetMinutes(b, at);
    if (x == null || y == null || x !== y) return false;
  }
  return true;
}

// The place a zone is named after: 'Africa/Johannesburg' → 'Johannesburg',
// 'America/New_York' → 'New York', 'America/Argentina/Buenos_Aires' → 'Buenos Aires'.
export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

// Every zone this phone knows, or the short list when it can't list them.
export function allZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const list = typeof supported === 'function' ? supported('timeZone') : null;
    if (list && list.length) return list;
  } catch {
    // Older engines: the short list below.
  }
  return [...COMMON_ZONES];
}

// The day ('2026-10-13'), time ('07:00') and weekday (Monday 1 … Sunday 7) of an instant on a zone's
// clock; the phone's clock when this phone can't work out the zone's.
export function zonedParts(at: Date, zone: string): { day: string; time: string; weekday: number } {
  const c = wallClock(at, zone) ?? {
    y: at.getFullYear(),
    m: at.getMonth() + 1,
    d: at.getDate(),
    h: at.getHours(),
    min: at.getMinutes(),
  };
  const weekday = ((new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7) + 1;
  return { day: `${c.y}-${two(c.m)}-${two(c.d)}`, time: `${two(c.h)}:${two(c.min)}`, weekday };
}

// 'YYYY-MM-DD' → that day at 12:00 on the phone's clock, so it is the same day in any zone the
// phone is in (an invalid key answers today at 12:00).
export function dayFromKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

// Calendar arithmetic on 'YYYY-MM-DD': '2026-10-31' + 1 → '2026-11-01'.
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}`;
}
