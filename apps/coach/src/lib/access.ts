import type { Profile } from '@/lib/auth';

export const PRICE_LABEL = '$50';
export const TRIAL_DAYS = 14;

type Access =
  | { kind: 'owner' }
  | { kind: 'free' }
  | { kind: 'subscribed' }
  | { kind: 'trial'; endsAt: Date; daysLeft: number }
  | { kind: 'none' };

// True once the trainer's free trial has run out (not while it is still going).
export function trialEnded(profile: Profile | null, now = new Date()): boolean {
  return !!profile?.trial_ends_at && new Date(profile.trial_ends_at) <= now;
}

// Mirrors public.has_coach_access() in the database.
// Prices and the country don't matter here, so the admin list's rows (without them) fit too.
export function coachAccess(
  profile: Omit<
    Profile,
    'country' | 'currency' | 'session_price_cents' | 'time_zone' | 'accepting_clients' | 'charge_no_shows'
  > | null,
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
    const daysLeft = Math.max(1, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000));
    return { kind: 'trial', endsAt: trialEnd, daysLeft };
  }
  return { kind: 'none' };
}
