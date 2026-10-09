import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Button, ErrorText, TextField } from '@/components/ui';
import { WorkoutVideo } from '@/components/workout-video';
import { Colors, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { useGoBack } from '@/lib/nav';
import { addError, saveError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';
import { removeWorkoutVideos } from '@/lib/workout-videos';
import { EQUIPMENT, EXERCISE_COLUMNS, MUSCLE_GROUPS, type Equipment, type Exercise, type MuscleGroup } from '@/lib/workouts';

// Create a custom exercise, or edit one when an id is passed.
export default function ExerciseForm() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>('none');
  const [instructions, setInstructions] = useState('');
  const [video, setVideo] = useState<string | null>(null);
  // A video added to a new exercise is only kept once the exercise is saved.
  const unsaved = useRef<{ path: string | null }>({ path: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('exercises')
      .select(EXERCISE_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setError(error?.message ?? 'This exercise could not be found.');
        const e = data as Exercise;
        setName(e.name);
        setGroup(e.muscle_group);
        setEquipment(e.equipment);
        setInstructions(e.instructions ?? '');
        setVideo(e.video_path);
        setLoaded(true);
      });
  }, [id]);

  // Leaving without saving a new exercise removes the video uploaded for it.
  useEffect(() => {
    const pending = unsaved.current;
    return () => {
      if (pending.path) removeWorkoutVideos([pending.path]);
    };
  }, []);

  // An existing exercise saves its video straight away; a new one with the exercise.
  async function changeVideo(path: string | null) {
    if (id) {
      const { error } = await supabase.from('exercises').update({ video_path: path }).eq('id', id);
      if (error) return error.message;
    } else {
      unsaved.current.path = path;
    }
    setVideo(path);
    return null;
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Give the exercise a name.');
    if (!group) return setError('Pick a muscle group.');
    setBusy(true);
    const values = {
      name: name.trim(),
      muscle_group: group,
      equipment: equipment ?? 'none',
      instructions: instructions.trim() || null,
    };
    const { error } = id
      ? await supabase.from('exercises').update(values).eq('id', id)
      : await supabase.from('exercises').insert({ ...values, video_path: video });
    const problem = error ? (id ? saveError(error) : await addError(error)) : null;
    setBusy(false);
    if (error) return setError(problem);
    unsaved.current.path = null;
    goBack('/exercises');
  }

  async function remove() {
    if (!id || !(await confirm('Delete exercise?', 'It will be removed from your library.', 'Delete'))) return;
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    // 23503: still used in a workout (foreign key).
    if (error) return setError(error.code === '23503' ? 'Remove it from your workouts first.' : error.message);
    await removeWorkoutVideos([video]);
    goBack('/exercises');
  }

  if (!loaded) {
    return error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.six }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Edit exercise' : 'New exercise' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="For example: Sled Push" autoCapitalize="words" />
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.label}>Muscle group</Text>
          <Chips options={MUSCLE_GROUPS} value={group} onChange={setGroup} />
        </View>
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.label}>Equipment</Text>
          <Chips options={EQUIPMENT} value={equipment} onChange={setEquipment} />
        </View>
        <TextField
          label="How to do it"
          value={instructions}
          onChangeText={setInstructions}
          multiline
          placeholder="Optional cues for your clients"
          style={{ minHeight: 100, paddingTop: Spacing.three, textAlignVertical: 'top' }}
        />
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.label}>Demo video</Text>
          <WorkoutVideo label="Demo video" path={video} onChange={changeVideo} title={name.trim() || 'Demo video'} />
        </View>
        <ErrorText>{error}</ErrorText>
        <Button title={id ? 'Save changes' : 'Add exercise'} onPress={save} loading={busy} />
        {id ? <Button title="Delete exercise" variant="ghost" onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
}));
