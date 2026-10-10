import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InviteSheet, type InviteClient } from '@/components/invite-sheet';
import { canJoin, JoinCall } from '@/components/join-call';
import { MarkPaidSheet } from '@/components/mark-paid-sheet';
import { NeedsYouRow } from '@/components/needs-you-row';
import { PersonSheet } from '@/components/person-sheet';
import { PersonRequestRow, TimeRequestRow } from '@/components/request-rows';
import { RequestSheet, type RequestOpening } from '@/components/request-sheet';
import { SellPackSheet } from '@/components/sell-pack-sheet';
import { SessionRow } from '@/components/session-row';
import { StoriesRow } from '@/components/stories-row';
import { useToast } from '@/components/toast';
import { ToMarkSheet } from '@/components/to-mark-sheet';
import { doctorUpdates, newsFirst, newsTarget, newsWhen, UpdateRow } from '@/components/update-row';
import {
  Button,
  Card,
  EmptyState,
  EnterUp,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  StatStrip,
  Text,
  useDelayed,
  type IconName,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { earnedFrom, loadMoneyTotals, loadTotals, totalsIn, type MoneyTotals, type Totals } from '@/lib/earnings';
import { dayMonth, longDate, relative, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, spokenMoney } from '@/lib/money';
import { NEEDS_EMPTY, needsYou, type Need } from '@/lib/needs-you';
import { loadNews, markAllSeen, markSeen, pruneOldNews, type News, type NewsKind } from '@/lib/news';
import { loadOverview, type ClientOverview } from '@/lib/overview';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import { topUpRepeats } from '@/lib/repeats';
import { loadRequests, type PersonRequest, type TimeRequest } from '@/lib/requests';
import {
  addDays,
  dayKey,
  endOf,
  SESSION_COLUMNS,
  namesOf,
  sessionName,
  startOfDay,
  startOfWeek,
  toMark,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { libraryOnly } from '@/lib/workouts';

const NONE_SEEN = new Set<string>();

// The updates Home shows; asking for a time and asking to train wait in Requests instead.
const UPDATE_KINDS: NewsKind[] = ['booked', 'cancelled', 'health'];
// News that also shows a toast while Home is open.
const TOAST_KINDS: string[] = ['booked', 'requested', 'cancelled', 'training_request'];
const NEWS_COLUMNS = 'id, kind, client_id, payload, created_at, seen_at';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Stats = {
  activeClients: number;
  // Library workouts ("Your workouts").
  workouts: number;
  // Booked (not cancelled) sessions from Monday to Sunday.
  thisWeek: number;
  today: Session[];
  // Booked sessions from the last 30 days that have started (the ones that ended are to mark).
  started: Session[];
  // Every client from clients_overview, or null on an older database.
  overview: ClientOverview[] | null;
  // This week's sessions by status, or null on an older database.
  totals: Totals[] | null;
  // This week's money (round 3), or null on an older database.
  money: MoneyTotals[] | null;
};

type Requests = { times: TimeRequest[]; people: PersonRequest[] };

// One word each, so the five labels never run into each other; screen readers hear the full name.
const SHORTCUTS: { icon: IconName; label: string; name: string; href: Href }[] = [
  { icon: 'person-add-outline', label: 'Client', name: 'New client', href: '/clients/new' },
  { icon: 'calendar-clear-outline', label: 'Session', name: 'Book a session', href: '/sessions/new' },
  { icon: 'barbell-outline', label: 'Workout', name: 'New workout', href: '/workouts/new' },
  { icon: 'list-outline', label: 'Library', name: 'Exercise library', href: '/exercises' },
  { icon: 'play-circle-outline', label: 'Reels', name: 'Reels', href: '/reels' },
];

export default function Home() {
  const { profile } = useAuth();
  const { chats } = useChat();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  // Requests waiting for an answer; null until loaded, or when they couldn't be (the section hides).
  const [requests, setRequests] = useState<Requests | null>(null);
  // Unseen updates (booked, cancelled, health form); null until loaded.
  const [updates, setUpdates] = useState<News[] | null>(null);
  const [openTime, setOpenTime] = useState<{ request: TimeRequest; opening?: RequestOpening } | null>(null);
  const [openPerson, setOpenPerson] = useState<PersonRequest | null>(null);
  // A request settled elsewhere while its sheet was open.
  const [goneId, setGoneId] = useState<string | null>(null);
  const [paying, setPaying] = useState<Need | null>(null);
  const [selling, setSelling] = useState<Need | null>(null);
  // Toasts for news only while Home is the screen showing.
  const focused = useRef(false);
  // Counts news (and repeats topped up) so Home reloads a second after the last of a burst.
  const [news, setNews] = useState(0);
  // The day's numbers could not be loaded; what was on screen stays.
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Only the newest load may show its answer.
  const loads = useRef(0);
  const [stories, setStories] = useState<{ groups: StoryGroup[]; seen: Set<string> } | null>(null);
  // The time the screen was last drawn for, moved on every minute so a session that has
  // ended leaves "Up next".
  const [now, setNow] = useState(() => new Date());
  const showSkeleton = useDelayed(300);
  const [markOpen, setMarkOpen] = useState(false);
  const [inviting, setInviting] = useState<InviteClient | null>(null);
  const firstName = profile?.full_name?.split(' ')[0];
  const access = coachAccess(profile);

  // RLS limits every query to the signed-in trainer's own rows. Every answer is checked: a failed
  // load says so and keeps what was shown, and never passes for a new trainer with no clients.
  const loadStats = useCallback(async () => {
    const id = ++loads.current;
    const at = new Date();
    const today = startOfDay(at);
    const week = startOfWeek(today);
    // Repeats are topped up to 12 weeks ahead now and then; new sessions today reload the day.
    topUpRepeats().then((made) => {
      if (made > 0) setNews((n) => n + 1);
    });
    const answers = await Promise.all([
      loadOverview(dayKey(at)),
      // Round 3's money_totals, else round 2's session totals on an older database.
      loadMoneyTotals(week, addDays(week, 7))
        .catch(() => null)
        .then(async (money) => ({ money, totals: money ? null : await loadTotals(week, addDays(week, 7)) })),
      libraryOnly(supabase.from('workouts').select('id', { count: 'exact', head: true })),
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .neq('status', 'cancelled')
        .gte('starts_at', today.toISOString())
        .lt('starts_at', addDays(today, 1).toISOString())
        .order('starts_at'),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'cancelled')
        .gte('starts_at', week.toISOString())
        .lt('starts_at', addDays(week, 7).toISOString()),
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('status', 'scheduled')
        .gte('starts_at', addDays(at, -30).toISOString())
        .lt('starts_at', at.toISOString())
        .order('starts_at')
        .limit(50),
      // Each of these hides only its own section when it fails.
      loadRequests().catch(() => null),
      loadNews({ kinds: UPDATE_KINDS, unseen: true, limit: 100 }).catch(() => undefined),
    ]).catch(() => null);
    if (id !== loads.current) return;
    if (!answers) return setFailed(true);
    const [overview, sums, workouts, todays, thisWeek, started, waiting, unseen] = answers;
    setRequests(waiting);
    if (unseen) setUpdates(unseen);
    if (workouts.error || todays.error || thisWeek.error || started.error) return setFailed(true);
    // An older database: the active clients are counted the old way.
    let activeClients = overview?.filter((c) => c.status === 'active').length ?? 0;
    if (!overview) {
      const active = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active');
      if (id !== loads.current) return;
      if (active.error) return setFailed(true);
      activeClients = active.count ?? 0;
    }
    setFailed(false);
    setStats({
      activeClients,
      workouts: workouts.count ?? 0,
      thisWeek: thisWeek.count ?? 0,
      today: (todays.data as unknown as Session[]) ?? [],
      started: (started.data as unknown as Session[]) ?? [],
      overview,
      totals: sums.totals,
      money: sums.money,
    });
  }, []);

  // News from clients (a check-in, a workout, a booking, an invite answered) reloads Home a second
  // after the last of a burst.
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(loadStats, 1000);
    return () => clearTimeout(timer);
  }, [news, loadStats]);
  // A toast for news from a client while Home is open: "Cara booked Mon 12 Oct at 07:00".
  async function toastNews(id: string) {
    const { data } = await supabase.from('news').select(NEWS_COLUMNS).eq('id', id).maybeSingle();
    if (!data) return;
    const n = { ...(data as News), payload: (data as News).payload ?? {} };
    const first = newsFirst(n, new Map((stats?.overview ?? []).map((c) => [c.client_id, c.first_name])));
    const when = newsWhen(n, ' at ');
    if (n.kind === 'booked') toast(`${first} booked ${when}`);
    else if (n.kind === 'requested') toast(`${first} asks for ${when}`);
    else if (n.kind === 'cancelled') toast(`${first} cancelled ${when}`);
    else if (n.kind === 'training_request') toast(`${first} asks to train with you`);
  }

  useChatEvents((event) => {
    if (event.type === 'progress' || event.type === 'link' || event.type === 'reconnected') setNews((n) => n + 1);
    if (event.type === 'news') {
      setNews((n) => n + 1);
      if (event.kind === 'withdrawn' && event.request_id) setGoneId(event.request_id);
      if (focused.current && event.id && TOAST_KINDS.includes(event.kind)) toastNews(event.id);
    }
  });

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      pruneOldNews();
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), 60_000);
      loadStats();
      // Stories from clients and trainers. If they can't load, "Your story" still shows.
      const refreshStories = () =>
        Promise.all([loadStories().catch(() => [] as StoryGroup[]), loadSeen()]).then(([groups, seen]) =>
          setStories({ groups, seen }),
        );
      refreshStories();
      // Coming back to the app doesn't refocus Home, so check again then: stories
      // that ended while the phone was locked disappear, and new ones show up.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refreshStories();
          setNow(new Date());
          loadStats();
        }
      });
      return () => {
        focused.current = false;
        sub.remove();
        clearInterval(timer);
      };
    }, [loadStats]),
  );

  function invite(need: Need) {
    const c = need.client;
    setInviting({
      id: c.client_id,
      first_name: c.first_name,
      email: c.email,
      phone: c.phone,
      app_status: c.app_status,
    });
  }

  async function retry() {
    setRetrying(true);
    await loadStats();
    setRetrying(false);
  }

  // The first booked session today that hasn't ended leads; the rest of the day sits under it.
  const next = stats?.today.find((s) => s.status === 'scheduled' && endOf(s) > now);
  const rest = stats?.today.filter((s) => s !== next) ?? [];
  const profileMissing = !!profile && (!profile.avatar_url || !profile.specialties?.length);
  const newTrainer = !!stats && stats.activeClients === 0;
  const marking = (stats?.started ?? []).filter((s) => toMark(s, now.getTime()));
  const currency = profile?.currency ?? 'ZAR';
  const needs = stats?.overview
    ? needsYou(stats.overview, dayKey(now), now.getTime(), 5, (cents) => formatMoney(cents, currency))
    : null;
  const money = stats?.money ? totalsIn(stats.money, currency) : null;
  const earned = money
    ? { cents: money.earned_cents, priced: money.earned_cents > 0 || money.ahead_cents > 0 }
    : stats?.totals
      ? earnedFrom(stats.totals, currency)
      : null;
  const names = new Map((stats?.overview ?? []).map((c) => [c.client_id, c.first_name]));

  // Requests: times asked for first (soonest first, only those still ahead), then people asking to
  // train (oldest first); four at most here.
  const waitingTimes = (requests?.times ?? [])
    .filter((t) => t.status === 'pending' && Date.parse(t.starts_at) > now.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const waitingPeople = (requests?.people ?? [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const shownTimes = waitingTimes.slice(0, 4);
  const shownPeople = waitingPeople.slice(0, 4 - shownTimes.length);
  const moreRequests = waitingTimes.length + waitingPeople.length > 4;
  const shownUpdates = (updates ?? []).slice(0, 3);
  const moreUpdates = (updates?.length ?? 0) - shownUpdates.length;
  const doctor = doctorUpdates(updates ?? [], new Map((stats?.overview ?? []).map((c) => [c.client_id, c.health])));

  function approved(id: string) {
    setRequests((r) => (r ? { ...r, times: r.times.filter((t) => t.id !== id) } : r));
    loadStats();
  }

  function openUpdate(n: News) {
    setUpdates((list) => (list ? list.filter((u) => u.id !== n.id) : list));
    markSeen([n.id]).catch(() => {});
    const target = newsTarget(n);
    if (target) router.push(target);
  }

  async function clearUpdates() {
    const before = updates;
    setUpdates([]);
    haptic.select();
    try {
      await markAllSeen(UPDATE_KINDS);
    } catch {
      setUpdates(before);
      toast('Couldn’t clear the updates. Try again.');
    }
  }

  // What else is on at a requested time, when it's today.
  const clashName = (r: TimeRequest | undefined) => {
    if (!r?.clashes || !stats) return null;
    const start = Date.parse(r.starts_at);
    const end = start + r.duration_minutes * 60_000;
    const other = stats.today.find(
      (s) => s.status !== 'cancelled' && Date.parse(s.starts_at) < end && endOf(s).getTime() > start,
    );
    return other ? sessionName(other) : null;
  };
  // Earned shows once the trainer has a usual price or a session this week has one.
  const showEarned = !!earned && (profile?.session_price_cents != null || earned.priced);

  const account: {
    key: string;
    title: string;
    subtitle: string;
    icon: IconName;
    color?: string;
    href: Href;
    testID?: string;
  }[] = [];
  if (profile && profile.session_price_cents == null && !newTrainer) {
    account.push({
      key: 'price',
      title: 'Set your session price',
      subtitle: 'See what you earn each week',
      icon: 'cash-outline',
      href: '/settings/prices',
      testID: 'account-set-price',
    });
  }
  if (profileMissing && !newTrainer) {
    account.push({
      key: 'profile',
      title: 'Finish your profile',
      subtitle: 'Photo and specialties for your clients',
      icon: 'person-circle-outline',
      href: '/settings/profile',
    });
  }
  if (access.kind === 'trial') {
    account.push({
      key: 'trial',
      title: access.daysLeft === 1 ? 'Last day of your free trial' : `${access.daysLeft} days left in your free trial`,
      subtitle: `Then ${PRICE_LABEL} a month from ${dayMonth(access.endsAt)}`,
      icon: 'time-outline',
      color: access.daysLeft <= 3 ? Colors.warning : undefined,
      href: '/settings',
    });
  }
  if (profile?.is_admin) {
    account.push({
      key: 'admin',
      title: 'All trainers',
      subtitle: 'See every trainer and give free access',
      icon: 'shield-checkmark-outline',
      href: '/admin',
    });
  }

  // The To mark row is the last of its group only when no session follows it.
  const markRow = (last: boolean) =>
    marking.length ? (
      <ListRow
        title={marking.length === 1 ? '1 session to mark' : `${marking.length} sessions to mark`}
        subtitle={namesOf(marking)}
        leading={<IconTile icon="checkmark-done-outline" />}
        onPress={() => setMarkOpen(true)}
        testID="home-to-mark"
        last={last}
      />
    ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.gutter }}>
          <PageHeader
            brand
            eyebrow={longDate(now)}
            title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
            actions={<IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />}
          />
          {/* Shown straight away so Home doesn't jump when the stories arrive. */}
          <StoriesRow
            groups={stories?.groups ?? []}
            seen={stories?.seen ?? NONE_SEEN}
            me={{ name: profile?.full_name ?? profile?.business_name ?? null, avatar: profile?.avatar_url ?? null }}
          />
        </View>

        {shownTimes.length || shownPeople.length ? (
          <EnterUp>
            <View testID="home-requests">
              <Section
                title="Requests"
                action={
                  moreRequests
                    ? {
                        label: 'See all',
                        onPress: () => router.push('/requests'),
                        accessibilityLabel: `See all ${waitingTimes.length + waitingPeople.length} requests`,
                      }
                    : undefined
                }>
                <Group>
                  {shownTimes.map((r, i) => (
                    <TimeRequestRow
                      key={r.id}
                      request={r}
                      last={!shownPeople.length && i === shownTimes.length - 1}
                      onOpen={(request, opening) => setOpenTime({ request, opening })}
                      onApproved={approved}
                    />
                  ))}
                  {shownPeople.map((p, i) => (
                    <PersonRequestRow
                      key={p.id}
                      request={p}
                      now={now.getTime()}
                      last={i === shownPeople.length - 1}
                      onOpen={setOpenPerson}
                    />
                  ))}
                </Group>
              </Section>
            </View>
          </EnterUp>
        ) : null}

        <Section title="Today" action={{ label: 'Calendar', onPress: () => router.navigate('/calendar') }}>
          {failed ? (
            <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
              {stats ? 'Couldn’t refresh your day.' : 'Your day couldn’t be loaded.'}
            </Notice>
          ) : null}
          {!stats ? (
            showSkeleton && !failed ? (
              <View style={{ gap: Spacing.tight }}>
                <Skeleton height={168} radius={Radius.large} />
                <SkeletonRows count={2} />
              </View>
            ) : null
          ) : stats.today.length === 0 ? (
            <View style={{ gap: Spacing.tight }}>
              <EmptyState
                compact
                icon="calendar-clear-outline"
                title="Nothing booked today"
                message="Today’s sessions show here."
                action={
                  <Button
                    title="Book"
                    variant="ghost"
                    size="small"
                    onPress={() => router.push({ pathname: '/sessions/new', params: { date: dayKey(new Date()) } })}
                  />
                }
              />
              {marking.length ? <Group>{markRow(true)}</Group> : null}
            </View>
          ) : (
            <View style={{ gap: Spacing.tight }}>
              {next ? (
                <EnterUp>
                  <UpNext
                    session={next}
                    now={now}
                    avatar={chats.find((c) => c.chat_id === next.client_id)?.other_avatar}
                  />
                </EnterUp>
              ) : null}
              {rest.length || marking.length ? (
                <EnterUp index={1}>
                  <Group>
                    {markRow(!rest.length)}
                    {rest.map((s, i) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        variant="grouped"
                        now={now.getTime()}
                        last={i === rest.length - 1}
                      />
                    ))}
                  </Group>
                </EnterUp>
              ) : null}
            </View>
          )}
        </Section>

        {shownUpdates.length ? (
          <EnterUp>
            <View testID="home-updates">
              <Section
                title="Updates"
                action={{
                  label: 'Clear',
                  onPress: clearUpdates,
                  accessibilityLabel: 'Clear the updates',
                  testID: 'home-updates-clear',
                  chevron: false,
                }}>
                <Group>
                  {shownUpdates.map((n, i) => (
                    <UpdateRow
                      key={n.id}
                      news={n}
                      first={newsFirst(n, names)}
                      doctor={doctor.has(n.id)}
                      onPress={newsTarget(n) ? () => openUpdate(n) : undefined}
                      last={moreUpdates <= 0 && i === shownUpdates.length - 1}
                      testID={`home-update-${n.id}`}
                    />
                  ))}
                  {moreUpdates > 0 ? (
                    <ListRow
                      title={moreUpdates === 1 ? '1 more update' : `${moreUpdates} more updates`}
                      leading={<IconTile icon="notifications-outline" />}
                      onPress={() => router.push('/news')}
                      testID="home-more-updates"
                      compact
                      last
                    />
                  ) : null}
                </Group>
              </Section>
            </View>
          </EnterUp>
        ) : null}

        {!stats && showSkeleton && !failed ? (
          <View style={{ gap: Spacing.tight }} accessible accessibilityLabel="Loading">
            <Skeleton width={96} height={12} radius={6} />
            <SkeletonRows count={3} avatar />
          </View>
        ) : null}
        {needs && stats && !newTrainer ? (
          <View testID="home-needs-you">
            <Section
              title="Needs you"
              action={
                needs.more
                  ? {
                      label: 'See all',
                      onPress: () => router.push('/needs-you'),
                      accessibilityLabel: `See all ${needs.total} clients who need you`,
                    }
                  : undefined
              }>
              {needs.rows.length ? (
                <Group>
                  {needs.rows.map((need, i) => (
                    <NeedsYouRow
                      key={need.client.client_id}
                      need={need}
                      last={i === needs.rows.length - 1}
                      onInvite={invite}
                      onSell={setSelling}
                      onPaid={setPaying}
                    />
                  ))}
                </Group>
              ) : (
                <EmptyState compact icon="checkmark-done-outline" title="Everyone’s on track" message={NEEDS_EMPTY} />
              )}
            </Section>
          </View>
        ) : null}

        <View style={styles.shortcuts}>
          {SHORTCUTS.map((s) => (
            <Shortcut key={s.label} {...s} />
          ))}
        </View>

        {stats ? (
          newTrainer ? (
            <Section title="Get started">
              <Group>
                <Step title="Add your first client" done={false} href="/clients/new" />
                <Step title="Build a workout" done={stats.workouts > 0} href="/workouts/new" />
                <Step title="Finish your profile" done={!profileMissing} href="/settings/profile" />
                <Step
                  title="Set your session price"
                  done={profile?.session_price_cents != null}
                  href="/settings/prices"
                />
                <Step title="Book a session" done={stats.today.length > 0} href="/sessions/new" last />
              </Group>
            </Section>
          ) : (
            <StatStrip
              items={[
                {
                  value: stats.activeClients,
                  label: 'Active clients',
                  onPress: () => router.navigate('/clients'),
                  testID: 'stat-active',
                },
                {
                  value: stats.thisWeek,
                  label: 'This week',
                  spoken: `${stats.thisWeek} ${stats.thisWeek === 1 ? 'session' : 'sessions'} this week`,
                  onPress: () => router.navigate('/calendar'),
                  testID: 'stat-week',
                },
                showEarned && earned
                  ? {
                      value: formatMoney(earned.cents, currency),
                      label: 'Earned this week',
                      spoken: `${spokenMoney(earned.cents, currency)} earned this week`,
                      onPress: () => router.push('/earnings'),
                      testID: 'stat-earned',
                    }
                  : {
                      value: stats.workouts,
                      label: 'Workouts',
                      onPress: () => router.navigate('/programs'),
                      testID: 'stat-workouts',
                    },
              ]}
            />
          )
        ) : !failed && showSkeleton ? (
          <Skeleton height={64} radius={Radius.medium} />
        ) : null}

        {account.length ? (
          <Section title="Account">
            <Group>
              {account.map((a, i) => (
                <ListRow
                  key={a.key}
                  title={a.title}
                  subtitle={a.subtitle}
                  leading={<IconTile icon={a.icon} color={a.color} />}
                  onPress={() => router.push(a.href)}
                  testID={a.testID}
                  last={i === account.length - 1}
                />
              ))}
            </Group>
          </Section>
        ) : null}
      </ScrollView>

      <ToMarkSheet visible={markOpen} sessions={marking} onClose={() => setMarkOpen(false)} onChanged={loadStats} />
      <InviteSheet client={inviting} onClose={() => setInviting(null)} onShared={loadStats} onConnected={loadStats} />
      <RequestSheet
        request={openTime?.request ?? null}
        opening={openTime?.opening}
        gone={!!openTime && goneId === openTime.request.id}
        clashName={clashName(openTime?.request)}
        onClose={() => setOpenTime(null)}
        onAnswered={loadStats}
      />
      <PersonSheet
        request={openPerson}
        gone={!!openPerson && goneId === openPerson.id}
        onClose={() => setOpenPerson(null)}
        onAnswered={loadStats}
      />
      <MarkPaidSheet
        clientId={paying?.client.client_id ?? null}
        first={paying?.client.first_name ?? ''}
        onClose={() => setPaying(null)}
        onDone={loadStats}
      />
      <SellPackSheet
        clientId={selling?.client.client_id ?? null}
        first={selling?.client.first_name ?? ''}
        clientPriceCents={selling?.client.session_price_cents ?? null}
        onClose={() => setSelling(null)}
        onSold={loadStats}
      />
    </SafeAreaView>
  );
}

