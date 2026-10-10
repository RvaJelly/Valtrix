import { SubscribeView } from '@/components/subscribe-view';
import { coachAccess, trialEnded } from '@/lib/access';
import { useAuth } from '@/lib/auth';

// The plan, opened from Settings. The modal's header names it, so the page has no logo.
export default function Subscribe() {
  const { profile } = useAuth();
  const access = coachAccess(profile);
  return (
    <SubscribeView
      mode={trialEnded(profile) ? 'ended' : 'start'}
      name={profile?.full_name}
      trialEndsAt={access.kind === 'trial' ? access.endsAt : undefined}
    />
  );
}
