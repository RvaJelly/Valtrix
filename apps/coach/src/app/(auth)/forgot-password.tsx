import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, ErrorText, TextField, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.six + Spacing.four,
    gap: Spacing.three,
  },
}));
