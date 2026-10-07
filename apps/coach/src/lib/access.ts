import type { Profile } from '@/lib/auth';

export const PRICE_LABEL = '$50';

type Access =
  | { kind: 'subscribed' }
  | { kind: 'trial'; endsAt: Date; daysLeft: number }
  | { kind: 'none' };

// Mirrors public.has_coach_access() in the database.
export function coachAccess(profile: Profile | null, now = new Date()): Access {
  if (!profile) return { kind: 'none' };
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
