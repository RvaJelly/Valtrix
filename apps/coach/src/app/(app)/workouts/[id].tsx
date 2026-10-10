import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { Body, Button, Card, EmptyState, ErrorText, Text, TextField } from '@/components/ui';
import { WorkoutVideo } from '@/components/workout-video';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { useGoBack } from '@/lib/nav';
import { useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { removeWorkoutVideos } from '@/lib/workout-videos';
import {
  MUSCLE_GROUPS,
  WORKOUT_COLUMNS,
  WORKOUT_EXERCISE_COLUMNS,
  type Workout,
  type WorkoutExercise,
} from '@/lib/workouts';

type Editable = Pick<WorkoutExercise, 'sets' | 'reps' | 'weight' | 'weight_unit' | 'rest_seconds'>;

export default function WorkoutEditor() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<WorkoutExercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  // A weight keeps the unit it was written in, so switching Settings > Weight units
  // doesn't change what clients already see. New weights use the current setting.
  const unitOf = (item: WorkoutExercise) => (item.weight ? (item.weight_unit ?? settings.units) : settings.units);

  const load = useCallback(async () => {
    const [w, rows] = await Promise.all([
      supabase.from('workouts').select(WORKOUT_COLUMNS).eq('id', id).maybeSingle(),
      supabase.from('workout_exercises').select(WORKOUT_EXERCISE_COLUMNS).eq('workout_id', id).order('position'),
    ]);
    if (w.error || rows.error) return setError(plainError(w.error ?? rows.error));
    if (!w.data) return setError('This workout could not be found.');
    setWorkout(w.data as Workout);
    setName((current) => current || w.data!.name);
    setItems(rows.data as unknown as WorkoutExercise[]);
  }, [id]);

  // Reload when coming back from the exercise picker.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function saveName() {
    const trimmed = name.trim();
    if (!workout || !trimmed || trimmed === workout.name) return;
    const { error } = await supabase.from('workouts').update({ name: trimmed }).eq('id', id);
    if (error) setError(plainError(error));
    else setWorkout({ ...workout, name: trimmed });
  }

  async function saveWorkoutVideo(path: string | null) {
    const { error } = await supabase.from('workouts').update({ video_path: path }).eq('id', id);
    if (error) return plainError(error);
    setWorkout((w) => (w ? { ...w, video_path: path } : w));
    return null;
  }

  async function saveItemVideo(itemId: string, path: string | null) {
    const { error } = await supabase.from('workout_exercises').update({ video_path: path }).eq('id', itemId);
    if (error) return plainError(error);
    setItems((list) => list.map((it) => (it.id === itemId ? { ...it, video_path: path } : it)));
    return null;
  }

  async function saveItem(itemId: string, changes: Partial<Editable>) {
    setItems((list) => list.map((it) => (it.id === itemId ? { ...it, ...changes } : it)));
    const { error } = await supabase.from('workout_exercises').update(changes).eq('id', itemId);
    if (error) setError(plainError(error));
  }

  async function move(index: number, direction: -1 | 1) {
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    const a = items[index];
    const b = items[other];
    const next = [...items];
    next[index] = { ...b, position: a.position };
    next[other] = { ...a, position: b.position };
    setItems(next);
    const results = await Promise.all([
      supabase.from('workout_exercises').update({ position: b.position }).eq('id', a.id),
      supabase.from('workout_exercises').update({ position: a.position }).eq('id', b.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) setError(plainError(failed.error));
  }

  async function remove(itemId: string) {
    const item = items.find((it) => it.id === itemId);
    const video = item?.video_path;
    const what = `${item?.exercises.name ?? 'It'} comes out of this workout`;
    const message = video ? `${what}, and its demo video is deleted.` : `${what}.`;
    if (!(await confirm('Remove exercise?', message, 'Remove'))) return;
    setItems((list) => list.filter((it) => it.id !== itemId));
    const { error } = await supabase.from('workout_exercises').delete().eq('id', itemId);
    if (error) setError(plainError(error));
    else await removeWorkoutVideos([video]);
  }

  async function deleteWorkout() {
    const message = 'It also comes off any client plans it is in. This cannot be undone.';
    if (!(await confirm('Delete workout?', message, 'Delete'))) return;
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) return setError(plainError(error));
    await removeWorkoutVideos([workout?.video_path, ...items.map((it) => it.video_path)]);
    goBack('/programs');
  }

  if (!workout) {
    return error ? (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>{error}</Body>
      </View>
    ) : (
      <ActivityIndicator color={Colors.textSecondary} style={{ marginTop: Spacing.six }} />
    );
  }

  const addButton = (
    <Button title="Add exercise" onPress={() => router.push({ pathname: '/exercises', params: { workoutId: id } })} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: workout.name }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Workout name"
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
        />
        <WorkoutVideo
          label="Workout video"
          path={workout.video_path}
          onChange={saveWorkoutVideo}
          title={workout.name}
        />
        <ErrorText>{error}</ErrorText>

        {items.length === 0 ? (
          <EmptyState
            icon="add-circle-outline"
            title="No exercises yet"
            message="Add exercises from the library, then set the sets, reps and rest for each."
          />
        ) : (
          items.map((item, index) => (
            <Card key={item.id} style={{ gap: Spacing.three }}>
              <View style={styles.cardHeader}>
                <Text style={styles.number}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{item.exercises.name}</Text>
                  <Body secondary style={{ fontSize: 13 }}>
                    {MUSCLE_GROUPS[item.exercises.muscle_group]}
                  </Body>
                </View>
                <IconButton icon="chevron-up" label="Move up" disabled={index === 0} onPress={() => move(index, -1)} />
                <IconButton
                  icon="chevron-down"
                  label="Move down"
                  disabled={index === items.length - 1}
                  onPress={() => move(index, 1)}
                />
                <IconButton icon="trash-outline" label="Remove" onPress={() => remove(item.id)} />
              </View>
              <View style={styles.fields}>
                <SmallField
                  label="Sets"
                  initial={String(item.sets)}
                  keyboardType="number-pad"
                  onSave={(v) => {
                    const sets = Math.min(20, Math.max(1, parseInt(v, 10) || 1));
                    saveItem(item.id, { sets });
                    return String(sets);
                  }}
                />
                <SmallField
                  label="Reps"
                  initial={item.reps}
                  onSave={(v) => {
                    const reps = v.trim().slice(0, 30) || '10';
                    saveItem(item.id, { reps });
                    return reps;
                  }}
                />
                <SmallField
                  label={`Weight (${unitOf(item)})`}
                  initial={item.weight ?? ''}
                  placeholder="–"
                  onSave={(v) => {
                    const weight = v.trim().slice(0, 30) || null;
                    saveItem(item.id, { weight, weight_unit: weight ? unitOf(item) : null });
                    return weight ?? '';
                  }}
                />
                <SmallField
                  label="Rest (s)"
                  initial={item.rest_seconds == null ? '' : String(item.rest_seconds)}
                  placeholder="–"
                  keyboardType="number-pad"
                  onSave={(v) => {
                    const parsed = parseInt(v, 10);
                    const rest_seconds = Number.isNaN(parsed) ? null : Math.min(900, Math.max(0, parsed));
                    saveItem(item.id, { rest_seconds });
                    return rest_seconds == null ? '' : String(rest_seconds);
                  }}
                />
              </View>
              <WorkoutVideo
                label="Demo video"
                path={item.video_path}
                onChange={(path) => saveItemVideo(item.id, path)}
                fallback={
                  item.exercises.video_path ? { path: item.exercises.video_path, note: 'From the exercise' } : null
                }
                title={item.exercises.name}
              />
            </Card>
          ))
        )}

        {addButton}
        <Button title="Delete workout" variant="destructive" onPress={deleteWorkout} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && { opacity: disabled ? 0.3 : 0.6 }]}>
      <Ionicons name={icon} size={20} color={Colors.text} />
    </Pressable>
  );
}

// A compact input that saves when it loses focus. onSave returns the cleaned value to show.
function SmallField({
  label,
  initial,
  placeholder,
  keyboardType,
  onSave,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  keyboardType?: 'number-pad';
  onSave: (value: string) => string;
}) {
  const [value, setValue] = useState(initial);
  const commit = () => {
    if (value !== initial) setValue(onSave(value));
  };
  return (
    <View style={styles.smallField}>
      <Text style={styles.smallLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={setValue}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        selectionColor={Colors.accent}
        keyboardType={keyboardType}
        style={styles.smallInput}
      />
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.tint,
    color: Colors.text,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  exerciseName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  fields: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  smallField: {
    flex: 1,
    gap: Spacing.one,
  },
  smallLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  smallInput: {
    minHeight: 40,
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.text,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
  },
}));
