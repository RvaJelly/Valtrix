import { SafeAreaView } from 'react-native-safe-area-context';

import { SubscribeView } from '@/components/subscribe-view';
import { trialEnded } from '@/lib/access';
import { useAuth } from '@/lib/auth';

// Shown instead of the app until the trainer has added a card and started
// their trial, and again if the subscription lapses.
export default function Paywall() {
  const { profile, signOut } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <SubscribeView mode={trialEnded(profile) ? 'ended' : 'start'} onSignOut={signOut} />
    </SafeAreaView>
  );
}
