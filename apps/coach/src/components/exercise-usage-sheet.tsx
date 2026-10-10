import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Group, IconTile, ListRow, SkeletonRows, Text } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Use = {
  workout_id: string;
  workouts: {
    name: string;
    client_id: string | null;
    program_id: string | null;
    clients: { first_name: string } | null;
    programs: { name: string } | null;
  } | null;
};

// Where an exercise is still used, after deleting it was refused: one row per workout, which opens it.
export function ExerciseUsageSheet({
  exerciseId,
  visible,
  onClose,
}: {
  exerciseId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [uses, setUses] = useState<Use[] | null>(null);

  useEffect(() => {
    if (!visible || !exerciseId) return;
    let alive = true;
    supabase
      .from('workout_exercises')
      .select('workout_id, workouts(name, client_id, program_id, clients(first_name), programs(name))')
      .eq('exercise_id', exerciseId)
      .limit(20)
      .then(({ data }) => {
        if (!alive) return;
        const seen = new Set<string>();
        setUses(
          ((data ?? []) as unknown as Use[]).filter((u) => {
            if (seen.has(u.workout_id)) return false;
            seen.add(u.workout_id);
            return true;
          }),
        );
      });
    return () => {
      alive = false;
    };
  }, [visible, exerciseId]);

  function where(u: Use) {
    const w = u.workouts;
    if (w?.client_id) return `${w.clients?.first_name ?? 'A client'}’s plan`;
    if (w?.program_id) return w.programs?.name ?? 'A program';
    return 'Your workouts';
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Where it’s used">
      <View testID="exercise-usage" style={{ gap: Spacing.three }}>
        <Text variant="callout" tone="secondary">
          Remove it from these workouts first, then delete it.
        </Text>
        {!uses ? (
          <SkeletonRows count={3} />
        ) : (
          <Group style={{ backgroundColor: Colors.tint }}>
            {uses.map((u, i) => (
              <ListRow
                key={u.workout_id}
                title={u.workouts?.name ?? 'Workout'}
                subtitle={where(u)}
                leading={<IconTile icon="barbell-outline" />}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/workouts/[id]', params: { id: u.workout_id } });
                }}
                last={i === uses.length - 1}
              />
            ))}
          </Group>
        )}
      </View>
    </Sheet>
  );
}
