import type { EmailOtpType } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

import { authLink } from '@/lib/links';
import { supabase } from '@/lib/supabase';

// On a phone, a link from a sign-up or password email opens the app (see emailRedirect). This signs the
// person in with what the link carries: a sign-up link straight into the app, a password link on to the
// New password screen (onRecovery). An expired link says how to get a new one. The web reads these links
// by itself (detectSessionInUrl), so this does nothing there.
export function useAuthLinks(onRecovery: (recovering: boolean) => void) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let last: string | null = null;
    async function open(url: string | null) {
      if (!url || url === last) return;
      const link = authLink(url);
      if (!link) return;
      last = url;
      if (link.kind === 'error') {
        Alert.alert(
          'This link has expired',
          'Links in our emails work once, for a short time. Go to Sign in to get a new one.',
        );
        return;
      }
      const recovery = link.type === 'recovery';
      // Before the session arrives, so the app goes straight to New password.
      if (recovery) onRecovery(true);
      const { error } =
        link.kind === 'session'
          ? await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
          : await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type as EmailOtpType });
      if (error) {
        if (recovery) onRecovery(false);
        Alert.alert(
          'This link didn’t work',
          'It may have expired or been used already. Go to Sign in to get a new one.',
        );
      }
    }
    Linking.getInitialURL()
      .then(open)
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      open(url).catch(() => {});
    });
    return () => subscription.remove();
  }, [onRecovery]);
}
