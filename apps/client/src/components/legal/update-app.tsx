import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Button, Notice, Text, TextLink } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useTerms, versionDate } from '@/lib/terms';

// The latest Android builds (the release workflow names them by app).
const DOWNLOADS = {
  coach: 'https://github.com/RvaJelly/valtrix/releases/latest/download/voltrix-coach.apk',
  client: 'https://github.com/RvaJelly/valtrix/releases/latest/download/voltrix.apk',
} as const;

// Shown when our Terms are newer than this build knows: it can't show them, so it asks for the update
// first. Calm, with one thing to do. The same file in Voltrix and Voltrix Coach.
export function UpdateApp() {
  const terms = useTerms();
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const name = terms.appName;

  async function act() {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    if (Platform.OS === 'android') {
      Linking.openURL(DOWNLOADS[terms.app]).catch(() => {});
      return;
    }
    // iPhone: check again, in case the version was a mistake that has been put right.
    setBusy(true);
    await terms.checkVersion();
    setBusy(false);
    setTried(true);
    haptic.warning();
  }

  return (
    <AuthPage
      title={`Please update ${name} to continue`}
      intro={`Our Terms were updated on ${versionDate(terms.current).replace(/ /g, '\u00A0')}. This version of ${name} can’t show them, so it needs updating before you carry on. Nothing you’ve saved is lost.`}
      footer={
        <>
          <Button
            title={Platform.OS === 'web' ? 'Reload' : Platform.OS === 'android' ? 'Download the update' : 'Check again'}
            icon={Platform.OS === 'android' ? 'download-outline' : 'refresh-outline'}
            onPress={act}
            loading={busy}
            testID="update-app"
          />
          {session ? <TextLink lead="Not your account?" label={'Sign\u00A0out'} onPress={signOut} /> : null}
        </>
      }>
      {Platform.OS === 'android' ? (
        <Text variant="footnote" tone="secondary">
          The download opens in your browser. Open the file when it has finished, then tap Update.
        </Text>
      ) : Platform.OS === 'ios' ? (
        <Text variant="footnote" tone="secondary">
          Install the latest version of {name} the way you installed this one, then open it again.
        </Text>
      ) : null}
      {tried ? <Notice>This is still the version before the update.</Notice> : null}
    </AuthPage>
  );
}
