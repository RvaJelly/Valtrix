import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppStatusLabel } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { canJoin, JoinCall } from '@/components/join-call';
import { SessionRow } from '@/components/session-row';
import { StoriesRow } from '@/components/stories-row';
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
import { useChat } from '@/lib/chat-live';
import { appStatusOf, fullName, type Client } from '@/lib/clients';
import { dayMonth, longDate, relative, timeRange } from '@/lib/format';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import {
  addDays,
  dayKey,
  endOf,
  SESSION_COLUMNS,
  sessionName,
  startOfDay,
  startOfWeek,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

const NONE_SEEN = new Set<string>();

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Stats = {
  activeClients: number;
  workouts: number;
  // Booked (not cancelled) sessions from Monday to Sunday.
  thisWeek: number;
  recent: Pick<Client, 'id' | 'first_name' | 'last_name' | 'goal' | 'user_id' | 'app_status'>[];
  today: Session[];
};

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
  const [stats, setStats] = useState<Stats | null>(null);
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
  const firstName = profile?.full_name?.split(' ')[0];
  const access = coachAccess(profile);

  // RLS limits every query to the signed-in trainer's own rows. Every answer is checked: a failed
  // load says so and keeps what was shown, and never passes for a new trainer with no clients.
  const loadStats = useCallback(async () => {
    const id = ++loads.current;
    const today = startOfDay(new Date());
    const week = startOfWeek(today);
    const answers = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('workouts').select('id', { count: 'exact', head: true }),
      supabase
        .from('clients')
        .select('id, first_name, last_name, goal, user_id, app_status')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(3),
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
    ]).catch(() => null);
    if (id !== loads.current) return;
    const [active, workouts, recent, todays, thisWeek] = answers ?? [];
    if (!active || !workouts || !recent || !todays || !thisWeek || answers!.some((a) => a.error)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setStats({
      activeClients: active.count ?? 0,
      workouts: workouts.count ?? 0,
      thisWeek: thisWeek.count ?? 0,
      recent: (recent.data as Stats['recent']) ?? [],
      today: (todays.data as unknown as Session[]) ?? [],
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
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
        }
      });
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [loadStats]),
  );

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

  const account: { key: string; title: string; subtitle: string; icon: IconName; color?: string; href: Href }[] = [];
  if (profileMissing && !newTrainer) {
    account.push({
      key: 'profile',
      title: 'Finish your profile',
      subtitle: 'Photo and specialties for your clients',
      icon: 'person-circle-outline',
      href: '/settings',
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

        <Section title="Today" action={{ label: 'Calendar', onPress: () => router.navigate('/calendar') }}>
          {failed ? (
            <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
              {stats ? 'Could not refresh your day.' : 'Your day could not be loaded.'}
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
            <EmptyState
              compact
              icon="calendar-clear-outline"
              title="Nothing booked today"
              message="Today's sessions show here."
              action={
                <Button
                  title="Book"
                  variant="ghost"
                  size="small"
                  onPress={() => router.push({ pathname: '/sessions/new', params: { date: dayKey(new Date()) } })}
                />
              }
            />
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
              {rest.length ? (
                <EnterUp index={1}>
                  <Group>
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
                <Step title="Finish your profile" done={!profileMissing} href="/settings" />
                <Step title="Book a session" done={stats.today.length > 0} href="/sessions/new" last />
              </Group>
            </Section>
          ) : (
            <StatStrip
              items={[
                { value: stats.activeClients, label: 'Active clients', onPress: () => router.navigate('/clients') },
                { value: stats.workouts, label: 'Workouts', onPress: () => router.navigate('/programs') },
                {
                  value: stats.thisWeek,
                  label: 'This week',
                  spoken: `${stats.thisWeek} ${stats.thisWeek === 1 ? 'session' : 'sessions'} this week`,
                  onPress: () => router.navigate('/calendar'),
                },
              ]}
            />
          )
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
                  last={i === account.length - 1}
                />
              ))}
            </Group>
          </Section>
        ) : null}

        {stats && stats.recent.length > 0 ? (
          <Section title="Recent clients" action={{ label: 'See all', onPress: () => router.navigate('/clients') }}>
            <Group>
              {stats.recent.map((c, i) => {
                const status = appStatusOf(c);
                return (
                  <ListRow
                    key={c.id}
                    title={fullName(c)}
                    subtitle={
                      <Text variant="footnote" tone={c.goal ? 'secondary' : 'tertiary'} numberOfLines={1}>
                        {c.goal || 'No goal yet'}
                      </Text>
                    }
                    leading={<Avatar name={fullName(c)} size={40} />}
                    status={status !== 'joined' ? <AppStatusLabel status={status} short /> : null}
                    onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id } })}
                    last={i === stats.recent.length - 1}
                  />
                );
              })}
            </Group>
          </Section>
        ) : null}
      </ScrollView>
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
