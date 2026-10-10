import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chips } from '@/components/chips';
import { SessionRow } from '@/components/session-row';
import { useToast } from '@/components/toast';
import { Button, EmptyState, Group, Notice, PageHeader, SkeletonRows, Text, useDelayed } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { fullName } from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { monthYear } from '@/lib/format';
import { loadOverview } from '@/lib/overview';
import { dayKey, SESSION_COLUMNS, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type Show = 'upcoming' | 'completed' | 'no_show' | 'cancelled';
const SHOWS: Record<Show, string> = {
  upcoming: 'Upcoming',
  completed: 'Done',
  no_show: 'No-shows',
  cancelled: 'Cancelled',
};
const PAGE = 50;

function showOf(value: string | undefined): Show | null {
  return value && value in SHOWS ? (value as Show) : null;
}

type Counts = { done: number; noShows: number; cancelled: number };

// Every session with one client, a month at a time, with what they cost: all of them, or just the
// upcoming, done, no-show or cancelled ones.
export default function ClientSessions() {
  const params = useLocalSearchParams<{ id: string; show?: string }>();
  const id = params.id;
  const show = showOf(params.show);
  const toast = useToast();
  const [client, setClient] = useState<{ first_name: string; last_name: string | null; status: string } | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const loads = useRef(0);
  const showSkeleton = useDelayed(300);

  const query = useCallback(
    (from: number) => {
      let q = supabase.from('sessions').select(SESSION_COLUMNS).eq('client_id', id);
      if (show === 'upcoming') q = q.eq('status', 'scheduled').gte('starts_at', new Date().toISOString());
      else if (show) q = q.eq('status', show);
      return q.order('starts_at', { ascending: show === 'upcoming' }).range(from, from + PAGE - 1);
    },
    [id, show],
  );

  const load = useCallback(async () => {
    const n = ++loads.current;
    const [person, list, overview, cancelled] = await Promise.all([
      supabase.from('clients').select('first_name, last_name, status').eq('id', id).maybeSingle(),
      query(0),
      loadOverview(dayKey(new Date()), id).catch(() => null),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .eq('status', 'cancelled'),
    ]);
    if (n !== loads.current) return;
    if (list.error || person.error) return setFailed(true);
    setFailed(false);
    if (person.data) setClient(person.data as { first_name: string; last_name: string | null; status: string });
    const rows = (list.data ?? []) as unknown as Session[];
    setSessions(rows);
    setMore(rows.length === PAGE);
    const row = overview?.[0];
    setCounts(row ? { done: row.sessions_done, noShows: row.no_shows, cancelled: cancelled.count ?? 0 } : null);
  }, [id, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function showMore() {
    if (!sessions) return;
    setLoadingMore(true);
    const { data, error } = await query(sessions.length);
    setLoadingMore(false);
    if (error) return toast(plainError(error, 'Couldn’t load more. Try again.'));
    const rows = (data ?? []) as unknown as Session[];
    setSessions([...sessions, ...rows]);
    setMore(rows.length === PAGE);
  }

  function choose(next: Show | null) {
    setSessions(null);
    router.setParams({ show: next ?? undefined });
  }

  // A group per month, in the order loaded.
  const months: { key: string; label: string; rows: Session[] }[] = [];
  for (const s of sessions ?? []) {
    const date = new Date(s.starts_at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const month = months[months.length - 1];
    if (month?.key === key) month.rows.push(s);
    else months.push({ key, label: monthYear(date), rows: [s] });
  }
  const first = client?.first_name ?? '';

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Sessions', headerTitle: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.tight }}>
          <PageHeader eyebrow={client ? fullName(client) : ' '} title="Sessions" />
          {counts ? (
            <Text variant="footnote" tone="secondary">
              {summaryOf(counts)}
            </Text>
          ) : null}
        </View>
        <Chips options={SHOWS} value={show} onChange={choose} all="All" />

        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {sessions ? 'Couldn’t refresh the sessions.' : 'The sessions couldn’t be loaded.'}
          </Notice>
        ) : null}

        {!sessions ? (
          showSkeleton && !failed ? (
            <Group>
              <SkeletonRows count={6} />
            </Group>
          ) : null
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={show ? `No ${SHOWS[show].toLowerCase()} sessions` : 'No sessions yet'}
            message={first ? `Book one with ${first}.` : 'Sessions show here.'}
            action={
              client?.status === 'active' ? (
                <Button
                  title="Book"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/sessions/new', params: { clientId: id } })}
                />
              ) : undefined
            }
          />
        ) : (
          <View style={{ gap: Spacing.four }}>
            {months.map((m) => (
              <View key={m.key} style={{ gap: Spacing.two }}>
                <Text variant="label" tone="secondary" accessibilityRole="header">
                  {m.label}
                </Text>
                <Group>
                  {m.rows.map((s, i) => (
                    <SessionRow key={s.id} session={s} variant="grouped" showDay price last={i === m.rows.length - 1} />
                  ))}
                </Group>
              </View>
            ))}
            {more ? (
              <Button
                title="Show more"
                variant="ghost"
                onPress={showMore}
                loading={loadingMore}
                style={{ alignSelf: 'center' }}
              />
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.four,
  },
}));

// "4 done · 1 no-show": the counts there are, all time. Done always shows; no-shows and cancelled only when
// there are some.
function summaryOf({ done, noShows, cancelled }: Counts) {
  return [
    `${done} done`,
    noShows ? `${noShows} ${noShows === 1 ? 'no-show' : 'no-shows'}` : null,
    cancelled ? `${cancelled} cancelled` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
