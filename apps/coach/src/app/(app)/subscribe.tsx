import { Redirect } from 'expo-router';

import { SubscribeView } from '@/components/subscribe-view';
import { coachAccess, trialEnded } from '@/lib/access';
import { useAuth } from '@/lib/auth';

// The plan, opened from Settings while the free trial runs. The modal's header names it, so the page
// has no logo. Trainers who already pay, the owner and free trainers have nothing to sign up for.
export default function Subscribe() {
  const { profile } = useAuth();
  const access = coachAccess(profile);
  if (access.kind === 'subscribed' || access.kind === 'owner' || access.kind === 'free') {
    return <Redirect href="/settings" />;
  }
  return (
    <SubscribeView
      mode={access.kind === 'trial' ? 'trial' : trialEnded(profile) ? 'ended' : 'start'}
      daysLeft={access.kind === 'trial' ? access.daysLeft : undefined}
      name={profile?.full_name}
      trialEndsAt={access.kind === 'trial' ? access.endsAt : undefined}
    />
  );
}
