import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Button, Notice, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

// A wrong email or password shows at the password; anything else (too many tries, no connection)
// is about the attempt, so it shows above the Sign in button. An account whose email isn't confirmed
// yet carries that email, for sending the confirmation link again.
type Problem = { field: 'email' | 'password' | 'form'; text: string; unconfirmed?: string } | null;
type Resend = { busy: boolean; done: boolean; error: string | null };

const WRONG = /invalid login credentials|invalid_credentials/i;
const UNCONFIRMED = /email not confirmed|email_not_confirmed/i;
const NO_RESEND: Resend = { busy: false, done: false, error: null };

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState<Resend>(NO_RESEND);
  const passwordRef = useRef<TextInput>(null);

  async function signIn() {
    setProblem(null);
    setResend(NO_RESEND);
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter your email.' });
    if (!password) return setProblem({ field: 'password', text: 'Enter your password.' });
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // On success the root layout moves to the app on its own.
    if (error) {
      const why = `${error.message} ${error.code ?? ''}`;
      setProblem({
        field: WRONG.test(why) ? 'password' : 'form',
        text: plainError(error),
        unconfirmed: UNCONFIRMED.test(why) ? email.trim() : undefined,
      });
    }
  }

  // The link from sign-up was lost or has expired: a new one, to the email they signed in with.
  async function sendLink(to: string) {
    setResend({ busy: true, done: false, error: null });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: to,
      options: { emailRedirectTo: emailRedirect() },
    });
    setResend({ busy: false, done: !error, error: error ? plainError(error) : null });
  }

  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your Voltrix account."
      footer={
        <>
          {problem?.unconfirmed ? (
            resend.done ? (
              <Notice tone="success">
                We sent a new link to {problem.unconfirmed}. Open it to confirm your account, then sign in.
              </Notice>
            ) : (
              <Notice
                tone="danger"
                action={{
                  label: 'Resend link',
                  onPress: () => sendLink(problem.unconfirmed!),
                  loading: resend.busy,
                  testID: 'sign-in-resend',
                }}>
                {resend.error ?? problem.text}
              </Notice>
            )
          ) : problem?.field === 'form' ? (
            <Notice tone="danger">{problem.text}</Notice>
          ) : null}
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <TextLink lead="New here?" label="Create an account" onPress={() => router.replace('/sign-up')} />
        </>
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          // A new link goes to the email that was signed in with, so a changed email drops the offer.
          if (problem?.field === 'email' || problem?.unconfirmed) setProblem(null);
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={problem?.field === 'email' ? problem.text : undefined}
      />
      <TextField
        password
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (problem?.field === 'password') setProblem(null);
        }}
        autoComplete="current-password"
        textContentType="password"
        enterKeyHint="go"
        onSubmitEditing={signIn}
        error={problem?.field === 'password' ? problem.text : undefined}
      />
      <TextLink end label="Forgot password?" onPress={() => router.push('/forgot-password')} />
    </AuthPage>
  );
}
