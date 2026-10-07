import { SubscribeView } from '@/components/subscribe-view';
import { useAuth } from '@/lib/auth';

export default function Subscribe() {
  const { profile } = useAuth();
  return <SubscribeView mode={profile?.trial_ends_at ? 'ended' : 'start'} />;
}
