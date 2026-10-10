import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Button, Notice, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// A wrong email or password shows at the password; anything else (too many tries, no connection)
// is about the attempt, so it shows above the Sign in button.
type Problem = { field: 'email' | 'password' | 'form'; text: string } | null;

const WRONG = /invalid login credentials|invalid_credentials/i;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function signIn() {
    setProblem(null);
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
      });
  }

  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your Voltrix Coach account."
      footer={
        <>
          {problem?.field === 'form' ? <Notice tone="danger">{problem.text}</Notice> : null}
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <TextLink lead="New here?" label="Create an account" onPress={() => router.replace('/sign-up')} />
        </>
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (problem?.field === 'email') setProblem(null);
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
