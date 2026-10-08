import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Card, ErrorText, TextField, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { emailRedirect } from '@/lib/links';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signUp() {
    setError(null);
    if (!fullName.trim() || !email.trim()) {
      setError('Enter your name and email.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: 'client' }, emailRedirectTo: emailRedirect() },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else if (!data.session) {
      // Email confirmation is switched on for this project.
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Title>Check your email</Title>
          <Card>
            <Body>We sent a confirmation link to {email.trim()}. Open it to confirm your account, then sign in.</Body>
          </Card>
          <Button title="Go to sign in" onPress={() => router.replace('/sign-in')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>Create your account</Title>
          <Body secondary>Use the email your personal trainer has for you, so we can connect you to them.</Body>
          <TextField
            label="Your name"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
            placeholder="Alex Smith"
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
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="At least 8 characters"
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Create account" onPress={signUp} loading={busy} />
          <Button title="Already have an account? Sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
}));
