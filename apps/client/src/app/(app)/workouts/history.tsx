import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Body, Button, EmptyState, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { dayMonth, weekdayDayMonth } from '@/lib/days';
import { serial } from '@/lib/serial';
import { useSettings } from '@/lib/settings';
import { formatEstimate, formatNumber, formatWeight } from '@/lib/units';
import {
  durationLabel,
  loadPersonalBests,
  loadRecords,
  loadWorkoutLogs,
  recordLabel,
  topRecords,
  type PersonalBest,
  type RecordRow,
  type WorkoutLog,
} from '@/lib/workout-log';

type Tab = 'workouts' | 'bests';

const VIEWS: Record<Tab, string> = { workouts: 'Workouts', bests: 'Personal bests' };
const PAGE = 20;

// The client's saved workouts, newest first, and their personal bests.
export default function WorkoutHistory() {
  const { settings } = useSettings();
  const unit = settings.units;
  const [view, setView] = useState<Tab>('workouts');
  const [logs, setLogs] = useState<WorkoutLog[] | null>(null);
  const [bests, setBests] = useState<PersonalBest[] | null>(null);
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  // False once a page came back short: there are no older workouts.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A failed refresh keeps what is on screen.
  const load = useMemo(
    () =>
      serial(async (current) => {
        const [first, allBests, allRecords] = await Promise.all([
          loadWorkoutLogs(null, PAGE).catch(() => null),
          loadPersonalBests().catch(() => null),
          loadRecords(200).catch(() => null),
        ]);
        if (!current()) return;
        if (first) {
          setLogs(first);
          setMore(first.length === PAGE);
        }
        if (allBests) setBests(allBests);
        if (allRecords) setRecords(allRecords);
        setError(
          first && allBests && allRecords ? null : 'Could not load your workouts. Check your internet connection.',
        );
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatEvents((event) => {
    if (event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function loadMore() {
    const last = logs?.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadWorkoutLogs(last.finished_at, PAGE);
      setLogs((old) => {
        const seen = new Set((old ?? []).map((l) => l.id));
        return [...(old ?? []), ...page.filter((l) => !seen.has(l.id))];
      });
      setMore(page.length === PAGE);
    } catch {
      setError('Could not load more. Check your internet connection.');
    }
    setLoadingMore(false);
  }

  // At most one new best per exercise in each workout.
  const top = records ? topRecords(records) : [];
  const bestsPerLog = new Map<string, number>();
  for (const r of top) bestsPerLog.set(r.log_id, (bestsPerLog.get(r.log_id) ?? 0) + 1);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      <Chips options={VIEWS} value={view} onChange={(v) => v && setView(v)} />
      {error ? (
        <View style={{ gap: Spacing.two }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={refresh} loading={refreshing} />
        </View>
      ) : null}

      {view === 'workouts' ? (
        logs === null ? (
          !error ? (
            <ActivityIndicator color={Colors.accentText} />
          ) : null
        ) : logs.length === 0 ? (
          <EmptyState icon="time" title="No workouts yet" message="Start one from your plan and it shows up here." />
        ) : (
          <View style={{ gap: Spacing.two }}>
            {logs.map((log) => (
              <LogCard key={log.id} log={log} newBests={bestsPerLog.get(log.id) ?? 0} />
            ))}
            {more ? <Button title="Load more" variant="secondary" onPress={loadMore} loading={loadingMore} /> : null}
          </View>
        )
      ) : bests === null ? (
        !error ? (
          <ActivityIndicator color={Colors.accentText} />
        ) : null
      ) : bests.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No personal bests yet"
          message="Finish a workout and your bests show up here."
        />
      ) : (
        <View style={{ gap: Spacing.three }}>
          {top.length ? (
            <View style={{ gap: Spacing.two }}>
              <Text style={styles.section}>Recent new bests</Text>
              {top.slice(0, 10).map((r) => (
                <Pressable
                  key={`${r.log_id}-${r.exercise_name}-${r.kind}`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/workouts/log/[id]', params: { id: r.log_id } })}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
                  <Ionicons name="trophy" size={20} color={Colors.accentText} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name}>{r.exercise_name}</Text>
                    <Body secondary style={styles.small}>
                      {recordLabel(r, unit)}
                    </Body>
                  </View>
                  <Text style={styles.date}>{dayMonth(r.day)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ gap: Spacing.two }}>
            <Text style={styles.section}>Every exercise</Text>
            {bests.map((b) => (
              <View key={b.exercise_name} style={[styles.row, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name}>{b.exercise_name}</Text>
                  {b.best_weight_kg !== null ? (
                    <Body style={styles.small}>
                      Heaviest {formatWeight(b.best_weight_kg, unit)}
                      {b.best_weight_reps ? ` × ${b.best_weight_reps}` : ''}
                      {b.best_weight_on ? ` · ${dayMonth(b.best_weight_on)}` : ''}
                    </Body>
                  ) : null}
                  {b.best_e1rm_kg !== null ? (
                    <Body style={styles.small}>
                      Best one-rep max (estimated) {formatEstimate(b.best_e1rm_kg, unit)}
                    </Body>
                  ) : null}
                  {b.most_reps !== null ? (
                    <Body style={styles.small}>Most reps {formatNumber(b.most_reps)}</Body>
                  ) : null}
                  <Body secondary style={styles.small}>
                    Done {b.times_done === 1 ? 'once' : `${b.times_done} times`}
                    {b.last_done_on ? ` · last ${dayMonth(b.last_done_on)}` : ''}
                  </Body>
                </View>
              </View>
            ))}
            <Body secondary style={styles.small}>
              What you could likely lift once, worked out from your sets.
            </Body>
          </View>
        </View>
      )}
      <Body secondary style={styles.small}>
        Your trainers can see this.
      </Body>
    </ScrollView>
  );
}

function LogCard({ log, newBests }: { log: WorkoutLog; newBests: number }) {
  const sets = log.sets.length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/workouts/log/[id]', params: { id: log.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={styles.icon}>
        <Ionicons name="barbell" size={20} color={Colors.accentText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name}>{log.workout_name}</Text>
        <Body secondary style={styles.small}>
          {weekdayDayMonth(log.day)} · {durationLabel(log.started_at, log.finished_at)} ·{' '}
          {sets === 1 ? '1 set' : `${sets} sets`}
        </Body>
        {newBests ? (
          <Text style={styles.bests}>
            <Ionicons name="trophy" size={13} color={Colors.accentText} />{' '}
            {newBests === 1 ? '1 new best' : `${newBests} new bests`}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
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
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  date: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  bests: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
  },
}));
