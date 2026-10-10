import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  EmptyState,
  Group,
  groupedItem,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { workoutSummary, type Workout, type WorkoutExercise } from '@/lib/workouts';

type WorkoutRow = Workout & { workout_exercises: Pick<WorkoutExercise, 'sets' | 'rest_seconds'>[] | null };

const newWorkout = () => router.push('/workouts/new');

export default function Programs() {
  const [workouts, setWorkouts] = useState<WorkoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const showSkeleton = useDelayed(300);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, name, notes, updated_at, workout_exercises(sets, rest_seconds)')
      .order('updated_at', { ascending: false });
    if (error) {
      setError(plainError(error));
    } else {
      setError(null);
      setWorkouts(data as WorkoutRow[]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const rows = workouts ?? [];
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              title="Programs"
              actions={<IconButton variant="tonal" icon="add" label="New workout" onPress={newWorkout} />}
            />
            <Group>
              <ListRow
                title="Exercise library"
                subtitle="Browse exercises and add your own"
                leading={<IconTile icon="library-outline" />}
                onPress={() => router.push('/exercises')}
                last
              />
            </Group>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {rows.length > 0 ? (
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Workouts
              </Text>
            ) : null}
            {!workouts && !error && showSkeleton ? (
              <Group>
                <SkeletonRows count={4} />
              </Group>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          workouts ? (
            <EmptyState
              icon="barbell-outline"
              title="No workouts yet"
              message="Build a workout from the exercise library. You can assign it to clients next."
              action={<Button title="Build a workout" onPress={newWorkout} />}
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          return (
            <View style={groupedItem(index, rows.length)}>
              <ListRow
                title={item.name}
                subtitle={workoutSummary(item.workout_exercises ?? [])}
                leading={<IconTile icon="barbell-outline" />}
                onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.id } })}
                last={index === rows.length - 1}
              />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    width: '100%',
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
  },
  header: {
    gap: Spacing.section,
    marginBottom: Spacing.tight,
  },
}));
