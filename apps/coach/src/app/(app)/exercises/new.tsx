import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Button, Card, EmptyState, ErrorText, Skeleton, Text, TextField } from '@/components/ui';
import { WorkoutVideo } from '@/components/workout-video';
import { Fonts, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { useGoBack } from '@/lib/nav';
import { addError, saveError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';
import { removeWorkoutVideos } from '@/lib/workout-videos';
import {
  EQUIPMENT,
  EXERCISE_COLUMNS,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from '@/lib/workouts';

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
        if (error || !data) return setError(error ? plainError(error) : 'This exercise could not be found.');
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
      if (error) return plainError(error);
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
    if (error) return setError(error.code === '23503' ? 'Remove it from your workouts first.' : plainError(error));
    await removeWorkoutVideos([video]);
    goBack('/exercises');
  }

  if (!loaded) {
    return error ? (
      <EmptyState
        icon="barbell-outline"
        title="Exercise not found"
        message={error}
        action={<Button title="Back to the library" variant="secondary" onPress={() => goBack('/exercises')} />}
      />
    ) : (
      <View style={styles.content}>
        <Skeleton height={52} radius={Radius.medium} />
        <Skeleton width="70%" height={36} radius={Radius.pill} />
        <Skeleton width="80%" height={36} radius={Radius.pill} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Edit exercise' : 'New exercise' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="For example: Sled Push"
          autoCapitalize="words"
          maxLength={120}
        />
        <View style={styles.field}>
          <Text variant="footnote" tone="secondary" style={styles.label}>
            Muscle group
          </Text>
          <Chips options={MUSCLE_GROUPS} value={group} onChange={setGroup} />
        </View>
        <View style={styles.field}>
          <Text variant="footnote" tone="secondary" style={styles.label}>
            Equipment
          </Text>
          <Chips options={EQUIPMENT} value={equipment} onChange={setEquipment} />
        </View>
        <TextField
          label="How to do it"
          optional
          value={instructions}
          onChangeText={setInstructions}
          autoCapitalize="sentences"
          multiline
          placeholder="Cues for your clients"
          style={styles.multiline}
        />
        <View style={styles.field}>
          <Text variant="footnote" tone="secondary" style={styles.label}>
            Demo video <Text tone="tertiary">(optional)</Text>
          </Text>
          <Card style={styles.video}>
            <WorkoutVideo label="Demo video" path={video} onChange={changeVideo} title={name.trim() || 'Demo video'} />
          </Card>
        </View>
        <ErrorText>{error}</ErrorText>
        <View style={{ gap: Spacing.tight }}>
          <Button title={id ? 'Save changes' : 'Add exercise'} onPress={save} loading={busy} />
          {id ? <Button title="Delete exercise" variant="destructive" onPress={remove} /> : null}
        </View>
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
    paddingTop: Spacing.four,
    paddingBottom: Spacing.hero,
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.textMedium,
  },
  multiline: {
    minHeight: 100,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  video: {
    paddingVertical: Spacing.two,
  },
}));
