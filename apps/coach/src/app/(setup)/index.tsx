import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, ErrorText, TextField, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function BusinessSetup() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0];
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createBusiness() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name for your business.');
      return;
    }
    if (!session) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ business_name: trimmed })
      .eq('id', session.user.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Once the profile has a business name the root layout opens the app.
    await refreshProfile();
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</Title>
          <Body secondary>What is your training business called? Clients will see this name.</Body>
          <TextField
            label="Business name"
            value={name}
            onChangeText={setName}
            placeholder="Alex Smith Fitness"
            autoCapitalize="words"
            onSubmitEditing={createBusiness}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Continue" onPress={createBusiness} loading={busy} />
          <Button title="Sign out" variant="ghost" onPress={signOut} />
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
