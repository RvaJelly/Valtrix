import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Section,
  Skeleton,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
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
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this workout"
            message="Check your connection and try again."
            action={<Button title="Try again" variant="secondary" onPress={() => setAttempt((a) => a + 1)} />}
          />
        ) : log === null ? (
          <EmptyState
            icon="time-outline"
            title="Workout not found"
            message="It may have been deleted. Your other workouts are in your history."
          />
        ) : (
          <Loading />
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
      <Stack.Screen options={{ title: 'Workout' }} />
      <View style={{ gap: Spacing.one }}>
        <Text variant="title" accessibilityRole="header">
          {log.workout_name}
        </Text>
        <Text variant="callout" tone="secondary" style={Tabular}>
          {weekdayDayMonth(log.day)} · {clockTime(log.started_at)}–{clockTime(log.finished_at)} ·{' '}
          {durationLabel(log.started_at, log.finished_at)}
        </Text>
      </View>
      {log.note ? (
        <View style={styles.note}>
          <Text variant="label" tone="secondary">
            Your note
          </Text>
          <Text variant="callout">{log.note}</Text>
        </View>
      ) : null}
      {best.length ? (
        <Section title="New bests">
          <Group>
            {best.map((r, i) => (
              <ListRow
                key={`${r.exercise_name}-${r.kind}`}
                title={r.exercise_name}
                subtitle={
                  <Text variant="footnote" tone="secondary">
                    {recordLabel(r, unit)}
                  </Text>
                }
                leading={<IconTile icon="trophy-outline" />}
                last={i === best.length - 1}
              />
            ))}
          </Group>
        </Section>
      ) : null}
      <Section title="Sets">
        {exercises.map((ex) => (
          <Card key={ex.position} style={{ gap: Spacing.two }}>
            <View style={styles.exerciseHeader}>
              <Text variant="headline" style={{ flex: 1 }}>
                {ex.name}
              </Text>
              {withRecord.has(exerciseKey(ex.name)) ? <StatusPill tone="success" label="New best" /> : null}
            </View>
            {ex.sets.map((set) => {
              const text = setText(set, unit);
              return (
                <View key={set.set_number} style={styles.setRow}>
                  {text ? (
                    <>
                      <Text variant="footnote" tone="secondary" style={[styles.setNumber, Tabular]}>
                        {set.set_number}
                      </Text>
                      <Text variant="callout" style={Tabular}>
                        {text}
                      </Text>
                    </>
                  ) : (
                    <Text variant="callout">Set {set.set_number} ✓</Text>
                  )}
                </View>
              );
            })}
          </Card>
        ))}
      </Section>
      <View style={{ gap: Spacing.tight }}>
        <ErrorText>{problem}</ErrorText>
        <Button title="Delete workout" variant="destructive" onPress={remove} loading={deleting} />
      </View>
    </ScrollView>
  );
}

// A title, a line and two cards of sets, after a short wait so fast loads show nothing.
function Loading() {
  const shown = useDelayed();
  if (!shown) return null;
  return (
    <View accessible accessibilityLabel="Loading" style={{ gap: Spacing.three }}>
      <Skeleton width="60%" height={22} />
      <Skeleton width="80%" height={14} />
      {[0, 1].map((i) => (
        <Skeleton key={i} height={120} radius={Radius.large} />
      ))}
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.gutter,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
  },
  note: {
    gap: Spacing.one,
    paddingLeft: Spacing.tight,
    paddingVertical: Spacing.one,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderStrong,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.tight,
    minHeight: 24,
  },
  setNumber: {
    width: 20,
    textAlign: 'right',
  },
}));
