import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Field, PasswordField } from '@/components/field';
import { Button, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Problem = { field: 'email' | 'password'; text: string } | null;

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
    if (error) setProblem({ field: 'password', text: plainError(error) });
  }

  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your Voltrix Coach account."
      footer={
        <>
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <TextLink lead="New here?" label="Create an account" onPress={() => router.replace('/sign-up')} />
        </>
      }>
      <Field
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
      <PasswordField
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
      <TextLink label="Forgot password?" onPress={() => router.push('/forgot-password')} />
    </AuthPage>
  );
}
