import type { Profile } from '@/lib/auth';
import { callRpc } from '@/lib/rpc';
import { HOME_ZONE, zonedParts } from '@/lib/zones';

export const PRICE_LABEL = '$50';
export const TRIAL_DAYS = 14;

type Access =
  | { kind: 'owner' }
  | { kind: 'free' }
  | { kind: 'subscribed' }
  // daysLeft: whole days after today until the day the trial ends, on the trainer's clock (0 on its last day).
  | { kind: 'trial'; endsAt: Date; daysLeft: number }
  | { kind: 'none' };

// True once the trainer's free trial has run out (not while it is still going).
export function trialEnded(profile: Profile | null, now = new Date()): boolean {
  return !!profile?.trial_ends_at && new Date(profile.trial_ends_at) <= now;
}

// Mirrors public.has_coach_access() in the database.
// Prices and the country don't matter here, so the admin list's rows (without them) fit too; without a
// time zone, days are counted on South African time.
export function coachAccess(
  profile:
    | (Omit<
        Profile,
        'country' | 'currency' | 'session_price_cents' | 'time_zone' | 'accepting_clients' | 'charge_no_shows'
      > & { time_zone?: string | null })
    | null,
  now = new Date(),
): Access {
  if (!profile) return { kind: 'none' };
  if (profile.is_admin) return { kind: 'owner' };
  if (profile.free_access) return { kind: 'free' };
  const expires = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
  if (['active', 'past_due', 'cancelled'].includes(profile.subscription_status) && expires && expires > now) {
    return { kind: 'subscribed' };
  }
  const trialEnd = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  if (trialEnd && trialEnd > now) {
    const zone = profile.time_zone || HOME_ZONE;
    const days = (Date.parse(zonedParts(trialEnd, zone).day) - Date.parse(zonedParts(now, zone).day)) / 86_400_000;
    return { kind: 'trial', endsAt: trialEnd, daysLeft: Math.max(0, Math.round(days)) };
  }
  return { kind: 'none' };
}

// 'Last day', '1 day left', '10 days left': the same words on Home, in Settings and on the owner's list.
export function trialLeft(daysLeft: number): string {
  if (daysLeft <= 0) return 'Last day';
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

// Card payments aren't connected yet, so the trainer starts the free trial without a card, and once a trial
// has ended keeps going free for another TRIAL_DAYS days (start_my_trial in the database). False when the
// database doesn't have the function yet.
export async function startTrial(): Promise<boolean> {
  const answer = await callRpc<string | null>('start_my_trial');
  return !answer.missing;
}
