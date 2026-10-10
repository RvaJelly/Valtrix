import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, ErrorText, TextField, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// Shown after a trainer opens the reset link from their email.
export default function NewPassword() {
  const { finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(plainError(error));
    // The root layout then opens the app.
    finishRecovery();
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>Choose a new password</Title>
          <Body secondary>You’ll use it the next time you sign in.</Body>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            onSubmitEditing={save}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Save password" onPress={save} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
}));
