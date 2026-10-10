import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import {
  Button,
  EmptyState,
  Group,
  IconTile,
  ListRow,
  Notice,
  Section,
  Segmented,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
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

const VIEWS: { value: Tab; label: string }[] = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'bests', label: 'Personal bests' },
];
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
          first && allBests && allRecords ? null : "Couldn't load your workouts. Check your connection and try again.",
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
      setError("Couldn't load older workouts. Check your connection and try again.");
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error ? (
        <Notice tone="danger" action={{ label: 'Try again', onPress: refresh, loading: refreshing }}>
          {error}
        </Notice>
      ) : null}

      {view === 'workouts' ? (
        logs === null ? (
          !error ? (
            <Loading />
          ) : null
        ) : logs.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No workouts yet"
            message="Start one from your plan and it shows up here."
          />
        ) : (
          <View style={{ gap: Spacing.tight }}>
            <Group>
              {logs.map((log, i) => (
                <LogRow key={log.id} log={log} newBests={bestsPerLog.get(log.id) ?? 0} last={i === logs.length - 1} />
              ))}
            </Group>
            {more ? <Button title="Load more" variant="secondary" onPress={loadMore} loading={loadingMore} /> : null}
          </View>
        )
      ) : bests === null ? (
        !error ? (
          <Loading />
        ) : null
      ) : bests.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No personal bests yet"
          message="Finish a workout and your bests show up here."
        />
      ) : (
        <>
          {top.length ? (
            <Section title="Recent new bests">
              <Group>
                {top.slice(0, 10).map((r, i, list) => (
                  <ListRow
                    key={`${r.log_id}-${r.exercise_name}-${r.kind}`}
                    title={r.exercise_name}
                    subtitle={
                      <Text variant="footnote" tone="secondary">
                        {recordLabel(r, unit)}
                      </Text>
                    }
                    leading={<IconTile icon="trophy-outline" />}
                    trailing={
                      <Text variant="footnote" tone="secondary" style={Tabular}>
                        {dayMonth(r.day)}
                      </Text>
                    }
                    onPress={() => router.push({ pathname: '/workouts/log/[id]', params: { id: r.log_id } })}
                    last={i === list.length - 1}
                  />
                ))}
              </Group>
            </Section>
          ) : null}
          <Section title="Every exercise">
            <Group>
              {bests.map((b, i) => (
                <ListRow
                  key={b.exercise_name}
                  title={b.exercise_name}
                  titleLines={2}
                  subtitle={
                    <View style={{ gap: 2, paddingTop: 2 }}>
                      {b.best_weight_kg !== null ? (
                        <Text variant="footnote">
                          Heaviest {formatWeight(b.best_weight_kg, unit)}
                          {b.best_weight_reps ? ` × ${b.best_weight_reps}` : ''}
                          {b.best_weight_on ? ` · ${dayMonth(b.best_weight_on)}` : ''}
                        </Text>
                      ) : null}
                      {b.best_e1rm_kg !== null ? (
                        <Text variant="footnote">
                          Best one-rep max (estimated) {formatEstimate(b.best_e1rm_kg, unit)}
                        </Text>
                      ) : null}
                      {b.most_reps !== null ? (
                        <Text variant="footnote">Most reps {formatNumber(b.most_reps)}</Text>
                      ) : null}
                      <Text variant="footnote" tone="secondary">
                        Done {b.times_done === 1 ? 'once' : `${b.times_done} times`}
                        {b.last_done_on ? ` · last ${dayMonth(b.last_done_on)}` : ''}
                      </Text>
                    </View>
                  }
                  last={i === bests.length - 1}
                />
              ))}
            </Group>
            <Text variant="footnote" tone="secondary">
              The one-rep max is what you could likely lift once, worked out from your sets.
            </Text>
          </Section>
        </>
      )}
      <Text variant="footnote" tone="secondary">
        Your trainers can see this.
      </Text>
    </ScrollView>
  );
}

// Rows shaped like the list, after a short wait so fast loads show nothing.
function Loading() {
  const shown = useDelayed();
  return shown ? <SkeletonRows count={4} avatar /> : null;
}

function LogRow({ log, newBests, last }: { log: WorkoutLog; newBests: number; last: boolean }) {
  const sets = log.sets.length;
  return (
    <ListRow
      title={log.workout_name}
      subtitle={
        // Two lines, so a new-best pill never cuts off the sets; each part stays whole when it wraps.
        <Text variant="footnote" tone="secondary" numberOfLines={2}>
          {[
            weekdayDayMonth(log.day),
            durationLabel(log.started_at, log.finished_at),
            sets === 1 ? '1 set' : `${sets} sets`,
          ]
            .map((part) => part.replace(/ /g, '\u00a0'))
            .join(' · ')}
        </Text>
      }
      leading={<IconTile icon="barbell-outline" />}
      status={
        newBests ? <StatusPill tone="success" label={newBests === 1 ? '1 new best' : `${newBests} new bests`} /> : null
      }
      onPress={() => router.push({ pathname: '/workouts/log/[id]', params: { id: log.id } })}
      last={last}
    />
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
}));
