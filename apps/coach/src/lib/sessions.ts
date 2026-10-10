import type { Client } from '@/lib/clients';
import { longDate, time24 } from '@/lib/format';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export type Session = {
  id: string;
  client_id: string | null;
  title: string | null;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  status: SessionStatus;
  // A video call in the apps instead of meeting in person.
  online: boolean;
  clients: Pick<Client, 'first_name' | 'last_name' | 'user_id'> | null;
};

export const SESSION_COLUMNS =
  'id, client_id, title, starts_at, duration_minutes, location, notes, status, online, clients(first_name, last_name, user_id)';

export const ONLINE_LABEL = 'Online · Video call';

export const SESSION_STATUS: Record<SessionStatus, string> = {
  scheduled: 'Booked',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const DURATIONS: Record<string, string> = {
  '30': '30 min',
  '45': '45 min',
  '60': '1 hour',
  '90': '1½ hours',
  '120': '2 hours',
};

// Bookable start times, every 30 minutes from 05:00 to 21:30.
export const START_TIMES = Array.from({ length: 34 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export function sessionName(s: Pick<Session, 'title' | 'clients'>) {
  if (s.clients) return [s.clients.first_name, s.clients.last_name].filter(Boolean).join(' ');
  return s.title ?? 'Session';
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Weeks start on Monday.
export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// YYYY-MM-DD in local time, for passing a day between screens.
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromDayKey(key: string | undefined) {
  const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : startOfDay(new Date());
}

export function timeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function combine(day: Date, time: string) {
  const [h, m] = time.split(':').map(Number);
  const d = startOfDay(day);
  d.setHours(h, m);
  return d;
}

// '18:00', the same on every phone.
export function formatTime(date: Date) {
  return time24(date);
}

// 'Today', 'Tomorrow' or 'Monday 12 October'.
export function formatDay(date: Date, today = new Date()) {
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, addDays(today, 1))) return 'Tomorrow';
  return longDate(date, today);
}

export function endOf(s: Pick<Session, 'starts_at' | 'duration_minutes'>) {
  return new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60_000);
}

export function overlaps(
  a: Pick<Session, 'starts_at' | 'duration_minutes'>,
  b: Pick<Session, 'starts_at' | 'duration_minutes'>,
) {
  return new Date(a.starts_at) < endOf(b) && new Date(b.starts_at) < endOf(a);
}
