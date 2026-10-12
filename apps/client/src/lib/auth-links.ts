import type { AuthResponse, EmailOtpType, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { confirm, notice } from '@/lib/confirm';
import { authLink, takeHeldLink, type AuthLink } from '@/lib/links';
import { linkChecker, supabase } from '@/lib/supabase';

// A link from a sign-up or password email opens the app (see emailRedirect), on a phone and on the web
// (where it was taken out of the address as the app started: see takeHeldLink). This signs the person in
// with what the link carries: a sign-up link straight into the app, a password link on to the New password
// screen (onRecovery). An expired link says how to get a new one.
//
// A link never changes who is signed in without asking. Anyone can send a link to their own account, and
// a phone that quietly switched to it would then save its workouts, photos and messages there. So with
// someone signed in, a link is checked first (by a client that keeps nothing): one for the same account
// goes on as before, and one for another account asks, with Cancel keeping things as they are.
export function useAuthLinks(onRecovery: (recovering: boolean) => void) {
  useEffect(() => {
    const go = (url: string | null) => {
      if (url) openLink(url, onRecovery).catch(() => {});
    };
    if (Platform.OS === 'web') {
      // The link held as the app started, once the stored session has loaded.
      supabase.auth
        .getSession()
        .then(() => go(takeHeldLink()))
        .catch(() => {});
      return;
    }
    Linking.getInitialURL()
      .then(go)
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => go(url));
    return () => subscription.remove();
  }, [onRecovery]);
}

// The link opened last: the first one can arrive twice (getInitialURL and the url event).
let last: string | null = null;

async function openLink(url: string, onRecovery: (recovering: boolean) => void) {
  if (url === last) return;
  const link = authLink(url);
  if (!link) return;
  last = url;
  if (link.kind === 'error') {
    notice('This link has expired', 'Links in our emails work once, for a short time. Go to Sign in to get a new one.');
    return;
  }
  const recovery = link.type === 'recovery';
  const { data } = await supabase.auth.getSession();
  const current = data.session;
  let signIn: () => Promise<AuthResponse>;
  if (!current) {
    signIn = () =>
      link.kind === 'session'
        ? supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
        : supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type as EmailOtpType });
  } else {
    const checked = await checkLink(link);
    if (!checked) return failed();
    if (checked.user.id !== current.user.id) {
      const switching = await confirm(
        'Sign in as the account in this link?',
        `You’re signed in as ${current.user.email ?? 'someone else'}. This link is for ${checked.user.email ?? 'another account'}. Switch only if you asked for this email yourself.`,
        'Switch account',
      );
      if (!switching) return;
    }
    signIn = () =>
      supabase.auth.setSession({ access_token: checked.access_token, refresh_token: checked.refresh_token });
  }
  // Before the session arrives, so the app goes straight to New password.
  if (recovery) onRecovery(true);
  const { error } = await signIn();
  if (error) {
    if (recovery) onRecovery(false);
    failed();
  }
}

// The session a link signs in to, checked with Supabase while the person signed in here stays signed in.
async function checkLink(link: Exclude<AuthLink, { kind: 'error' }>): Promise<Session | null> {
  const auth = linkChecker().auth;
  const { data, error } =
    link.kind === 'session'
      ? await auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      : await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type as EmailOtpType });
  return error ? null : data.session;
}

function failed() {
  notice('This link didn’t work', 'It may have expired or been used already. Go to Sign in to get a new one.');
}
