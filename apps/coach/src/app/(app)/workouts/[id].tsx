import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, EmptyState, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { MUSCLE_GROUPS, WORKOUT_EXERCISE_COLUMNS, type Workout, type WorkoutExercise } from '@/lib/workouts';

type Editable = Pick<WorkoutExercise, 'sets' | 'reps' | 'weight' | 'rest_seconds'>;

export default function WorkoutEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<WorkoutExercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  const load = useCallback(async () => {
    const [w, rows] = await Promise.all([
      supabase.from('workouts').select('id, name, notes, updated_at').eq('id', id).maybeSingle(),
      supabase.from('workout_exercises').select(WORKOUT_EXERCISE_COLUMNS).eq('workout_id', id).order('position'),
    ]);
    if (w.error || rows.error) return setError((w.error ?? rows.error)!.message);
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
    if (error) setError(error.message);
    else setWorkout({ ...workout, name: trimmed });
  }

  async function saveItem(itemId: string, changes: Partial<Editable>) {
    setItems((list) => list.map((it) => (it.id === itemId ? { ...it, ...changes } : it)));
    const { error } = await supabase.from('workout_exercises').update(changes).eq('id', itemId);
    if (error) setError(error.message);
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
    if (failed) setError(failed.error!.message);
  }

  async function remove(itemId: string) {
    setItems((list) => list.filter((it) => it.id !== itemId));
    const { error } = await supabase.from('workout_exercises').delete().eq('id', itemId);
    if (error) setError(error.message);
  }

  async function deleteWorkout() {
    if (!(await confirm('Delete workout?', 'This cannot be undone.', 'Delete'))) return;
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) return setError(error.message);
    router.back();
  }

  if (!workout) {
    return error ? (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>{error}</Body>
      </View>
    ) : (
      <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.six }} />
    );
  }

  const addButton = (
    <Button
      title="Add exercise"
      onPress={() => router.push({ pathname: '/exercises', params: { workoutId: id } })}
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: workout.name }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField label="Workout name" value={name} onChangeText={setName} onBlur={saveName} onSubmitEditing={saveName} />
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
                  label={`Weight (${settings.units})`}
                  initial={item.weight ?? ''}
                  placeholder="–"
                  onSave={(v) => {
                    const weight = v.trim().slice(0, 30) || null;
                    saveItem(item.id, { weight });
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
            </Card>
          ))
        )}

        {addButton}
        <Button title="Delete workout" variant="ghost" onPress={deleteWorkout} />
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
    padding: Spacing.three,
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
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    fontWeight: '800',
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
