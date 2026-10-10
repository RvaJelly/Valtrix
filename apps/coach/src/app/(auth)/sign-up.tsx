import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, type TextInput } from 'react-native';

import { AuthPage } from '@/components/auth-page';
import { Field, PasswordField } from '@/components/field';
import { Button, ErrorText, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

type Where = 'name' | 'email' | 'password' | 'form';
type Problem = { field: Where; text: string } | null;

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState({ busy: false, done: false, error: null as string | null });
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function signUp() {
    setProblem(null);
    if (!fullName.trim()) return setProblem({ field: 'name', text: 'Enter your name, as clients will see it.' });
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter your email.' });
    if (password.length < 8) return setProblem({ field: 'password', text: 'Use at least 8 characters.' });
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: emailRedirect() },
    });
    setBusy(false);
    if (error) {
      setProblem({ field: 'form', text: plainError(error) });
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
          <>
            <ErrorText>{resend.error}</ErrorText>
            <Button
              title="Open mail app"
              icon="mail-outline"
              onPress={() => Linking.openURL('mailto:').catch(() => {})}
            />
            <Button
              title={resend.done ? 'Sent again' : 'Send it again'}
              icon={resend.done ? 'checkmark' : 'refresh-outline'}
              variant="secondary"
              onPress={sendAgain}
              loading={resend.busy}
              disabled={resend.done}
            />
            <TextLink lead="Confirmed it?" label="Sign in" onPress={() => router.replace('/sign-in')} />
          </>
        }
      />
    );
  }

  const errorFor = (field: Where) => (problem?.field === field ? problem.text : undefined);
  const clear = (field: Where) => {
    if (problem?.field === field || problem?.field === 'form') setProblem(null);
  };
  return (
    <AuthPage
      title="Create your account"
      intro="Set up Voltrix Coach for your training business."
      footer={
        <>
          <Button title="Create account" onPress={signUp} loading={busy} />
          <TextLink lead="Already have an account?" label="Sign in" onPress={() => router.replace('/sign-in')} />
        </>
      }>
      <Field
        label="Your name"
        value={fullName}
        onChangeText={(text) => {
          setFullName(text);
          clear('name');
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        placeholder="First and last name"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
        error={errorFor('name')}
      />
      <Field
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          clear('email');
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errorFor('email')}
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          clear('password');
        }}
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="At least 8 characters"
        enterKeyHint="go"
        onSubmitEditing={signUp}
        error={errorFor('password')}
      />
      <ErrorText>{errorFor('form') ?? null}</ErrorText>
    </AuthPage>
  );
}
