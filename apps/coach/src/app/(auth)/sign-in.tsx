import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Button, Notice, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

// A wrong email or password shows at the password; anything else (too many tries, no connection)
// is about the attempt, so it shows above the Sign in button. An email not confirmed yet can have its
// link sent again from here.
type Problem = { field: 'email' | 'password' | 'form'; text: string; unconfirmed?: boolean } | null;

const WRONG = /invalid login credentials|invalid_credentials/i;
const UNCONFIRMED = /email not confirmed|email_not_confirmed/i;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState({ busy: false, sentTo: null as string | null });
  const passwordRef = useRef<TextInput>(null);

  async function signIn() {
    setProblem(null);
    setResend({ busy: false, sentTo: null });
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter the email you signed up with.' });
    if (!password) return setProblem({ field: 'password', text: 'Enter your password.' });
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // On success the root layout moves to the app on its own.
    if (error)
      setProblem({
        field: WRONG.test(`${error.message} ${error.code ?? ''}`) ? 'password' : 'form',
        text: plainError(error),
        unconfirmed: UNCONFIRMED.test(`${error.message} ${error.code ?? ''}`),
      });
  }

  // A new confirmation link, for someone who lost the first one.
  async function sendLinkAgain() {
    const to = email.trim();
    setResend({ busy: true, sentTo: null });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: to,
      options: { emailRedirectTo: emailRedirect() },
    });
    if (error) {
      setResend({ busy: false, sentTo: null });
      setProblem({ field: 'form', text: plainError(error), unconfirmed: true });
    } else {
      setResend({ busy: false, sentTo: to });
    }
  }

  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your Voltrix Coach account."
      footer={
        <>
          {resend.sentTo ? (
            <Notice tone="success">
              {`We sent a new link to ${resend.sentTo}. Open it to confirm your account, then sign in.`}
            </Notice>
          ) : problem?.field === 'form' ? (
            <Notice
              tone="danger"
              action={
                problem.unconfirmed
                  ? { label: 'Send it again', onPress: sendLinkAgain, loading: resend.busy, testID: 'resend-link' }
                  : undefined
              }>
              {problem.text}
            </Notice>
          ) : null}
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <TextLink lead="New here?" label={'Create an\u00A0account'} onPress={() => router.replace('/sign-up')} />
        </>
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (problem?.field === 'email' || problem?.unconfirmed) setProblem(null);
          setResend({ busy: false, sentTo: null });
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
