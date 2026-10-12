import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, type TextInput } from 'react-native';

import { TermsGate } from '@/components/legal/terms-gate';
import { TermsAcceptedLine } from '@/components/legal/terms-notes';
import { AuthPage } from '@/components/auth-page';
import { Button, ErrorText, TextField, TextLink } from '@/components/ui';
import { plainError } from '@/lib/errors';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';
import { SIGN_UP_TICKS_MS, termsPayload, useTerms, type TermsPayload } from '@/lib/terms';

// iPhone's Mail opens on its inbox with message://. "mailto:" would start a blank new email instead,
// and Android and the web have no link to an inbox, so there "Send it again" is the main button.
const MAIL_INBOX = Platform.OS === 'ios' ? 'message://' : null;

type Where = 'name' | 'email' | 'password' | 'form';
type Problem = { field: Where; text: string } | null;

export default function SignUp() {
  const terms = useTerms();
  // The Terms ticked on this screen: for this sign-up only, kept in memory, and good for 15 minutes.
  const [ticks, setTicks] = useState<{ at: number; payload: TermsPayload } | null>(null);
  const [tickAgain, setTickAgain] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  // The email already has a Voltrix account (Coach or the client app): Supabase sends nothing then.
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState({ busy: false, done: false, error: null as string | null });
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function signUp() {
    setProblem(null);
    if (!fullName.trim()) return setProblem({ field: 'name', text: 'Enter your name, as clients will see it.' });
    if (!email.trim()) return setProblem({ field: 'email', text: 'Enter your email.' });
    if (password.length < 8) return setProblem({ field: 'password', text: 'Use at least 8 characters.' });
    // The Terms ticked on this screen go with the sign-up, and the database records them as it makes the
    // account (handle_new_user). Ticks older than 15 minutes are asked for again.
    if (!ticks || Date.now() - ticks.at > SIGN_UP_TICKS_MS) {
      setTicks(null);
      setTickAgain(true);
      return;
    }
    const accepted = ticks.payload;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), terms: accepted }, emailRedirectTo: emailRedirect() },
    });
    setBusy(false);
    if (error) {
      setProblem({ field: 'form', text: plainError(error) });
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      // Supabase answers like a new sign-up but sends no email when the address is taken. The Terms ticked here
      // are for a new account only, so nothing is remembered for the existing one.
      setExisting(true);
      return;
    }
    if (data.user?.identities?.length) terms.rememberSignUp(data.user.id, accepted);
    if (!data.session) {
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

  if (existing) {
    return (
      <AuthPage
        title="You already have an account"
        icon="key-outline"
        intro={`${email.trim()} already has a Voltrix account. Sign in with it, or choose a new password if you’ve forgotten it.`}
        footer={
          <>
            <Button title="Sign in" onPress={() => router.replace('/sign-in')} />
            <Button title="Forgot password?" variant="secondary" onPress={() => router.push('/forgot-password')} />
            <TextLink label="Use another email" onPress={() => setExisting(false)} />
          </>
        }
      />
    );
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
            {MAIL_INBOX ? (
              <Button
                title="Open mail app"
                icon="mail-outline"
                onPress={() => Linking.openURL(MAIL_INBOX).catch(() => {})}
              />
            ) : null}
            <Button
              title={resend.done ? 'Sent again' : 'Send it again'}
              icon={resend.done ? 'checkmark' : 'refresh-outline'}
              variant={MAIL_INBOX ? 'secondary' : 'primary'}
              onPress={sendAgain}
              loading={resend.busy}
              disabled={resend.done}
            />
            <TextLink lead="Confirmed it?" label={'Sign\u00A0in'} onPress={() => router.replace('/sign-in')} />
          </>
        }
      />
    );
  }

  // First the Terms, then the form: whoever signs up accepts for themselves, here and now.
  if (!ticks) {
    return (
      <TermsGate
        underHeader
        notice={tickAgain ? 'It’s been more than 15 minutes, so please tick the boxes again.' : undefined}
        onAccept={() => {
          const at = new Date();
          setTicks({ at: at.getTime(), payload: termsPayload(terms.app, at) });
        }}
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
          <TextLink lead="Already have an account?" label={'Sign\u00A0in'} onPress={() => router.replace('/sign-in')} />
        </>
      }>
      <TextField
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
      <TextField
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
      <TextField
        password
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
      <TermsAcceptedLine version={ticks.payload.version} />
      <ErrorText>{errorFor('form') ?? null}</ErrorText>
    </AuthPage>
  );
}
