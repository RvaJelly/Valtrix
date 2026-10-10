import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useClientData } from '@/lib/client-data';
import type { Client } from '@/lib/clients';
import { dayMonth, weekdayDayMonth } from '@/lib/days';
import {
  durationLabel,
  exerciseKey,
  loadClientPersonalBests,
  loadClientRecords,
  loadClientWorkoutLogs,
  recordLabel,
  topRecords,
  type LoggedSet,
  type PersonalBest,
  type RecordRow,
  type WorkoutLog,
} from '@/lib/progress';
import { addDays, dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { formatEstimate, formatNumber, formatWeight, type WeightUnit } from '@/lib/units';

type Data = {
  logs: WorkoutLog[];
  // The last page was full, so there may be older workouts.
  more: boolean;
  bests: PersonalBest[];
  records: RecordRow[];
};

const FIRST_PAGE = 5;
const NEXT_PAGE = 10;
// The most one request brings back.
const MOST_PER_REQUEST = 100;
const BESTS_SHOWN = 5;
// New bests from the last two weeks.
const RECENT_DAYS = 14;

// The newest `count` workouts, a page at a time.
async function loadLogs(clientId: string, count: number): Promise<WorkoutLog[]> {
  const logs: WorkoutLog[] = [];
  while (logs.length < count) {
    const want = Math.min(MOST_PER_REQUEST, count - logs.length);
    const page = await loadClientWorkoutLogs(clientId, logs.at(-1)?.finished_at ?? null, want);
    logs.push(...page);
    if (page.length < want) break;
  }
  return logs;
}

// Every reload brings back as many workouts as are shown (more after "Show more"), so the
// list doesn't shrink while the trainer reads it, and one the client deleted goes away.
function load(clientId: string, count: number): Promise<Data> {
  return Promise.all([
    loadLogs(clientId, count),
    loadClientPersonalBests(clientId),
    loadClientRecords(clientId, 50),
  ]).then(([logs, bests, records]) => ({ logs, more: logs.length === count, bests, records }));
}

const KINDS = ['workout'] as const;

// The workouts a client logged in Voltrix, newest first, with their new and personal bests.
// Read-only. Shown only for a client who accepted the trainer.
export function ClientTrainingLog({ client }: { client: Pick<Client, 'id' | 'first_name' | 'user_id'> }) {
  const { settings } = useSettings();
  const unit = settings.units;
  // How many workouts to show. "Show more" raises it, and the part loads again with more.
  const [count, setCount] = useState(FIRST_PAGE);
  const loadShown = useCallback((clientId: string) => load(clientId, count), [count]);
  const { data, failed, again } = useClientData(client.id, loadShown, KINDS);
  // Workouts opened to show their sets.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allBests, setAllBests] = useState(false);

  // Asked for more than is on screen and still waiting (or it failed).
  const waitingForMore = !!data && data.more && data.logs.length < count;
  const loadingMore = waitingForMore && !failed;
  const moreError =
    waitingForMore && failed ? 'Could not load more workouts. Check your internet connection and try again.' : null;

  function showMore() {
    if (waitingForMore) again();
    else setCount((c) => c + NEXT_PAGE);
  }

  const since = dayKey(addDays(new Date(), -RECENT_DAYS));
  const records = data?.records ?? [];
  const recent = topRecords(records.filter((r) => r.day >= since));
  // Exercises with a new best, in each workout.
  const bestIn = new Set(records.map((r) => `${r.log_id}|${exerciseKey(r.exercise_name)}`));
  const newBests = (logId: string) => topRecords(records.filter((r) => r.log_id === logId)).length;

  return (
    <View testID="client-training-log" style={styles.part}>
      <Text style={styles.section}>Workout log</Text>
      {!data && !failed ? <ActivityIndicator color={Colors.accentText} /> : null}
      {!data && failed ? (
        <>
          <ErrorText>Could not load {client.first_name}’s workouts. Check your internet connection.</ErrorText>
          <Button title="Try again" variant="secondary" onPress={again} />
        </>
      ) : null}

      {data && !data.logs.length && !data.bests.length ? (
        <Body secondary style={styles.small}>
          No workouts logged yet. When {client.first_name} finishes a workout in Voltrix, it shows here.
        </Body>
      ) : null}

      {data?.logs.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          unit={unit}
          open={!!open[log.id]}
          bests={newBests(log.id)}
          bestIn={bestIn}
          onToggle={() => setOpen((o) => ({ ...o, [log.id]: !o[log.id] }))}
        />
      ))}
      {data?.more ? (
        <Button
          title="Show more"
          variant="secondary"
          onPress={showMore}
          loading={loadingMore}
          accessibilityLabel={`Show more of ${client.first_name}’s workouts`}
        />
      ) : null}
      <ErrorText>{moreError}</ErrorText>

      {recent.length ? (
        <View style={styles.card}>
          <Text style={styles.subhead}>New bests</Text>
          {recent.map((r) => (
            <View
              key={`${r.log_id}-${r.exercise_name}-${r.kind}`}
              style={styles.recordRow}
              accessible
              accessibilityLabel={`${r.exercise_name}, ${recordLabel(r, unit)}, ${dayMonth(r.day)}`}>
              <Ionicons name="trophy" size={18} color={Colors.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recordText}>
                  {r.exercise_name} · {recordLabel(r, unit)}
                </Text>
                <Text style={styles.meta}>{dayMonth(r.day)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {data?.bests.length ? (
        <View style={styles.card}>
          <Text style={styles.subhead}>Personal bests</Text>
          {(allBests ? data.bests : data.bests.slice(0, BESTS_SHOWN)).map((best) => (
            <BestRow key={exerciseKey(best.exercise_name)} best={best} unit={unit} />
          ))}
          {data.bests.length > BESTS_SHOWN ? (
            <Button
              title={allBests ? 'Show fewer' : 'Show all'}
              variant="ghost"
              onPress={() => setAllBests((a) => !a)}
              accessibilityLabel={allBests ? 'Show fewer personal bests' : 'Show all personal bests'}
            />
          ) : null}
          {data.bests.some((b) => b.best_e1rm_kg !== null) ? (
            <Body secondary style={styles.small}>
              Best one-rep max is what {client.first_name} could likely lift once, worked out from their sets.
            </Body>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// "Set 1  62.5 kg × 8", "Set 2  15 reps", or "Set 1 ✓" for a set that was just done.
function setValue(set: LoggedSet, unit: WeightUnit) {
  const weight = set.weight_kg !== null && set.weight_kg > 0 ? formatWeight(set.weight_kg, unit) : null;
  if (weight && set.reps !== null) return `${weight} × ${set.reps}`;
  if (weight) return weight;
  if (set.reps !== null) return set.reps === 1 ? '1 rep' : `${formatNumber(set.reps)} reps`;
  return null;
}

// The sets grouped by exercise, in the order they were done.
function byExercise(sets: LoggedSet[]) {
  const groups: { position: number; name: string; sets: LoggedSet[] }[] = [];
  for (const set of sets) {
    const group = groups[groups.length - 1];
    if (group && group.position === set.position) group.sets.push(set);
    else groups.push({ position: set.position, name: set.exercise_name, sets: [set] });
  }
  return groups;
}

function LogCard({
  log,
  unit,
  open,
  bests,
  bestIn,
  onToggle,
}: {
  log: WorkoutLog;
  unit: WeightUnit;
  open: boolean;
  bests: number;
  bestIn: Set<string>;
  onToggle: () => void;
}) {
  const sets = log.sets.length === 1 ? '1 set' : `${log.sets.length} sets`;
  const summary = `${weekdayDayMonth(log.day)} · ${durationLabel(log.started_at, log.finished_at)} · ${sets}`;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${log.workout_name}, ${summary}${bests ? `, ${bests === 1 ? '1 new best' : `${bests} new bests`}` : ''}. ${open ? 'Hide the sets' : 'Show the sets'}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.logHeader, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <View style={styles.titleRow}>
            <Text style={styles.logName} numberOfLines={2}>
              {log.workout_name}
            </Text>
            {log.from_my_plan ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Your plan</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.meta}>{summary}</Text>
          {bests ? (
            <View style={styles.bestsLine}>
              <Ionicons name="trophy" size={14} color={Colors.accentText} />
              <Text style={styles.bestsText}>{bests === 1 ? '1 new best' : `${bests} new bests`}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.sets}>
          {byExercise(log.sets).map((group) => (
            <View key={group.position} style={{ gap: 2 }}>
              <View style={styles.exerciseRow}>
                <Text style={styles.exercise}>{group.name}</Text>
                {bestIn.has(`${log.id}|${exerciseKey(group.name)}`) ? (
                  <Ionicons name="trophy" size={14} color={Colors.accentText} accessibilityLabel="New best" />
                ) : null}
              </View>
              {group.sets.map((set) => {
                const value = setValue(set, unit);
                return (
                  <Text key={set.set_number} style={styles.setLine}>
                    <Text style={styles.setNumber}>Set {set.set_number}</Text>
                    {value ? `  ${value}` : ' ✓'}
                  </Text>
                );
              })}
            </View>
          ))}
          {log.note ? <Text style={styles.note}>“{log.note}”</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function BestRow({ best, unit }: { best: PersonalBest; unit: WeightUnit }) {
  const lines: string[] = [];
  if (best.best_weight_kg !== null) {
    const reps = best.best_weight_reps ? ` × ${best.best_weight_reps}` : '';
    const on = best.best_weight_on ? ` · ${dayMonth(best.best_weight_on)}` : '';
    lines.push(`Heaviest ${formatWeight(best.best_weight_kg, unit)}${reps}${on}`);
  }
  if (best.best_e1rm_kg !== null) lines.push(`Best one-rep max (estimated) ${formatEstimate(best.best_e1rm_kg, unit)}`);
  if (best.most_reps !== null) lines.push(`Most reps ${formatNumber(best.most_reps)}`);
  const times = best.times_done === 1 ? 'Done once' : `Done ${formatNumber(best.times_done)} times`;
  lines.push(best.last_done_on ? `${times} · last ${dayMonth(best.last_done_on)}` : times);
  return (
    <View style={styles.best} accessible accessibilityLabel={`${best.exercise_name}. ${lines.join('. ')}`}>
      <Text style={styles.exercise}>{best.exercise_name}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={i === lines.length - 1 ? styles.meta : styles.bestLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = themed(() => ({
  part: {
    gap: Spacing.three,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  subhead: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  logName: {
    flexShrink: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.small,
    backgroundColor: Colors.surfaceRaised,
  },
  tagText: {
    color: Colors.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  bestsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  bestsText: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '700',
  },
  sets: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  exercise: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  setLine: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  setNumber: {
    color: Colors.textSecondary,
  },
  note: {
    color: Colors.text,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  recordText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  best: {
    gap: 2,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bestLine: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
}));
