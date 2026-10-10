import { useSyncExternalStore } from 'react';

import { callRpc, rpcOrThrow } from '@/lib/rpc';

// Requests waiting for the trainer's answer: clients asking for a time in Voltrix, and people asking
// to train with them. The Home tab's badge counts the ones still waiting.

export type TimeRequest = {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string | null;
  starts_at: string;
  duration_minutes: number;
  note: string | null;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'expired';
  created_at: string;
  answered_at: string | null;
  session_id: string | null;
  // Something else is at that time now.
  clashes: boolean;
};

export type PersonRequest = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  note: string | null;
  phone: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
  created_at: string;
  answered_at: string | null;
  client_id: string | null;
  // Only once accepted.
  email: string | null;
};

// ---------- The waiting count, for the Home tab's badge ----------

let waiting = 0;
const listeners = new Set<() => void>();

function setWaiting(n: number) {
  if (n === waiting) return;
  waiting = n;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWaitingCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => waiting,
    () => 0,
  );
}

function countWaiting(times: TimeRequest[], people: PersonRequest[], now = Date.now()) {
  return (
    times.filter((t) => t.status === 'pending' && Date.parse(t.starts_at) > now).length +
    people.filter((p) => p.status === 'pending').length
  );
}

// Both lists, waiting ones first, or null on an older database (nothing to show). Errors are thrown.
// Also sets the waiting count.
export async function loadRequests(): Promise<{ times: TimeRequest[]; people: PersonRequest[] } | null> {
  const [times, people] = await Promise.all([
    callRpc<TimeRequest[]>('booking_requests_for_me'),
    callRpc<PersonRequest[]>('training_requests_for_me'),
  ]);
  if (times.missing && people.missing) {
    setWaiting(0);
    return null;
  }
  const t = (times.data ?? []).map((r) => ({
    ...r,
    duration_minutes: Number(r.duration_minutes),
    clashes: !!r.clashes,
  }));
  const p = people.data ?? [];
  setWaiting(countWaiting(t, p));
  return { times: t, people: p };
}

// Counts again (the tab bar calls it on start, on return to the app and after news). Failures keep
// the last count.
export async function refreshWaitingCount(): Promise<void> {
  try {
    await loadRequests();
  } catch {
    // The badge keeps what it showed.
  }
}

// Approves (making the session, answering its id) or declines a time asked for. Refusals are thrown
// as they come; a time filled since carries the hint 'busy' (see isBusy).
export async function answerTime(id: string, approve: boolean, evenIfBusy = false): Promise<string | null> {
  const session = await rpcOrThrow<string | null>('answer_booking', {
    p_request: id,
    p_approve: approve,
    p_even_if_busy: evenIfBusy,
  });
  return session ?? null;
}

// Accepts (linking the person as a client, answering the client row) or declines someone asking to
// train; `block` also blocks them.
export async function answerPerson(id: string, accept: boolean, block = false): Promise<string | null> {
  const client = await rpcOrThrow<string | null>('answer_request', {
    p_request: id,
    p_accept: accept,
    p_block: block,
  });
  return client ?? null;
}

// The trainer has something else at that time now.
export function isBusy(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { hint?: unknown }).hint === 'busy';
}

// Removes one request from the count straight away (it was answered here).
export function answeredOne() {
  setWaiting(Math.max(0, waiting - 1));
}
