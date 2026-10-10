import type { PayMethod } from '@/lib/paid';
import { callRpc, rpcOrThrow } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// Session packs: a client pays for a number of sessions at once, and every booking for them uses a
// pack with room, whoever books it. Room, used and left are counted by the database from sessions.

export type Pack = {
  id: string;
  client_id: string;
  sessions_total: number;
  // Done, and no-shows while the trainer charges for them.
  used: number;
  booked: number;
  sessions_left: number;
  price_cents: number;
  currency: string;
  sold_on: string;
  expires_on: string | null;
  ended: boolean;
  paid_on: string | null;
  paid_method: PayMethod | null;
  note: string | null;
};

// The trainer's packs (one client's), newest first. Errors are thrown; an older database answers
// an empty list.
export async function loadPacks(clientId?: string): Promise<Pack[]> {
  const answer = await callRpc<Pack[]>('client_packs', clientId ? { p_client: clientId } : {});
  if (answer.missing) return [];
  return (answer.data ?? []).map((p) => ({
    ...p,
    sessions_total: Number(p.sessions_total ?? 0),
    used: Number(p.used ?? 0),
    booked: Number(p.booked ?? 0),
    sessions_left: Number(p.sessions_left ?? 0),
    price_cents: Number(p.price_cents ?? 0),
    ended: !!p.ended,
  }));
}

// Sells a pack today in the trainer's currency. Answers the new pack and how many sessions moved
// onto it. Refusals are thrown as they come (for addFailure).
export async function sellPack(input: {
  clientId: string;
  sessions: number;
  priceCents: number;
  expiresOn: string | null;
  paidOn: string | null;
  method: PayMethod | null;
  note: string | null;
  useBooked: boolean;
  useUnpaid: boolean;
}): Promise<{ pack_id: string; moved: number }> {
  const answer = await rpcOrThrow<{ pack_id: string; moved: number }>('sell_pack', {
    p_client: input.clientId,
    p_sessions: input.sessions,
    p_price_cents: input.priceCents,
    p_expires_on: input.expiresOn,
    p_paid_on: input.paidOn,
    p_paid_method: input.method,
    p_note: input.note,
    p_use_booked: input.useBooked,
    p_use_unpaid: input.useUnpaid,
  });
  return { pack_id: answer.pack_id, moved: Number(answer.moved ?? 0) };
}

// Changes a pack; the database reprices its sessions when the price or size changes.
export async function savePack(
  id: string,
  patch: Partial<Pick<Pack, 'sessions_total' | 'price_cents' | 'expires_on' | 'paid_on' | 'paid_method' | 'note'>>,
): Promise<void> {
  const { error } = await supabase.from('session_packs').update(patch).eq('id', id);
  if (error) throw error;
}

// Removes a pack none of whose sessions is used yet; its booked sessions go back to the client's price.
export async function removePack(id: string): Promise<void> {
  const { error } = await supabase.from('session_packs').delete().eq('id', id);
  if (error) throw error;
}
