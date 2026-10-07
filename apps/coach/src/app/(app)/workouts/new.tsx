import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Body, Button, ErrorText, TextField } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function NewWorkout() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setError(null);
    if (!name.trim()) {
      setError('Give the workout a name.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.from('workouts').insert({ name: name.trim() }).select('id').single();
    setBusy(false);
    if (error) return setError(error.message);
    router.replace({ pathname: '/workouts/[id]', params: { id: data.id } });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Body secondary>Name it, then add exercises from the library.</Body>
      <TextField
        label="Workout name"
        value={name}
        onChangeText={setName}
        placeholder="For example: Upper Body A"
        autoCapitalize="words"
        autoFocus
        onSubmitEditing={create}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Create workout" onPress={create} loading={busy} />
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
}));
