import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { PersonSheet } from '@/components/person-sheet';
import { RequestSheet } from '@/components/request-sheet';
import { doctorUpdates, newsFirst, newsTarget, UpdateRow } from '@/components/update-row';
import {
  EmptyState,
  Group,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { longDate } from '@/lib/format';
import { loadNews, markAllSeen, type News } from '@/lib/news';
import { loadOverview } from '@/lib/overview';
import { loadRequests, type PersonRequest, type TimeRequest } from '@/lib/requests';
import { dayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

const PAGE = 50;

type Data = {
  items: News[];
  // Every page has been read.
  done: boolean;
  names: Map<string, string>;
  // Each client's health form state, from clients_overview (empty when it can't load).
  health: Map<string, string | null>;
  times: TimeRequest[];
  people: PersonRequest[];
};

// "Today", "Yesterday" or "Monday 12 October" for a day's heading.
function dayTitle(day: string, today: string, yesterday: string, at: Date) {
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return longDate(at);
}

// Everything clients did in Voltrix that the trainer should know about, from the last 30 days,
// newest first and grouped by day. Opening it marks everything seen; the "New" dots stay until the
// page is left, so the trainer can see what was new.
export default function Updates() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [more, setMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [openTime, setOpenTime] = useState<TimeRequest | null>(null);
  const [openPerson, setOpenPerson] = useState<PersonRequest | null>(null);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const load = useCallback(() => {
    const n = ++loads.current;
    return Promise.all([
      loadNews({ days: 30, limit: PAGE }),
      supabase.from('clients').select('id, first_name'),
      loadRequests().catch(() => null),
      loadOverview(dayKey(new Date())).catch(() => null),
    ]).then(
      ([items, clients, requests, overview]) => {
        if (n !== loads.current) return;
        setFailed(false);
        const names = new Map(
          ((clients.data ?? []) as { id: string; first_name: string }[]).map((c) => [c.id, c.first_name]),
        );
        setData((old) => {
          // A reload keeps the "New" marks the page opened with.
          const fresh = new Set((old?.items ?? []).filter((i) => !i.seen_at).map((i) => i.id));
          return {
            items: items.map((i) => (fresh.has(i.id) ? { ...i, seen_at: null } : i)),
            done: items.length < PAGE,
            names,
            health: new Map((overview ?? []).map((c) => [c.client_id, c.health])),
            times: requests?.times ?? [],
            people: requests?.people ?? [],
          };
        });
        if (items.some((i) => !i.seen_at)) markAllSeen().catch(() => {});
      },
      () => {
        if (n === loads.current) setFailed(true);
      },
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // News reloads a second after the last of a burst.
  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(load, 1000);
    return () => clearTimeout(timer);
  }, [load, news]);
  useChatEvents((event) => {
    if (event.type === 'news' || event.type === 'reconnected') setNews((n) => n + 1);
  });

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function loadMore() {
    if (!data || data.done || more) return;
    setMore(true);
    setMoreFailed(false);
    try {
      const next = await loadNews({ days: 30, limit: PAGE, offset: data.items.length });
      setData((d) =>
        d
          ? {
              ...d,
              items: [...d.items, ...next.filter((n) => !d.items.some((i) => i.id === n.id))],
              done: next.length < PAGE,
            }
          : d,
      );
      if (next.some((i) => !i.seen_at)) markAllSeen().catch(() => {});
    } catch {
      setMoreFailed(true);
    }
    setMore(false);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) loadMore();
  }

  function open(n: News) {
    const target = newsTarget(n);
    if (target) return router.push(target);
    const id = typeof n.payload.request_id === 'string' ? n.payload.request_id : null;
    if (!id || !data) return;
    if (n.kind === 'requested') {
      const r = data.times.find((t) => t.id === id && t.status === 'pending' && Date.parse(t.starts_at) > Date.now());
      if (r) setOpenTime(r);
    } else if (n.kind === 'training_request') {
      const p = data.people.find((x) => x.id === id && x.status === 'pending');
      if (p) setOpenPerson(p);
    }
  }

  // Only news that leads somewhere can be tapped: a session, a health form, or a request still
  // waiting.
  function canOpen(n: News) {
    if (newsTarget(n)) return true;
    const id = n.payload.request_id;
    if (!data || typeof id !== 'string') return false;
    if (n.kind === 'requested')
      return data.times.some((t) => t.id === id && t.status === 'pending' && Date.parse(t.starts_at) > Date.now());
    if (n.kind === 'training_request') return data.people.some((p) => p.id === id && p.status === 'pending');
    return false;
  }

  const doctor = data ? doctorUpdates(data.items, data.health) : new Set<string>();
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const days: { day: string; at: Date; items: News[] }[] = [];
  for (const item of data?.items ?? []) {
    // Kept with the client's name; never shown for a kind the trainer doesn't get.
    if (item.kind === 'booking_answered' || item.kind === 'training_answered') continue;
    const at = new Date(item.created_at);
    const day = dayKey(at);
    const group = days[days.length - 1];
    if (group?.day === day) group.items.push(item);
    else days.push({ day, at, items: [item] });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Updates', headerTitle: '' }} />
      <ScrollView contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={200}>
        <PageHeader title="Updates" />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {data ? 'Couldn’t refresh your updates.' : 'Your updates couldn’t be loaded.'}
          </Notice>
        ) : null}
        {!data ? (
          showSkeleton && !failed ? (
            <View style={{ gap: Spacing.tight }}>
              <Skeleton width={96} height={12} radius={6} />
              <SkeletonRows count={6} />
            </View>
          ) : null
        ) : days.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No updates yet"
            message="When clients book, cancel, ask for a time or fill in their health form in Voltrix, it shows here."
          />
        ) : (
          <View testID="news-list" style={{ gap: Spacing.section }}>
            {days.map((group) => (
              <Section key={group.day} title={dayTitle(group.day, today, yesterday, group.at)}>
                <Group>
                  {group.items.map((n, i) => (
                    <UpdateRow
                      key={n.id}
                      news={n}
                      first={newsFirst(n, data.names)}
                      fresh={!n.seen_at}
                      doctor={doctor.has(n.id)}
                      onPress={canOpen(n) ? () => open(n) : undefined}
                      last={i === group.items.length - 1}
                      testID={`news-${n.id}`}
                    />
                  ))}
                </Group>
              </Section>
            ))}
            {more ? <SkeletonRows count={2} /> : null}
            {moreFailed ? (
              <Notice tone="danger" action={{ label: 'Try again', onPress: loadMore }}>
                Couldn’t load older updates.
              </Notice>
            ) : null}
            {data.done && data.items.length >= PAGE ? (
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Updates from the last 30 days.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <RequestSheet request={openTime} onClose={() => setOpenTime(null)} onAnswered={load} />
      <PersonSheet request={openPerson} onClose={() => setOpenPerson(null)} onAnswered={load} />
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
    gap: Spacing.section,
  },
}));
