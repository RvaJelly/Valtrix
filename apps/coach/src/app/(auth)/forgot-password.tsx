import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Body, Button, ErrorText, TextField, Title } from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
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

  async function send() {
    setError(null);
    if (!email.trim()) return setError('Enter the email you signed up with.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: emailRedirect() });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Logo style={styles.logo} />
          <Title>{sent ? 'Check your email' : 'Reset your password'}</Title>
          {sent ? (
            <Body secondary>
              If {email.trim()} has a Voltrix Coach account, we’ve sent it a link to choose a new password.
            </Body>
          ) : (
            <>
              <Body secondary>Enter your email and we’ll send you a link to choose a new password.</Body>
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
              />
              <ErrorText>{error}</ErrorText>
              <Button title="Send reset link" onPress={send} loading={busy} />
            </>
          )}
          <Button title="Back to sign in" variant={sent ? 'primary' : 'ghost'} onPress={backToSignIn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  content: {
    width: '100%',
    maxWidth: Layout.maxWelcome,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  logo: {
    width: 148,
    alignSelf: 'flex-start',
    // The image carries the brand kit's clear space; this lines the V up with the text below.
    marginLeft: -12,
    marginBottom: Spacing.two,
  },
}));
