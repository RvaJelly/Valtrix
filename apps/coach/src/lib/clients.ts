import { supabase } from '@/lib/supabase';

export type ClientStatus = 'active' | 'paused' | 'archived';

// Where a client is with the Voltrix app (app_status in the database). Adding a client's
// email invites them; only 'joined' (they accepted) links them, which brings their food
// diary, workouts, progress, check-ins, habits, plan ticks, chat and calls. 'gone' is a
// client who left and isn't on Voltrix with the email on the client now: the chat and
// history stay theirs, so nobody else can be invited on that client.
export type AppStatus = 'not_on_app' | 'invited' | 'declined' | 'joined' | 'left' | 'gone';

export type Client = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  goal: string | null;
  notes: string | null;
  status: ClientStatus;
  user_id: string | null;
  created_at: string;
  app_status: AppStatus | null;
  // The client's own price for a session, in cents (null: the trainer's usual price).
  session_price_cents: number | null;
  // When the trainer last shared an invite (WhatsApp, copy or share), and when the client answered.
  invite_shared_at: string | null;
  invite_answered_at: string | null;
};

export const CLIENT_COLUMNS =
  'id, first_name, last_name, email, phone, goal, notes, status, user_id, created_at, app_status, session_price_cents, invite_shared_at, invite_answered_at';

export function fullName(client: Pick<Client, 'first_name' | 'last_name'>) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ');
}

export function initials(client: Pick<Client, 'first_name' | 'last_name'>) {
  return ((client.first_name[0] ?? '') + (client.last_name?.[0] ?? '')).toUpperCase();
}

export const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export const APP_STATUS_LABELS: Record<AppStatus, string> = {
  not_on_app: 'Not on Voltrix yet',
  invited: 'Invite waiting',
  declined: 'Declined',
  joined: 'Joined',
  left: 'Left',
  gone: 'Left',
};

// The database works it out; user_id decides when it is missing.
export function appStatusOf(client: Pick<Client, 'app_status' | 'user_id'>): AppStatus {
  return client.app_status ?? (client.user_id ? 'joined' : 'not_on_app');
}

// How long a shared invite code works (the database's rule).
export const INVITE_DAYS = 30;

// What Voltrix Coach shows everywhere (pills, lists, the client page): an invite the trainer shared in the
// last 30 days reads as sent ("Invite waiting"), whoever ends up entering its code. The database says
// 'invited' only once the person can see the invite in Voltrix (an account with the email on the client),
// and the WhatsApp message follows that, so it keeps using appStatusOf.
export function shownStatusOf(
  client: Pick<Client, 'app_status' | 'user_id'> & { invite_shared_at?: string | null },
  now = Date.now(),
): AppStatus {
  const status = appStatusOf(client);
  const shared = client.invite_shared_at ? Date.parse(client.invite_shared_at) : NaN;
  return status === 'not_on_app' && now - shared <= INVITE_DAYS * 86_400_000 ? 'invited' : status;
}

// Invites a client who declined or left again. They see the invite in the Voltrix app.
export async function inviteAgain(clientId: string) {
  const { error } = await supabase.rpc('invite_client_again', { p_client: clientId });
  if (error) throw error;
}

// Another of the trainer's clients (not archived) with this email in any case, if there is
// one, so the trainer isn't adding the same person twice. Null when it can't be checked.
export async function clientWithEmail(email: string | null, exceptId?: string) {
  if (!email) return null;
  const { data } = await supabase.from('clients').select('id, first_name, last_name, email').neq('status', 'archived');
  const rows = (data ?? []) as Pick<Client, 'id' | 'first_name' | 'last_name' | 'email'>[];
  return rows.find((c) => c.id !== exceptId && c.email?.trim().toLowerCase() === email.trim().toLowerCase()) ?? null;
}
