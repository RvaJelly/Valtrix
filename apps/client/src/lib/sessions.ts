import { supabase } from '@/lib/supabase';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

// A session with one of the client's trainers, as the my_sessions_v2 function returns it.
export type Session = {
  id: string;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  status: SessionStatus;
  trainer_name: string | null;
  business_name: string | null;
  // A video call in the apps instead of meeting in person.
  online: boolean;
  // The client's link with the trainer, which is also the chat to call in.
  client_id: string;
  trainer_avatar: string | null;
};

export const ONLINE_LABEL = 'Online · Video call';

// The signed-in client's sessions from one time up to another.
export async function loadSessions(from: Date, to: Date) {
  const { data, error } = await supabase.rpc('my_sessions_v2', {
    range_start: from.toISOString(),
    range_end: to.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as Session[];
}

export const SESSION_STATUS: Record<SessionStatus, string> = {
  scheduled: 'Booked',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export function trainerName(s: Pick<Session, 'trainer_name' | 'business_name'>) {
  return s.trainer_name || s.business_name || 'Your trainer';
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

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// YYYY-MM-DD in local time, for grouping sessions by day.
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDay(date: Date, today = new Date()) {
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, addDays(today, 1))) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function endOf(s: Pick<Session, 'starts_at' | 'duration_minutes'>) {
  return new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60_000);
}
