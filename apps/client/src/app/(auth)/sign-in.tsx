import { router } from 'expo-router';
import { useState } from 'react';

import { AuthPage } from '@/components/auth-page';
import { PasswordField } from '@/components/password-field';
import { Button, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Problem = { field: 'email' | 'password'; text: string } | null;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setProblem(null);
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter your email.' });
    if (!password) return setProblem({ field: 'password', text: 'Enter your password.' });
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // On success the root layout moves to the app on its own.
    if (error) setProblem({ field: 'password', text: plainError(error) });
  }

  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your Voltrix account."
      footer={
        <>
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <TextLink lead="New here?" label="Create an account" onPress={() => router.replace('/sign-up')} />
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
        error={problem?.field === 'email' ? problem.text : undefined}
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={signIn}
        error={problem?.field === 'password' ? problem.text : undefined}
      />
      <TextLink label="Forgot password?" onPress={() => router.push('/forgot-password')} />
    </AuthPage>
  );
}
