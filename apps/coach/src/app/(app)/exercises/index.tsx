import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';

import { Chips } from '@/components/chips';
import { groupedItem, IconButton, ListRow, Notice, SearchField, StatusPill, Text } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
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
            // The web header has no right inset of its own; the phones' headers do.
            <IconButton
              variant="tonal"
              icon="add"
              label="New exercise"
              onPress={() => router.push('/exercises/new')}
              style={Platform.OS === 'web' ? { marginRight: Spacing.tight } : undefined}
            />
          ),
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search exercises" />
            <Chips options={MUSCLE_GROUPS} value={group} onChange={setGroup} allowClear />
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          exercises ? (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: Spacing.four }}>
              No exercises match. Tap + to add your own.
            </Text>
          ) : (
            <ActivityIndicator color={Colors.textSecondary} style={{ marginTop: Spacing.five }} />
          )
        }
        renderItem={({ item, index }) => (
          <View style={groupedItem(index, visible.length)}>
            <ListRow
              title={item.name}
              subtitle={[MUSCLE_GROUPS[item.muscle_group], EQUIPMENT[item.equipment]].filter(Boolean).join(' · ')}
              // Built-in exercises open nothing outside the picker, so they don't look tappable.
              onPress={picking || item.trainer_id ? () => open(item) : undefined}
              status={item.trainer_id && !picking ? <StatusPill tone="neutral" label="Yours" /> : null}
              trailing={
                adding === item.id ? (
                  <ActivityIndicator color={Colors.textSecondary} />
                ) : picking ? (
                  <Ionicons name="add" size={22} color={Colors.text} />
                ) : null
              }
              chevron={!picking && !!item.trainer_id}
              accessibilityLabel={picking ? `Add ${item.name}` : undefined}
              last={index === visible.length - 1}
            />
          </View>
        )}
      />
    </>
  );
}

const styles = themed(() => ({
  list: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
  },
  header: {
    gap: Spacing.tight,
    marginBottom: Spacing.four,
  },
}));
