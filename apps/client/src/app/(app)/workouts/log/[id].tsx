import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { clockTime, weekdayDayMonth } from '@/lib/days';
import { saveError } from '@/lib/errors';
import { useGoBack } from '@/lib/nav';
import { useSettings } from '@/lib/settings';
import { formatNumber, formatWeight, type WeightUnit } from '@/lib/units';
import {
  deleteWorkoutLog,
  durationLabel,
  exerciseKey,
  loadRecords,
  loadWorkoutLog,
  recordLabel,
  topRecords,
  type LoggedSet,
  type RecordRow,
  type WorkoutLog,
} from '@/lib/workout-log';

// "62.5 kg × 8", "15 reps", or ✓ for a set that was just done.
function setText(set: LoggedSet, unit: WeightUnit) {
  const weight = set.weight_kg !== null && set.weight_kg > 0 ? formatWeight(set.weight_kg, unit) : null;
  if (weight && set.reps !== null) return `${weight} × ${formatNumber(set.reps)}`;
  if (weight) return weight;
  if (set.reps !== null) return set.reps === 1 ? '1 rep' : `${formatNumber(set.reps)} reps`;
  return null;
}

// One saved workout: every set, the note, and the bests it set.
export default function WorkoutLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useSettings();
  const unit = settings.units;
  const goBack = useGoBack();
  const [log, setLog] = useState<WorkoutLog | null | undefined>(undefined);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadWorkoutLog(id), loadRecords(200).catch(() => [])]).then(
      ([found, all]) => {
        if (!alive) return;
        setLog(found);
        setRecords(all.filter((r) => r.log_id === id));
        setFailed(false);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  async function remove() {
    const sure = await confirm(
      'Delete this workout?',
      "It's removed from your history and personal bests. The tick on your plan stays; untick it there if you want.",
      'Delete',
    );
    if (!sure) return;
    setDeleting(true);
    setProblem(null);
    try {
      await deleteWorkoutLog(id);
      goBack('/workouts/history');
    } catch (e) {
      setProblem(saveError(e, "That didn't delete. Check your connection and try again."));
      setDeleting(false);
    }
  }

  if (log === undefined || log === null) {
    return (
      <View style={styles.content}>
        <Stack.Screen options={{ title: 'Workout' }} />
        {failed ? (
          <View style={{ gap: Spacing.three }}>
            <ErrorText>Could not load this workout. Check your internet connection.</ErrorText>
            <Button title="Try again" variant="secondary" onPress={() => setAttempt((a) => a + 1)} />
          </View>
        ) : log === null ? (
          <Body secondary>This workout could not be found.</Body>
        ) : (
          <ActivityIndicator color={Colors.accentText} />
        )}
      </View>
    );
  }

  // Sets by exercise, in the order they were done.
  const exercises: { position: number; name: string; sets: LoggedSet[] }[] = [];
  for (const set of log.sets) {
    const last = exercises.at(-1);
    if (last && last.position === set.position) last.sets.push(set);
    else exercises.push({ position: set.position, name: set.exercise_name, sets: [set] });
  }
  const best = topRecords(records);
  const withRecord = new Set(best.map((r) => exerciseKey(r.exercise_name)));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: log.workout_name }} />
      <View style={{ gap: Spacing.one }}>
        <Text style={styles.title}>{log.workout_name}</Text>
        <Body secondary>
          {weekdayDayMonth(log.day)} · {clockTime(log.started_at)}–{clockTime(log.finished_at)} ·{' '}
          {durationLabel(log.started_at, log.finished_at)}
        </Body>
      </View>
      {log.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Your note</Text>
          <Body>{log.note}</Body>
        </View>
      ) : null}
      {best.length ? (
        <Card style={{ gap: Spacing.two }}>
          <View style={styles.row}>
            <Ionicons name="trophy" size={20} color={Colors.accentText} />
            <Text style={styles.exercise}>New bests</Text>
          </View>
          {best.map((r) => (
            <Body key={`${r.exercise_name}-${r.kind}`} secondary style={{ fontSize: 15 }}>
              {r.exercise_name}: {recordLabel(r, unit)}
            </Body>
          ))}
        </Card>
      ) : null}
      {exercises.map((ex) => (
        <Card key={ex.position} style={{ gap: Spacing.two }}>
          <View style={styles.row}>
            <Text style={[styles.exercise, { flex: 1 }]}>{ex.name}</Text>
            {withRecord.has(exerciseKey(ex.name)) ? (
              <Ionicons name="trophy" size={18} color={Colors.accentText} accessibilityLabel="New best" />
            ) : null}
          </View>
          {ex.sets.map((set) => {
            const text = setText(set, unit);
            return (
              <View key={set.set_number} style={styles.setRow}>
                {text ? (
                  <>
                    <Text style={styles.setNumber}>{set.set_number}</Text>
                    <Text style={styles.setText}>{text}</Text>
                  </>
                ) : (
                  <Text style={styles.setText}>Set {set.set_number} ✓</Text>
                )}
              </View>
            );
          })}
        </Card>
      ))}
      <ErrorText>{problem}</ErrorText>
      <Button title="Delete workout" variant="ghost" onPress={remove} loading={deleting} />
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exercise: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 28,
  },
  setNumber: {
    width: 20,
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  setText: {
    color: Colors.text,
    fontSize: 16,
  },
}));
