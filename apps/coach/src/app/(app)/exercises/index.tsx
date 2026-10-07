import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Body, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { EQUIPMENT, EXERCISE_COLUMNS, MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '@/lib/workouts';

// Browse the exercise library. With a workoutId param it becomes a picker that
// adds the tapped exercise to that workout.
export default function ExerciseLibrary() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const picking = !!workoutId;
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('exercises')
        .select(EXERCISE_COLUMNS)
        .order('name')
        .then(({ data, error }) => {
          if (error) setError(error.message);
          else setExercises(data as Exercise[]);
        });
    }, []),
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (exercises ?? []).filter(
      (e) => (!group || e.muscle_group === group) && (!term || e.name.toLowerCase().includes(term)),
    );
  }, [exercises, search, group]);

  async function pick(exercise: Exercise) {
    if (!workoutId || adding) return;
    setAdding(exercise.id);
    // Put it at the end of the workout.
    const { data: last } = await supabase
      .from('workout_exercises')
      .select('position')
      .eq('workout_id', workoutId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from('workout_exercises').insert({
      workout_id: workoutId,
      exercise_id: exercise.id,
      position: (last?.position ?? -1) + 1,
    });
    setAdding(null);
    if (error) return setError(error.message);
    router.back();
  }

  function open(exercise: Exercise) {
    if (picking) return pick(exercise);
    // Only a trainer's own exercises can be edited.
    if (exercise.trainer_id) router.push({ pathname: '/exercises/new', params: { id: exercise.id } });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: picking ? 'Add exercise' : 'Exercise library',
          headerRight: () => (
            <Pressable accessibilityLabel="New exercise" hitSlop={12} onPress={() => router.push('/exercises/new')}>
              <Ionicons name="add-circle" size={28} color={Colors.accent} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises"
              placeholderTextColor={Colors.textSecondary}
              selectionColor={Colors.accent}
              style={styles.search}
              autoCorrect={false}
            />
            <Chips options={MUSCLE_GROUPS} value={group} onChange={setGroup} allowClear />
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={
          exercises ? (
            <Body secondary style={{ textAlign: 'center', marginTop: Spacing.four }}>
              No exercises match. Tap + to add your own.
            </Body>
          ) : (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.five }} />
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Body secondary style={{ fontSize: 13 }}>
                {MUSCLE_GROUPS[item.muscle_group]} · {EQUIPMENT[item.equipment]}
                {item.trainer_id ? ' · Yours' : ''}
              </Body>
            </View>
            {adding === item.id ? (
              <ActivityIndicator color={Colors.accent} />
            ) : picking ? (
              <Ionicons name="add" size={22} color={Colors.accent} />
            ) : item.trainer_id ? (
              <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = themed(() => ({
  list: {
    padding: Spacing.three,
  },
  search: {
    minHeight: 44,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
}));
