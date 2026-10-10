import AsyncStorage from '@react-native-async-storage/async-storage';

import { dayMonthShort } from '@/lib/format';
import { callRpc, rpcOrThrow } from '@/lib/rpc';
import { dayFromKey } from '@/lib/zones';

// Paid or not: the trainer's own record of money that changed hands (cash, EFT, a card machine).
// Voltrix moves no money. A session not on a pack, or a pack, is paid on a day and in a way; what a
// client owes is counted by the database from what isn't.

export type PayMethod = 'cash' | 'eft' | 'card' | 'other';

export const PAY_METHODS: Record<PayMethod, string> = {
  cash: 'Cash',
  eft: 'EFT',
  card: 'Card',
  other: 'Other',
};

export const PAY_ICONS = {
  cash: 'cash-outline',
  eft: 'swap-horizontal-outline',
  card: 'card-outline',
  other: 'ellipsis-horizontal-outline',
} as const;

export type OwedItem = {
  kind: 'session' | 'pack';
  id: string;
  // The session's day, or the day the pack was sold (the trainer's clock).
  day: string;
  starts_at: string | null;
  status: string | null;
  // A pack's size.
  sessions: number | null;
  cents: number;
  currency: string;
};

// What one client owes now, oldest first (sessions done and charged no-shows not on a pack and not
// paid, and packs not paid). Errors are thrown; an older database answers an empty list.
export async function loadOwed(clientId: string): Promise<OwedItem[]> {
  const answer = await callRpc<OwedItem[]>('owed_items', { p_client: clientId });
  if (answer.missing) return [];
  return (answer.data ?? []).map((i) => ({
    ...i,
    cents: Number(i.cents ?? 0),
    sessions: i.sessions == null ? null : Number(i.sessions),
  }));
}

// Marks sessions and packs paid on a day in a way, or unpaid (paidOn null). Answers how many changed.
export async function setPaid(
  sessions: string[],
  packs: string[],
  paidOn: string | null,
  method?: PayMethod | null,
): Promise<number> {
  const changed = await rpcOrThrow<number>('set_paid', {
    p_sessions: sessions,
    p_packs: packs,
    p_paid_on: paidOn,
    p_method: paidOn ? (method ?? null) : null,
  });
  return Number(changed ?? 0);
}

const LAST_METHOD = 'voltrix.coach.lastPayMethod';

// The way the trainer marked something paid last on this phone, so it comes first next time.
export async function lastMethod(): Promise<PayMethod | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_METHOD);
    return value && value in PAY_METHODS ? (value as PayMethod) : null;
  } catch {
    return null;
  }
}

export async function rememberMethod(m: PayMethod): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_METHOD, m);
  } catch {
    // Only the order of the choices depends on it.
  }
}

// The four ways, the last used first.
export function methodsInOrder(last: PayMethod | null): PayMethod[] {
  const all = Object.keys(PAY_METHODS) as PayMethod[];
  return last ? [last, ...all.filter((m) => m !== last)] : all;
}

// What a client owes, in the same words on every page: "3 sessions and a pack · since 25 Sep" or
// "4 items · since 25 Sep". A count never breaks from its word, nor a day from its month.
export function owedWords(what: string, since: string | null, other = false): string {
  const day = since ? ` · since ${dayMonthShort(dayFromKey(since)).replace(' ', '\u00a0')}` : '';
  return `${what}${day}${other ? ' and more in another currency' : ''}`;
}

// "1 item", "4 items".
export function itemCount(n: number): string {
  return n === 1 ? '1\u00a0item' : `${n}\u00a0items`;
}
