import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, ErrorText, TextField, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // On success the root layout moves to the app on its own.
    if (error) setError(error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>Welcome back</Title>
          <Body secondary>Sign in to your Voltrix Coach account.</Body>
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
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={signIn}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Sign in" onPress={signIn} loading={busy} />
          <Button title="Forgot password?" variant="ghost" onPress={() => router.push('/forgot-password')} />
          <Button title="New here? Create an account" variant="ghost" onPress={() => router.replace('/sign-up')} />
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
