import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Body, Button, ErrorText, TextField } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { addError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

// A new workout for the library, or (with `program`) for one program, where it goes in as a slot from
// week 1 on any day; its days and weeks are set on the program page.
export default function NewWorkout() {
  const { program } = useLocalSearchParams<{ program?: string }>();
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
    const { data, error } = await supabase
      .from('workouts')
      .insert({ name: name.trim(), ...(program ? { program_id: program } : null) })
      .select('id')
      .single();
    if (error) {
      setBusy(false);
      return setError(await addError(error));
    }
    if (program) {
      const { data: slots } = await supabase.from('program_slots').select('position').eq('program_id', program);
      const position = ((slots ?? []) as { position: number }[]).reduce((max, s) => Math.max(max, s.position + 1), 0);
      const slot = await supabase
        .from('program_slots')
        .insert({ program_id: program, workout_id: data.id, week_from: 1, week_to: null, weekdays: [], position });
      if (slot.error) {
        setBusy(false);
        return setError(await addError(slot.error));
      }
    }
    setBusy(false);
    router.replace({ pathname: '/workouts/[id]', params: { id: data.id } });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Body secondary>
        {program
          ? 'Name it, then add exercises. Pick its days and weeks on the program.'
          : 'Name it, then add exercises from the library.'}
      </Body>
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
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
}));
