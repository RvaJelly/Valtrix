import { rpcOrThrow, callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// Repeat bookings: a client (or blocked time) every week at the same time on the trainer's clock. The
// database keeps the repeat and makes real sessions 12 weeks ahead, topped up every night and when
// Voltrix Coach opens. One session changes like any other; "this and later" moves the rest.

export type Repeat = {
  id: string;
  client_id: string | null;
  title: string | null;
  // Monday 1 … Sunday 7, on the trainer's clock.
  weekday: number;
  start_time: string;
  duration_minutes: number;
  time_zone: string;
  starts_on: string;
  ends_on: string | null;
  made_until: string;
};

export type Clash = { day: string; starts_at: string; duration_minutes: number; name: string };

const REPEAT_COLUMNS =
  'id, client_id, title, weekday, start_time, duration_minutes, time_zone, starts_on, ends_on, made_until';

// Books a client (or blocked time) every week from `startsAt`. Refusals are thrown as they come.
export async function bookRepeat(input: {
  clientId: string | null;
  title: string | null;
  startsAt: Date;
  minutes: number;
  location: string | null;
  online: boolean;
  notes: string | null;
  priceCents: number | null;
  until: string | null;
  skip: string[];
}): Promise<{ series_id: string; booked: number; first: string; last: string }> {
  const answer = await rpcOrThrow<{ series_id: string; booked: number; first: string; last: string }>('book_series', {
    p_client: input.clientId,
    p_title: input.title,
    p_starts_at: input.startsAt.toISOString(),
    p_duration: input.minutes,
    p_location: input.location,
    p_online: input.online,
    p_notes: input.notes,
    p_price_cents: input.priceCents,
    p_until: input.until,
    p_skip: input.skip,
  });
  return { ...answer, booked: Number(answer.booked ?? 0) };
}

// The trainer's sessions that overlap the next 12 weeks of a repeat (leaving out the repeat itself).
export async function repeatClashes(
  startsAt: Date,
  minutes: number,
  until: string | null,
  repeatId?: string,
): Promise<Clash[]> {
  const answer = await callRpc<Clash[]>('series_clashes', {
    p_starts_at: startsAt.toISOString(),
    p_duration: minutes,
    p_until: until,
    p_series: repeatId ?? null,
  });
  return answer.missing ? [] : (answer.data ?? []);
}

export async function loadRepeat(id: string): Promise<Repeat | null> {
  const { data, error } = await supabase.from('session_series').select(REPEAT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Repeat | null) ?? null;
}

// "This and later": this session and every later booked one move. Answers how many moved.
export async function moveThisAndLater(
  sessionId: string,
  startsAt: Date,
  minutes: number,
  location: string | null,
  online: boolean,
): Promise<number> {
  const moved = await rpcOrThrow<number>('change_series', {
    p_session: sessionId,
    p_starts_at: startsAt.toISOString(),
    p_duration: minutes,
    p_location: location,
    p_online: online,
  });
  return Number(moved ?? 0);
}

// Sets the repeat's last day (null: no end). Ending earlier answers the booked sessions after the
// new end, oldest first, for the app to remove.
export async function setRepeatEnd(id: string, lastDay: string | null): Promise<string[]> {
  const ids = await rpcOrThrow<string[] | null>('set_series_end', { p_series: id, p_last_day: lastDay });
  return ids ?? [];
}

// Removes the named sessions (the trainer's own, by RLS).
export async function removeSessions(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('sessions').delete().in('id', ids);
  if (error) throw error;
}

// The repeat ended but its later sessions couldn't be removed: the caller offers Try again.
export class StopUnfinished extends Error {
  readonly ended = true;
  readonly left: number;
  constructor(left: number) {
    super(`Repeating stopped. ${left} booked ${left === 1 ? 'session is' : 'sessions are'} still there.`);
    this.left = left;
  }
}

function dayBefore(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Stops repeating from `fromDay` (the trainer's day): ends the repeat the day before, then removes its
// booked sessions from that day on. Answers how many were removed; throws StopUnfinished when the end
// was set but the removal failed. Done, no-show and cancelled sessions always stay.
export async function stopRepeat(id: string, fromDay: string): Promise<number> {
  const ids = await setRepeatEnd(id, dayBefore(fromDay));
  try {
    await removeSessions(ids);
  } catch {
    throw new StopUnfinished(ids.length);
  }
  return ids.length;
}

const TOP_UP_EVERY = 6 * 3_600_000;
let toppedUpAt = 0;

// Tops up the trainer's repeats to 12 weeks ahead, at most every 6 hours while the app runs (Home and
// the Calendar share it). Answers how many sessions were made; 0 when skipped or on failure.
export async function topUpRepeats(): Promise<number> {
  if (Date.now() - toppedUpAt < TOP_UP_EVERY) return 0;
  toppedUpAt = Date.now();
  try {
    const answer = await callRpc<number>('extend_series');
    return answer.missing ? 0 : Number(answer.data ?? 0);
  } catch {
    // Try again next time rather than in six hours.
    toppedUpAt = 0;
    return 0;
  }
}
