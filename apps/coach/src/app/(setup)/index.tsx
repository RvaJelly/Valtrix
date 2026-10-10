import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Body, Button, ErrorText, TextField, TextLink, Title } from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
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
    const { error } = await supabase.from('profiles').update({ business_name: trimmed }).eq('id', session.user.id);
    if (error) {
      setError(plainError(error));
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
          <Logo style={styles.logo} />
          <Title>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</Title>
          <Body secondary>What is your training business called? Clients will see this name.</Body>
          <TextField
            label="Business name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            onSubmitEditing={createBusiness}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Continue" onPress={createBusiness} loading={busy} />
          <TextLink label="Sign out" onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  // The welcome screen's 20 gutter and column, and room at the top for the back arrow.
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
