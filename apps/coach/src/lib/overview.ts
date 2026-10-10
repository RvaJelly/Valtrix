import type { AppStatus, ClientStatus } from '@/lib/clients';
import { callRpc } from '@/lib/rpc';

// One client of the signed-in trainer as clients_overview() sees them: the client row, their
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
};

// Every active or paused client (or just one, archived too), or null when the database doesn't
// have the function yet. Other errors are thrown.
export async function loadOverview(today: string, clientId?: string): Promise<ClientOverview[] | null> {
  const answer = await callRpc<ClientOverview[]>(
    'clients_overview',
    clientId ? { p_today: today, p_client: clientId } : { p_today: today },
  );
  if (answer.missing) return null;
  return (answer.data ?? []).map((row) => ({
    ...row,
    sessions_done: Number(row.sessions_done ?? 0),
    no_shows: Number(row.no_shows ?? 0),
    no_shows_30d: Number(row.no_shows_30d ?? 0),
    open_sessions: Number(row.open_sessions ?? 0),
    plan_planned_week: Number(row.plan_planned_week ?? 0),
    unanswered_check_ins: Number(row.unanswered_check_ins ?? 0),
  }));
}
