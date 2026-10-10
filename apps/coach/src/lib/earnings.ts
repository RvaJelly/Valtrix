// What the trainer earned: session_totals() answers sessions by status, whether they have ended,
// and currency, with their count, how many have no price and the sum of the prices.

import { callRpc, rpcOrThrow } from '@/lib/rpc';

export type Totals = {
  status: string;
  past: boolean;
  currency: string;
  sessions: number;
  unpriced: number;
  cents: number;
};

// The totals from `from` up to (not including) `to`, or null on a database without the function.
export async function loadTotals(from: Date, to: Date, client?: string): Promise<Totals[] | null> {
  const answer = await callRpc<Totals[]>('session_totals', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    ...(client ? { p_client: client } : {}),
  });
  if (answer.missing) return null;
  return (answer.data ?? []).map((t) => ({
    ...t,
    past: !!t.past,
    sessions: Number(t.sessions ?? 0),
    unpriced: Number(t.unpriced ?? 0),
    cents: Number(t.cents ?? 0),
  }));
}

// Done sessions in the trainer's currency, and whether any session counted has a price.
export function earnedFrom(totals: Totals[], currency: string) {
  let cents = 0;
  let priced = false;
  for (const t of totals) {
    if (t.sessions - t.unpriced > 0) priced = true;
    if (t.status === 'completed' && t.currency === currency) cents += t.cents;
  }
  return { cents, priced };
}

export type Summary = {
  // Done, in the trainer's currency.
  earned: number;
  done: number;
  noShows: number;
  // Booked and not ended yet, in the trainer's currency.
  ahead: number;
  // Done sessions in other currencies (after a currency change), by currency.
  others: { currency: string; cents: number }[];
  // Done sessions with no price.
  unpriced: number;
  // Any session in the range has a price.
  priced: boolean;
};

export function summarize(totals: Totals[], currency: string): Summary {
  const summary: Summary = { earned: 0, done: 0, noShows: 0, ahead: 0, others: [], unpriced: 0, priced: false };
  const others = new Map<string, number>();
  for (const t of totals) {
    if (t.sessions - t.unpriced > 0) summary.priced = true;
    if (t.status === 'completed') {
      summary.done += t.sessions;
      summary.unpriced += t.unpriced;
      if (t.currency === currency) summary.earned += t.cents;
      else if (t.cents) others.set(t.currency, (others.get(t.currency) ?? 0) + t.cents);
    } else if (t.status === 'no_show') {
      summary.noShows += t.sessions;
    } else if (t.status === 'scheduled' && !t.past && t.currency === currency) {
      summary.ahead += t.cents;
    }
  }
  summary.others = [...others].map(([c, cents]) => ({ currency: c, cents }));
  return summary;
}

// Sessions with no price in the totals, whatever their status (for the first-price question).
export function unpricedOf(totals: Totals[]) {
  return totals.reduce((n, t) => n + t.unpriced, 0);
}

// Gives every unpriced session with a client in the range the client's own price or the usual one.
// Answers how many were priced.
export async function fillPrices(from: Date, to: Date): Promise<number> {
  const count = await rpcOrThrow<number>('fill_session_prices', { p_from: from.toISOString(), p_to: to.toISOString() });
  return Number(count ?? 0);
}

// Round 3's money for a range, per currency: what was earned (sessions done at their price and pack
// sessions at their exact share of the pack), received, owed now, packs sold and places that went
// unused on packs that ended.
export type MoneyTotals = {
  currency: string;
  earned_cents: number;
  session_cents: number;
  pack_cents: number;
  pack_sessions: number;
  unpriced: number;
  ahead_cents: number;
  received_cents: number;
  owed_cents: number;
  packs_sold: number;
  packs_sold_cents: number;
  expired_sessions: number;
  expired_cents: number;
};

const MONEY_NUMBERS = [
  'earned_cents',
  'session_cents',
  'pack_cents',
  'pack_sessions',
  'unpriced',
  'ahead_cents',
  'received_cents',
  'owed_cents',
  'packs_sold',
  'packs_sold_cents',
  'expired_sessions',
  'expired_cents',
] as const;

// money_totals from `from` up to (not including) `to`, or null on a database without it (the caller
// falls back to session_totals). Errors are thrown.
export async function loadMoneyTotals(from: Date, to: Date): Promise<MoneyTotals[] | null> {
  const answer = await callRpc<MoneyTotals[]>('money_totals', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (answer.missing) return null;
  return (answer.data ?? []).map((row) => {
    const out = { ...row };
    for (const key of MONEY_NUMBERS) out[key] = Number(row[key] ?? 0);
    return out;
  });
}

// The row for one currency, or zeros.
export function totalsIn(rows: MoneyTotals[], currency: string): MoneyTotals {
  return (
    rows.find((r) => r.currency === currency) ?? {
      currency,
      earned_cents: 0,
      session_cents: 0,
      pack_cents: 0,
      pack_sessions: 0,
      unpriced: 0,
      ahead_cents: 0,
      received_cents: 0,
      owed_cents: 0,
      packs_sold: 0,
      packs_sold_cents: 0,
      expired_sessions: 0,
      expired_cents: 0,
    }
  );
}
