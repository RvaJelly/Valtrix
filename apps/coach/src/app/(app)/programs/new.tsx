import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Stepper } from '@/components/stepper';
import { Body, Button, ErrorText, TextField } from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { NAME_MAX, weeksLabel } from '@/lib/programs';
import { addError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

// A new program: a name and how many weeks. Its workouts are added on the program page next.
export default function NewProgram() {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setError(null);
    if (!name.trim()) return setNameError('Give the program a name.');
    setBusy(true);
    const { data, error } = await supabase.from('programs').insert({ name: name.trim(), weeks }).select('id').single();
    if (error) {
      setBusy(false);
      haptic.warning();
      return setError(await addError(error));
    }
    haptic.success();
    router.replace({ pathname: '/programs/[id]', params: { id: data.id, edit: '1', add: '1' } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Body secondary>Name it and set its length. Then add workouts and pick their days and weeks.</Body>
        <TextField
          label="Program name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (text.trim()) setNameError(undefined);
          }}
          error={nameError}
          placeholder="For example: Strength Base"
          autoCapitalize="words"
          autoFocus
          maxLength={NAME_MAX}
          onSubmitEditing={create}
          testID="program-name"
        />
        <View style={{ gap: Spacing.one }}>
          <Stepper
            label="Weeks"
            value={String(weeks)}
            spoken={weeksLabel(weeks)}
            onLess={() => setWeeks((w) => Math.max(1, w - 1))}
            onMore={() => setWeeks((w) => Math.min(52, w + 1))}
            lessDisabled={weeks <= 1}
            moreDisabled={weeks >= 52}
            testID="program-weeks"
          />
        </View>
        <ErrorText>{error}</ErrorText>
        <Button title="Create" onPress={create} loading={busy} testID="program-create" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
}));
