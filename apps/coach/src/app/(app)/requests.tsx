import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { HeaderTextButton } from '@/components/header-button';
import { PersonSheet } from '@/components/person-sheet';
import { askedFor, PersonRequestRow, TimeRequestRow } from '@/components/request-rows';
import { RequestSheet, type RequestOpening } from '@/components/request-sheet';
import {
  EmptyState,
  Group,
  ListRow,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  StatusPill,
  useDelayed,
  type StatusTone,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { fullName } from '@/lib/clients';
import { loadRequests, type PersonRequest, type TimeRequest } from '@/lib/requests';

type Lists = { times: TimeRequest[]; people: PersonRequest[] };

// One answered (or lapsed) request, for the Answered list.
type Answered =
  | { kind: 'time'; at: number; request: TimeRequest; status: TimeRequest['status'] }
  | { kind: 'person'; at: number; request: PersonRequest; status: PersonRequest['status'] };

const PILLS: Record<string, { label: string; tone: StatusTone }> = {
  approved: { label: 'Approved', tone: 'success' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'muted' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
  expired: { label: 'Expired', tone: 'muted' },
};

// Everything clients and people have asked the trainer: times asked for and people asking to train
// (both waiting for an answer), then the last 20 answered.
export default function Requests() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openTime, setOpenTime] = useState<{ request: TimeRequest; opening?: RequestOpening } | null>(null);
  const [openPerson, setOpenPerson] = useState<PersonRequest | null>(null);
  const [goneId, setGoneId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const load = useCallback(() => {
    const n = ++loads.current;
    return loadRequests().then(
      (found) => {
        if (n !== loads.current) return;
        setFailed(false);
        setNow(Date.now());
        setLists(found ?? { times: [], people: [] });
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

  // News reloads a second after the last of a burst; a request settled elsewhere leaves at once.
  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(load, 1000);
    return () => clearTimeout(timer);
  }, [load, news]);
  useChatEvents((event) => {
    if (event.type === 'reconnected') setNews((n) => n + 1);
    if (event.type !== 'news') return;
    if (event.kind === 'withdrawn' && event.request_id) {
      const id = event.request_id;
      setGoneId(id);
      setLists((l) =>
        l
          ? {
              times: l.times.map((t) =>
                t.id === id && t.status === 'pending' ? { ...t, status: 'withdrawn' as const } : t,
              ),
              people: l.people.map((p) =>
                p.id === id && p.status === 'pending' ? { ...p, status: 'withdrawn' as const } : p,
              ),
            }
          : l,
      );
    }
    setNews((n) => n + 1);
  });

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function approved(id: string) {
    setLists((l) =>
      l ? { ...l, times: l.times.map((t) => (t.id === id ? { ...t, status: 'approved' as const } : t)) } : l,
    );
    load();
  }

  const times = (lists?.times ?? [])
    .filter((t) => t.status === 'pending' && Date.parse(t.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const people = (lists?.people ?? [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const answered: Answered[] = [
    ...(lists?.times ?? [])
      .filter((t) => !times.includes(t))
      .map((t) => ({
        kind: 'time' as const,
        at: Date.parse(t.answered_at ?? t.created_at),
        request: t,
        // A time that passed while waiting reads as expired.
        status: t.status === 'pending' ? ('expired' as const) : t.status,
      })),
    ...(lists?.people ?? [])
      .filter((p) => p.status !== 'pending')
      .map((p) => ({
        kind: 'person' as const,
        at: Date.parse(p.answered_at ?? p.created_at),
        request: p,
        status: p.status,
      })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);
  const empty = !!lists && !times.length && !people.length && !answered.length;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Requests',
          headerTitle: '',
          headerRight: () => (
            <HeaderTextButton title="Updates" onPress={() => router.push('/news')} testID="requests-updates" />
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />
        }>
        <PageHeader title="Requests" />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {lists ? 'Couldn’t refresh your requests.' : 'Your requests couldn’t be loaded.'}
          </Notice>
        ) : null}
        {!lists ? (
          showSkeleton && !failed ? (
            <SkeletonRows count={4} avatar />
          ) : null
        ) : empty ? (
          <EmptyState
            icon="mail-open-outline"
            title="No requests"
            message="Clients asking for a time and people asking to train with you show here."
          />
        ) : (
          <>
            {times.length ? (
              <View testID="requests-times">
                <Section title="Times asked for">
                  <Group>
                    {times.map((t, i) => (
                      <TimeRequestRow
                        key={t.id}
                        request={t}
                        last={i === times.length - 1}
                        onOpen={(request, opening) => setOpenTime({ request, opening })}
                        onApproved={approved}
                      />
                    ))}
                  </Group>
                </Section>
              </View>
            ) : null}
            {people.length ? (
              <View testID="requests-people">
                <Section title="People asking to train">
                  <Group>
                    {people.map((p, i) => (
                      <PersonRequestRow
                        key={p.id}
                        request={p}
                        now={now}
                        last={i === people.length - 1}
                        onOpen={setOpenPerson}
                      />
                    ))}
                  </Group>
                </Section>
              </View>
            ) : null}
            {answered.length ? (
              <Section title="Answered">
                <Group>
                  {answered.map((a, i) => {
                    const pill = PILLS[a.status] ?? PILLS.expired;
                    const last = i === answered.length - 1;
                    if (a.kind === 'time') {
                      const r = a.request;
                      const name = fullName(r);
                      const session = a.status === 'approved' ? r.session_id : null;
                      return (
                        <ListRow
                          key={r.id}
                          title={name}
                          subtitle={`Asked for ${askedFor(r)}`}
                          subtitleLines={2}
                          leading={<Avatar name={name} size={40} />}
                          status={<StatusPill tone={pill.tone} label={pill.label} />}
                          onPress={
                            session
                              ? () => router.push({ pathname: '/sessions/[id]', params: { id: session } })
                              : undefined
                          }
                          chevron={!!session}
                          last={last}
                        />
                      );
                    }
                    const p = a.request;
                    const name = p.full_name?.trim() || 'Someone';
                    const client = a.status === 'accepted' ? p.client_id : null;
                    return (
                      <ListRow
                        key={p.id}
                        title={name}
                        subtitle="Asked to train with you"
                        leading={<Avatar url={p.avatar_url} name={name} size={40} />}
                        status={<StatusPill tone={pill.tone} label={pill.label} />}
                        onPress={
                          client ? () => router.push({ pathname: '/clients/[id]', params: { id: client } }) : undefined
                        }
                        chevron={!!client}
                        last={last}
                      />
                    );
                  })}
                </Group>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>

      <RequestSheet
        request={openTime?.request ?? null}
        opening={openTime?.opening}
        gone={!!openTime && goneId === openTime.request.id}
        onClose={() => setOpenTime(null)}
        onAnswered={load}
      />
      <PersonSheet
        request={openPerson}
        gone={!!openPerson && goneId === openPerson.id}
        onClose={() => setOpenPerson(null)}
        onAnswered={load}
      />
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
