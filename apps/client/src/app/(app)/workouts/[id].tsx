import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PlanVideo } from '@/components/plan-video';
import { Body, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import {
  daysLabel,
  EQUIPMENT,
  loadPlan,
  loadPlanWorkout,
  markDone,
  MUSCLE_GROUPS,
  trainerLabel,
  undoDone,
  type PlanExercise,
  type PlanItem,
} from '@/lib/plan';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';

// "45 s", "90 s", "2 min", "2:30 min": short enough for a small box on any phone.
function restLabel(seconds: number) {
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}:${String(rest).padStart(2, '0')} min` : `${minutes} min`;
}

// Trainers write weights as free text. Plain numbers get the client's units.
function weightLabel(weight: string, units: string) {
  return /^\d+([.,]\d+)?(\s*[-–]\s*\d+([.,]\d+)?)?$/.test(weight.trim()) ? `${weight.trim()} ${units}` : weight;
}

// One workout from the client's plan: its exercises with sets, reps, weight, rest,
// notes and demo videos, and "Mark as done" for today.
export default function PlanWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [item, setItem] = useState<PlanItem | null>(null);
  const [exercises, setExercises] = useState<PlanExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadPlan(), loadPlanWorkout(id)])
      .then(([plan, list]) => {
        const found = plan.find((p) => p.plan_item_id === id);
        if (!found) return setError('This workout is no longer in your plan.');
        setItem(found);
        setExercises(list);
        setDoneToday(found.done_on.includes(dayKey(new Date())));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load this workout.'));
  }, [id]);

  async function setDone(done: boolean) {
    const today = dayKey(new Date());
    setBusy(true);
    setProblem(null);
    try {
      if (done) await markDone(id, today);
      else await undoDone(id, today);
      setDoneToday(done);
    } catch {
      setProblem('That didn’t save. Check your connection and try again.');
    }
    setBusy(false);
  }

  if (!item || !exercises) {
    return (
      <View style={{ padding: Spacing.four }}>
        <Stack.Screen options={{ title: 'Workout' }} />
        {error ? <Body secondary>{error}</Body> : <ActivityIndicator color={Colors.accentText} />}
      </View>
    );
  }

  const trainer = trainerLabel(item);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: item.workout_name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.title}>{item.workout_name}</Text>
          <View style={styles.meta}>
            <Avatar url={item.trainer_avatar} name={trainer} size={28} />
            <Text style={styles.metaText}>From {trainer}</Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              {daysLabel(item.weekdays)}
              {item.weekdays.length ? '' : ', once a week'}
            </Text>
          </View>
        </View>

        {item.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Note from {trainer}</Text>
            <Body>{item.note}</Body>
          </View>
        ) : null}
        {item.workout_notes ? <Body secondary>{item.workout_notes}</Body> : null}

        {item.workout_video_path ? (
          <Card>
            <PlanVideo path={item.workout_video_path} label="Workout video" title={item.workout_name} />
          </Card>
        ) : null}

        <Text style={styles.section}>{exercises.length === 1 ? '1 exercise' : `${exercises.length} exercises`}</Text>
        {exercises.length === 0 ? (
          <Card>
            <Body secondary>Your trainer hasn&apos;t added exercises to this workout yet.</Body>
          </Card>
        ) : null}
        {exercises.map((ex, index) => (
          <Card key={ex.id} style={{ gap: Spacing.three }}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.number}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                <Body secondary style={{ fontSize: 13 }}>
                  {[MUSCLE_GROUPS[ex.muscle_group], EQUIPMENT[ex.equipment]].filter(Boolean).join(' · ')}
                </Body>
              </View>
            </View>
            <View style={styles.stats}>
              <Stat label="Sets" value={String(ex.sets)} />
              <Stat label="Reps" value={ex.reps} />
              {ex.weight ? <Stat label="Weight" value={weightLabel(ex.weight, settings.units)} /> : null}
              {ex.rest_seconds != null ? <Stat label="Rest" value={restLabel(ex.rest_seconds)} /> : null}
            </View>
            {ex.notes ? <Body style={{ fontSize: 15 }}>{ex.notes}</Body> : null}
            {ex.instructions ? (
              <Body secondary style={{ fontSize: 14 }}>
                {ex.instructions}
              </Body>
            ) : null}
            {ex.video_path ? <PlanVideo path={ex.video_path} label="Demo video" title={ex.exercise_name} /> : null}
          </Card>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        {doneToday ? (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={28} color={Colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.doneTitle}>Done today</Text>
              <Body secondary style={{ fontSize: 13 }}>
                Nice work! {trainer} can see it.
              </Body>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo"
              onPress={() => setDone(false)}
              disabled={busy}
              hitSlop={8}
              style={({ pressed }) => [styles.undo, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              {busy ? (
                <ActivityIndicator size="small" color={Colors.accentText} />
              ) : (
                <Text style={styles.undoText}>Undo</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Button title="Mark as done" onPress={() => setDone(true)} loading={busy} />
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  noteBox: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  noteTitle: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
    overflow: 'hidden',
  },
  exerciseName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 64,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  statValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
  },
  doneTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  undo: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '800',
  },
  problem: {
    color: Colors.danger,
    fontSize: 14,
  },
}));
