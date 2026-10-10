import { router } from 'expo-router';
import { useState } from 'react';

import { AuthPage, CheckEmailActions } from '@/components/auth-page';
import { Button, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

// Also works when this page was opened from a link, with nothing to go back to.
function backToSignIn() {
  if (router.canGoBack()) router.back();
  else router.replace('/sign-in');
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resend, setResend] = useState<{ busy: boolean; done: boolean; error: string | null }>({
    busy: false,
    done: false,
    error: null,
  });

  function request() {
    return supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: emailRedirect() });
  }

  async function send() {
    setError(null);
    if (!email.trim()) return setError('Enter the email you signed up with.');
    setBusy(true);
    const { error } = await request();
    setBusy(false);
    if (error) return setError(plainError(error));
    setSent(true);
  }

  async function sendAgain() {
    setResend({ busy: true, done: false, error: null });
    const { error } = await request();
    setResend({ busy: false, done: !error, error: error ? plainError(error) : null });
  }

  if (sent) {
    return (
      <AuthPage
        title="Check your email"
        icon="mail-outline"
        intro={`If ${email.trim()} has a Voltrix account, we’ve sent it a link to choose a new password.`}
        footer={
          <CheckEmailActions onResend={sendAgain} resending={resend.busy} resent={resend.done} error={resend.error}>
            <TextLink label="Back to sign in" onPress={backToSignIn} />
          </CheckEmailActions>
        }
      />
    );
  }

  return (
    <AuthPage
      title="Reset your password"
      intro="Enter your email and we’ll send you a link to choose a new password."
      footer={
        <>
          <Button title="Send reset link" onPress={send} loading={busy} />
          <TextLink label="Back to sign in" onPress={backToSignIn} />
        </>
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        onSubmitEditing={send}
        error={error ?? undefined}
      />
    </AuthPage>
  );
}