// The next session today as a hero card: who, when, where, and Join while the call is on. The card
// opens the session; Join is its own button under it, not inside the card's.
function UpNext({ session, now, avatar }: { session: Session; now: Date; avatar?: string | null }) {
  const start = new Date(session.starts_at);
  const end = endOf(session);
  const live = start <= now && now < end;
  // Only a start within two hours is worth saying; the time is printed right below.
  const soon = !live && start.getTime() - now.getTime() < 2 * 3_600_000;
  const name = sessionName(session);
  const place = session.online ? 'Video call' : session.location;
  const joinable = canJoin(session, now.getTime());
  return (
    <Card
      hero
      onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: session.id } })}
      accessibilityLabel={`${live ? 'Now' : 'Up next'}: ${name}, ${timeRange(start, end)}${place ? `, ${place}` : ''}`}
      accessibilityHint="Opens the session"
      footer={
        joinable ? <JoinCall session={session} name={name} avatar={avatar} onApp={!!session.clients?.user_id} /> : null
      }>
      <View style={styles.heroTop}>
        {live ? <View style={styles.liveDot} /> : null}
        <Text
          variant="label"
          tone={live ? undefined : 'secondary'}
          style={[{ flex: 1 }, live && { color: Colors.accentText }]}>
          {live ? 'Now' : 'Up next'}
        </Text>
        {soon ? (
          <Text variant="footnote" tone="secondary">
            {relative(start, now)}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
      <Text variant="title" numberOfLines={2} style={{ marginTop: Spacing.two }}>
        {name}
      </Text>
      <Text variant="headline" style={[Tabular, { marginTop: Spacing.one }]}>
        {timeRange(start, end)}
      </Text>
      {place ? (
        <View style={styles.heroMeta}>
          <Ionicons
            name={session.online ? 'videocam-outline' : 'location-outline'}
            size={16}
            color={Colors.textSecondary}
          />
          <Text variant="callout" tone="secondary" numberOfLines={2} style={{ flex: 1 }}>
            {place}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function Shortcut({ icon, label, name, href }: { icon: IconName; label: string; name: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push(href)}
      style={[styles.shortcut, Platform.OS === 'web' && { cursor: 'pointer' }]}>
      {({ pressed }) => (
        <>
          <View style={[styles.shortcutCircle, pressed && { backgroundColor: Colors.tintPressed }]}>
            <Ionicons name={icon} size={22} color={Colors.text} />
          </View>
          <Text variant="footnote" numberOfLines={2} style={styles.shortcutLabel}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// One step of the new-trainer checklist.
function Step({ title, done, href, last }: { title: string; done: boolean; href: Href; last?: boolean }) {
  return (
    <ListRow
      title={title}
      titleTone={done ? 'secondary' : 'primary'}
      leading={
        <Ionicons
          name={done ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={done ? Colors.success : Colors.textTertiary}
        />
      }
      compact
      onPress={() => router.push(href)}
      accessibilityLabel={`${title}${done ? ', done' : ''}`}
      last={last}
    />
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
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.one,
  },
  shortcuts: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.two, // a little more room for the five labels
  },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  shortcutCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  shortcutLabel: {
    fontFamily: Fonts.textMedium,
    textAlign: 'center',
  },
}));
