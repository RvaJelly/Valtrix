import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// Booking a time with a trainer in Voltrix: what the trainer allows (booking_info), their open start
// times (open_slots), booking one (book_slot), and the person's waiting requests and packs. The
// database decides who may book and which times are free; the app shows what it answers. Clients
// never see a price, a payment or what anything costs.

export type BookingReason = 'not_linked' | 'paused' | 'off' | 'lapsed';

export type BookingInfo = {
  can_book: boolean;
  reason: BookingReason | null;
  client_id?: string;
  trainer_id?: string;
  trainer_name?: string | null;
  business_name?: string | null;
  trainer_avatar?: string | null;
  // The trainer's clock, where the sessions happen.
  time_zone?: string;
  // Today on the trainer's clock, 'YYYY-MM-DD'.
  today?: string;
  mode?: 'approve' | 'auto' | null;
  lengths?: number[] | null;
  notice_minutes?: number | null;
  horizon_days?: number | null;
  cancel_minutes?: number | null;
  step_minutes?: number | null;
  max_ahead?: number | null;
  location?: string | null;
};

// An open start time: the instant, and its day and time on the trainer's clock ('YYYY-MM-DD', 'HH:MM').
export type OpenTime = { starts_at: string; local_day: string; local_time: string };

export type MyTimeRequest = {
  id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  trainer_avatar: string | null;
  client_id: string;
  starts_at: string;
  duration_minutes: number;
  note: string | null;
  status: 'pending' | 'expired' | 'approved' | 'declined' | 'withdrawn';
  session_id: string | null;
  created_at: string;
  answered_at: string | null;
};

// A pack of sessions with one trainer: how many it holds, used, booked and left. Never its price.
export type MyPack = {
  id: string;
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  sessions_total: number;
  used: number;
  booked: number;
  sessions_left: number;
  sold_on: string;
  expires_on: string | null;
  ended: boolean;
};

const num = (v: unknown) => (v == null ? null : Number(v));

// What the trainer allows this person, or null on an older database (no booking in the app yet).
export async function loadBookingInfo(trainerId: string): Promise<BookingInfo | null> {
  const answer = await callRpc<BookingInfo | null>('booking_info', { p_trainer: trainerId });
  if (answer.missing || !answer.data) return null;
  const d = answer.data;
  return {
    ...d,
    reason: d.reason ?? null,
    lengths: Array.isArray(d.lengths) ? d.lengths.map(Number) : null,
    notice_minutes: num(d.notice_minutes),
    horizon_days: num(d.horizon_days),
    cancel_minutes: num(d.cancel_minutes),
    step_minutes: num(d.step_minutes),
    max_ahead: num(d.max_ahead),
  };
}

// Open start times from `from` (the trainer's day) for `days` days (1 to 31), for a session of `minutes`.
export async function loadOpenTimes(trainerId: string, from: string, days: number, minutes: number) {
  const { data, error } = await supabase.rpc('open_slots', {
    p_trainer: trainerId,
    p_from: from,
    p_days: days,
    p_minutes: minutes,
  });
  if (error) throw error;
  return ((data ?? []) as OpenTime[]).map((t) => ({
    starts_at: t.starts_at,
    local_day: String(t.local_day).slice(0, 10),
    local_time: String(t.local_time).slice(0, 5),
  }));
}

export type Booked =
  | { kind: 'booked'; session_id: string; starts_at: string }
  | { kind: 'requested'; request_id: string; starts_at: string };

// Books the time (Instant), or asks the trainer for it (Ask me first). A refusal comes as the
// database's own sentence ("That time was just taken. Pick another time.").
export async function bookTime(trainerId: string, startsAt: string, minutes: number, note: string | null) {
  const { data, error } = await supabase.rpc('book_slot', {
    p_trainer: trainerId,
    p_starts_at: startsAt,
    p_minutes: minutes,
    p_note: note,
  });
  if (error) throw error;
  return data as Booked;
}

// The person's requests for a time: waiting (or expired in the last day), and answered or withdrawn in
// the last 14 days, newest first. Null on an older database.
export async function loadMyTimeRequests(): Promise<MyTimeRequest[] | null> {
  const answer = await callRpc<MyTimeRequest[] | null>('my_booking_requests');
  if (answer.missing) return null;
  return (answer.data ?? []).map((r) => ({ ...r, duration_minutes: Number(r.duration_minutes) }));
}

// True when it was withdrawn now; false when the trainer had answered it already.
export async function withdrawTime(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('withdraw_booking', { p_request: id });
  if (error) throw error;
  return data === true;
}

// The person's packs still running or ended in the last 14 days. Null on an older database.
export async function loadMyPacks(): Promise<MyPack[] | null> {
  const answer = await callRpc<MyPack[] | null>('my_packs');
  if (answer.missing) return null;
  return (answer.data ?? []).map((p) => ({
    ...p,
    sessions_total: Number(p.sessions_total),
    used: Number(p.used),
    booked: Number(p.booked),
    sessions_left: Number(p.sessions_left),
    sold_on: String(p.sold_on).slice(0, 10),
    expires_on: p.expires_on ? String(p.expires_on).slice(0, 10) : null,
    ended: !!p.ended,
  }));
}

// Where a refused booking leaves the page: the time went or the rules changed (load the times again),
// a limit was reached (wait), or the person can't book now at all (load what the trainer allows again).
export function bookingRefusal(message: string): 'times' | 'limit' | 'info' | null {
  if (/just taken|too soon to book|too far ahead to book|isn.t open for booking/i.test(message)) return 'times';
  if (/booked already|booked a lot today/i.test(message)) return 'limit';
  if (/paused your sessions|take bookings in the app|own trainer only/i.test(message)) return 'info';
  return null;
}
