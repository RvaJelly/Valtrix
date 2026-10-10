import type { Client } from '@/lib/clients';
import type { PayMethod } from '@/lib/paid';
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
  // What it costs, kept from when it was booked (0 is free; null: no price known), in this currency.
  price_cents: number | null;
  currency: string | null;
  // When it was last marked done, no-show or cancelled (null while booked).
  marked_at: string | null;
  // The repeat booking that made it (null: a one-off).
  series_id: string | null;
  // The pack it uses (its price is then the pack's share).
  pack_id: string | null;
  // The day it was marked paid and how (never for a pack session: its pack is paid instead).
  paid_on: string | null;
  paid_method: PayMethod | null;
  // The person who booked it in Voltrix (null when the trainer booked it), the person who cancelled
  // it in Voltrix, and what the client wrote when booking.
  booked_by: string | null;
  cancelled_by: string | null;
  client_note: string | null;
  // When the row was made (when the client booked it, for "Booked by").
  created_at?: string;
  clients: Pick<Client, 'first_name' | 'last_name' | 'user_id'> | null;
};

export const SESSION_COLUMNS =
  'id, client_id, title, starts_at, duration_minutes, location, notes, status, online, price_cents, currency, marked_at, series_id, pack_id, paid_on, paid_method, booked_by, cancelled_by, client_note, created_at, clients(first_name, last_name, user_id)';

// A session can be marked done or as a no-show from 15 minutes before it starts (the database's
// rule too).
export const MARK_GRACE_MS = 15 * 60_000;

export function canMark(s: Pick<Session, 'starts_at'>, now = Date.now()) {
  return new Date(s.starts_at).getTime() - MARK_GRACE_MS <= now;
}

// Booked, has ended, and nobody has said what happened yet.
export function toMark(s: Pick<Session, 'status' | 'starts_at' | 'duration_minutes'>, now = Date.now()) {
  return s.status === 'scheduled' && endOf(s).getTime() <= now;
}

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

// "Sam Jones and Pieter Botha", "Sam Jones, Pieter Botha and 2 more".
export function namesOf(sessions: Pick<Session, 'title' | 'clients'>[]) {
  const names = sessions.map(sessionName);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
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
  return time24(date);
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
