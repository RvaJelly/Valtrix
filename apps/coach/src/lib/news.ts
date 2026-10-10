// News for the person: what someone else did that they should know about (a client booked or
// cancelled, someone asked to train, a trainer answered). The same file in Voltrix and Voltrix Coach.
// The database keeps each piece of news until it has been seen, so nothing is missed while the app is
// closed, and sends a live `news` event as it happens. RLS keeps every row the person's own.

import { supabase } from '@/lib/supabase';

export type NewsKind =
  | 'booked'
  | 'requested'
  | 'cancelled'
  | 'training_request'
  | 'health'
  | 'booking_answered'
  | 'training_answered';

export type News = {
  id: string;
  kind: NewsKind;
  client_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  seen_at: string | null;
};

const COLUMNS = 'id, kind, client_id, payload, created_at, seen_at';
const DAY_MS = 86_400_000;

// The person's news, newest first: only some kinds, only unseen, only the last `days` days, a page
// of `limit` from `offset`. Errors are thrown.
export async function loadNews(
  opts: { kinds?: NewsKind[]; unseen?: boolean; days?: number; limit?: number; offset?: number } = {},
): Promise<News[]> {
  let query = supabase.from('news').select(COLUMNS);
  if (opts.kinds?.length) query = query.in('kind', opts.kinds);
  if (opts.unseen) query = query.is('seen_at', null);
  if (opts.days) query = query.gte('created_at', new Date(Date.now() - opts.days * DAY_MS).toISOString());
  const from = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  const { data, error } = await query.order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (error) throw error;
  return ((data ?? []) as News[]).map((n) => ({ ...n, payload: n.payload ?? {} }));
}

// Marks these as seen.
export async function markSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('news').update({ seen_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}

// Marks every unseen one as seen, or every unseen one of these kinds.
export async function markAllSeen(kinds?: NewsKind[]): Promise<void> {
  let query = supabase.from('news').update({ seen_at: new Date().toISOString() }).is('seen_at', null);
  if (kinds?.length) query = query.in('kind', kinds);
  const { error } = await query;
  if (error) throw error;
}

// The day news was last tidied on this phone, so it happens once a day while the app runs.
let prunedOn: string | null = null;

// Once a day: removes the person's own news older than 90 days. Best effort; errors are ignored.
export async function pruneOldNews(): Promise<void> {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (prunedOn === today) return;
  prunedOn = today;
  try {
    await supabase
      .from('news')
      .delete()
      .lt('created_at', new Date(now.getTime() - 90 * DAY_MS).toISOString());
  } catch {
    // Tidying up can wait for tomorrow.
  }
}
