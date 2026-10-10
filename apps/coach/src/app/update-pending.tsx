import { useState } from 'react';

import { AuthPage } from '@/components/auth-page';
import { Button, Notice, TextLink } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';

// Shown when this version of Voltrix Coach finds a database that hasn't been updated for it yet, so
// most screens couldn't load. Nothing is lost: the app opens by itself once the update is in, each
// time it comes back to the front, or with Try again.
export default function UpdatePending() {
  const { recheckProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  async function tryAgain() {
    setBusy(true);
    const fresh = await recheckProfile();
    // The update is in: the root layout opens the app.
    if (fresh && !fresh.older_database) return;
    setBusy(false);
    setTried(true);
    haptic.warning();
  }

  return (
    <AuthPage
      title="Almost ready"
      intro="This version of Voltrix Coach is waiting for an update on our side. Your clients, sessions and plans are safe, and nothing is lost."
      footer={
        <>
          <Button title="Try again" onPress={tryAgain} loading={busy} testID="update-try-again" />
          <TextLink label="Sign out" onPress={signOut} />
        </>
      }>
      {tried ? <Notice>Not quite yet. Try again in a few minutes.</Notice> : null}
    </AuthPage>
  );
}
