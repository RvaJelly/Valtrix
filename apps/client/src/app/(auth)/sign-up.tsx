import { router } from 'expo-router';
import { useState } from 'react';

import { AuthPage, CheckEmailActions } from '@/components/auth-page';
import { PasswordField } from '@/components/password-field';
import { Button, ErrorText, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

type Field = 'name' | 'email' | 'password' | 'form';
type Problem = { field: Field; text: string } | null;

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState<{ busy: boolean; done: boolean; error: string | null }>({
    busy: false,
    done: false,
    error: null,
  });

  async function signUp() {
    setProblem(null);
    if (!fullName.trim()) return setProblem({ field: 'name', text: 'Enter your name.' });
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter your email.' });
    if (password.length < 8) return setProblem({ field: 'password', text: 'Use at least 8 characters.' });
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: 'client' }, emailRedirectTo: emailRedirect() },
    });
    setBusy(false);
    if (error) {
      setProblem({ field: 'form', text: plainError(error) });
    } else if (data.user && !data.user.identities?.length) {
      // Supabase answers this way when the email already has an account, for example a trainer's.
      setProblem({
        field: 'email',
        text: 'This email already has a Voltrix account. Sign in with it instead, including a Voltrix Coach login.',
      });
    } else if (!data.session) {
      // Email confirmation is switched on for this project.
      setCheckEmail(true);
    }
  }

  async function sendAgain() {
    setResend({ busy: true, done: false, error: null });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: emailRedirect() },
    });
    setResend({ busy: false, done: !error, error: error ? plainError(error) : null });
  }

  if (checkEmail) {
    return (
      <AuthPage
        title="Check your email"
        icon="mail-outline"
        intro={`We sent a link to ${email.trim()}. Open it to confirm your account, then sign in.`}
        footer={
          <CheckEmailActions onResend={sendAgain} resending={resend.busy} resent={resend.done} error={resend.error}>
            <TextLink lead="Confirmed it?" label="Sign in" onPress={() => router.replace('/sign-in')} />
          </CheckEmailActions>
        }
      />
    );
  }

  const errorFor = (field: Field) => (problem?.field === field ? problem.text : undefined);
  return (
    <AuthPage
      title="Create your account"
      intro="Use the email your personal trainer has for you, so we can connect you to them."
      footer={
        <>
          <Button title="Create account" onPress={signUp} loading={busy} />
          <TextLink lead="Already have an account?" label="Sign in" onPress={() => router.replace('/sign-in')} />
        </>
      }>
      <TextField
        label="Your name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        textContentType="name"
        placeholder="First and last name"
        error={errorFor('name')}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        error={errorFor('email')}
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="At least 8 characters"
        onSubmitEditing={signUp}
        error={errorFor('password')}
      />
      <ErrorText>{errorFor('form')}</ErrorText>
    </AuthPage>
  );
}
