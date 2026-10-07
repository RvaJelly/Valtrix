import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Body, Button, EmptyState, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Workout } from '@/lib/workouts';

type WorkoutRow = Workout & { workout_exercises: { count: number }[] };

export default function Programs() {
  const navigation = useNavigation();
  const [workouts, setWorkouts] = useState<WorkoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="New workout"
          hitSlop={12}
          onPress={() => router.push('/workouts/new')}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="add-circle" size={28} color={Colors.orange} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, name, notes, updated_at, workout_exercises(count)')
      .order('updated_at', { ascending: false });
    if (error) {
      setError(error.message);
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

  const libraryLink = (
    <Pressable
      onPress={() => router.push('/exercises')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={[styles.icon, { backgroundColor: Colors.surfaceRaised }]}>
        <Ionicons name="library" size={22} color={Colors.orange} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>Exercise library</Text>
        <Body secondary style={{ fontSize: 14 }}>
          Browse exercises and add your own
        </Body>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <FlatList
      data={workouts ?? []}
      keyExtractor={(w) => w.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.orange} />}
      ListHeaderComponent={
        <View style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
          {libraryLink}
          <ErrorText>{error}</ErrorText>
          {workouts && workouts.length > 0 ? <Text style={styles.section}>Your workouts</Text> : null}
        </View>
      }
      ListEmptyComponent={
        workouts ? (
          <EmptyState
            icon="barbell-outline"
            title="No workouts yet"
            message="Build a workout from the exercise library. You can assign it to clients next."
            action={<Button title="Build a workout" onPress={() => router.push('/workouts/new')} />}
          />
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
      renderItem={({ item }) => {
        const count = item.workout_exercises[0]?.count ?? 0;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <View style={styles.icon}>
              <Ionicons name="barbell" size={22} color={Colors.black} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Body secondary style={{ fontSize: 14 }}>
                {count === 1 ? '1 exercise' : `${count} exercises`}
              </Body>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.three,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
