import type { AppStatus, ClientStatus } from '@/lib/clients';
import { callRpc } from '@/lib/rpc';

// One client of the signed-in trainer as clients_overview_v2() sees them: the client row, their
// sessions with this trainer, and (only while they are linked) what they logged. Home, Needs
// you and the client page all read it.
export type ClientOverview = {
  client_id: string;
  first_name: string;
  last_name: string | null;
  status: ClientStatus;
  app_status: AppStatus;
  email: string | null;
  phone: string | null;
  created_at: string;
  invited_at: string | null;
  invite_code_at: string | null;
  invite_shared_at: string | null;
  // The person is linked now (accepted, and still the person the row is locked to).
  linked: boolean;
  joined_at: string | null;
  // The name on the linked person's Voltrix account.
  account_name: string | null;
  session_price_cents: number | null;
  sessions_done: number;
  no_shows: number;
  no_shows_30d: number;
  // Started in the last 30 days, ended, still Booked.
  open_sessions: number;
  last_session_at: string | null;
  next_session_at: string | null;
  last_workout_on: string | null;
  last_workout_name: string | null;
  last_tick_on: string | null;
  plan_planned_week: number;
  // Null when not linked.
  plan_done_week: number | null;
  program_id: string | null;
  program_name: string | null;
  program_starts_on: string | null;
  program_weeks: number | null;
  program_ends_on: string | null;
  last_check_in_week: string | null;
  unanswered_check_ins: number;
  unanswered_since: string | null;
  unanswered_check_in_id: string | null;
  // Round 3 (clients_overview_v2): null or 0 on an older database.
  // This client may book the trainer's open times in Voltrix (only matters once booking is on).
  self_booking: boolean;
  // The day the trainer noted a doctor's OK.
  doctor_ok_on: string | null;
  // The health form: missing, clear, doctor (a yes, no doctor's OK since it was signed) or
  // doctor_ok; null while the trainer may not read it.
  health: 'missing' | 'clear' | 'doctor' | 'doctor_ok' | null;
  health_signed_at: string | null;
  // Owed now in the trainer's currency, how many items, since when, and whether anything is owed in
  // another currency.
  owed_cents: number;
  owed_count: number;
  owed_since: string | null;
  owed_other: boolean;
  // The pack in use: the one the next booking would use, else the newest still running.
  pack_id: string | null;
  pack_total: number;
  pack_used: number;
  pack_booked: number;
  pack_left: number;
  pack_expires_on: string | null;
  pack_paid: boolean;
  // Repeat bookings still running, and booking requests waiting for an answer.
  series_count: number;
  booking_requests: number;
};

// Every active or paused client (or just one, archived too), or null when the database doesn't
// have the function yet. Reads clients_overview_v2, or round 2's clients_overview on an older
// database (the round 3 fields then read as nothing). Other errors are thrown.
export async function loadOverview(today: string, clientId?: string): Promise<ClientOverview[] | null> {
  const args = clientId ? { p_today: today, p_client: clientId } : { p_today: today };
  let answer = await callRpc<ClientOverview[]>('clients_overview_v2', args);
  if (answer.missing) answer = await callRpc<ClientOverview[]>('clients_overview', args);
  if (answer.missing) return null;
  return (answer.data ?? []).map((row) => ({
    ...row,
    sessions_done: Number(row.sessions_done ?? 0),
    no_shows: Number(row.no_shows ?? 0),
    no_shows_30d: Number(row.no_shows_30d ?? 0),
    open_sessions: Number(row.open_sessions ?? 0),
    plan_planned_week: Number(row.plan_planned_week ?? 0),
    unanswered_check_ins: Number(row.unanswered_check_ins ?? 0),
    self_booking: row.self_booking ?? true,
    doctor_ok_on: row.doctor_ok_on ?? null,
    health: row.health ?? null,
    health_signed_at: row.health_signed_at ?? null,
    owed_cents: Number(row.owed_cents ?? 0),
    owed_count: Number(row.owed_count ?? 0),
    owed_since: row.owed_since ?? null,
    owed_other: !!row.owed_other,
    pack_id: row.pack_id ?? null,
    pack_total: Number(row.pack_total ?? 0),
    pack_used: Number(row.pack_used ?? 0),
    pack_booked: Number(row.pack_booked ?? 0),
    pack_left: Number(row.pack_left ?? 0),
    pack_expires_on: row.pack_expires_on ?? null,
    pack_paid: !!row.pack_paid,
    series_count: Number(row.series_count ?? 0),
    booking_requests: Number(row.booking_requests ?? 0),
  }));
}
