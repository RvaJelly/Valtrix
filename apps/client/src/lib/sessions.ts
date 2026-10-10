import { longDate, time24 } from '@/lib/format';
import { callRpc } from '@/lib/rpc';
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
  // From my_sessions_v3; on an older database these are null and false.
  trainer_id: string | null;
  // Made by a weekly repeat booking.
  repeats: boolean;
  // The person booked it themselves in Voltrix.
  booked_by_me: boolean;
  // The person cancelled it in Voltrix.
  cancelled_by_me: boolean;
  // Paid for with a pack of sessions (never for a cancelled one). No money is ever shown.
  on_pack: boolean;
  // Until when the person may cancel it in the app: null when they can't, a time in the past when no longer.
  cancel_until: string | null;
};

type SessionV2 = Omit<
  Session,
  'trainer_id' | 'repeats' | 'booked_by_me' | 'cancelled_by_me' | 'on_pack' | 'cancel_until'
>;

export const ONLINE_LABEL = 'Online · Video call';

// The signed-in client's sessions from one time up to another. An older database without
// my_sessions_v3 answers through my_sessions_v2, with the newer fields left empty.
export async function loadSessions(from: Date, to: Date): Promise<Session[]> {
  const range = { range_start: from.toISOString(), range_end: to.toISOString() };
  const v3 = await callRpc<Session[] | null>('my_sessions_v3', range);
  if (!v3.missing) return (v3.data ?? []).map((s) => ({ ...s, duration_minutes: Number(s.duration_minutes) }));
  const { data, error } = await supabase.rpc('my_sessions_v2', range);
  if (error) throw error;
  return ((data ?? []) as SessionV2[]).map((s) => ({
    ...s,
    trainer_id: null,
    repeats: false,
    booked_by_me: false,
    cancelled_by_me: false,
    on_pack: false,
    cancel_until: null,
  }));
}

// Cancels one of the person's booked sessions in the app, within their trainer's cut-off. True when it
// was cancelled now, false when it was cancelled already. The database explains a refusal in a sentence.
export async function cancelMySession(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_my_session', { p_session: id });
  if (error) throw error;
  return data === true;
}

// A session the client didn't come to reads "Missed", in a neutral grey: Voltrix Coach says
// "No-show" to the trainer.
export const SESSION_STATUS: Record<SessionStatus, string> = {
  scheduled: 'Booked',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'Missed',
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
