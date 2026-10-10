import { SubscribeView } from '@/components/subscribe-view';
import { coachAccess, trialEnded } from '@/lib/access';
import { useAuth } from '@/lib/auth';

export default function Subscribe() {
  const { profile } = useAuth();
  const access = coachAccess(profile);
  return (
    <SubscribeView
      mode={trialEnded(profile) ? 'ended' : 'start'}
      trialEndsAt={access.kind === 'trial' ? access.endsAt : undefined}
    />
  );
}
