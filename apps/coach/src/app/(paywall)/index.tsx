import { SafeAreaView } from 'react-native-safe-area-context';

import { SubscribeView } from '@/components/subscribe-view';
import { useAuth } from '@/lib/auth';

// Shown instead of the app once the free trial is over and there is no subscription.
export default function Paywall() {
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <SubscribeView trialEnded onSignOut={signOut} />
    </SafeAreaView>
  );
}
