import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
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
  Group,
  IconButton,
  IconTile,
  ListRow,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  StatStrip,
  Text,
  useDelayed,
  type IconName,
} from '@/components/ui';
import { enterUp } from '@/constants/motion';
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { useChat } from '@/lib/chat-live';
import { appStatusOf, fullName, type Client } from '@/lib/clients';
import { dayMonth, longDate, relative, timeRange } from '@/lib/format';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import { addDays, dayKey, endOf, SESSION_COLUMNS, sessionName, startOfDay, type Session } from '@/lib/sessions';
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
  recent: Pick<Client, 'id' | 'first_name' | 'last_name' | 'goal' | 'user_id' | 'app_status'>[];
  today: Session[];
};

const SHORTCUTS: { icon: IconName; label: string; href: Href }[] = [
  { icon: 'person-add-outline', label: 'New client', href: '/clients/new' },
  { icon: 'calendar-outline', label: 'New session', href: '/sessions/new' },
  { icon: 'barbell-outline', label: 'New workout', href: '/workouts/new' },
  { icon: 'library-outline', label: 'Exercises', href: '/exercises' },
];

export default function Home() {
  const { profile } = useAuth();
  const { chats } = useChat();
  const [stats, setStats] = useState<Stats | null>(null);
  const [stories, setStories] = useState<{ groups: StoryGroup[]; seen: Set<string> } | null>(null);
  // The time the screen was last drawn for, moved on every minute so a session that has
  // ended leaves "Up next".
  const [now, setNow] = useState(() => new Date());
  const showSkeleton = useDelayed(300);
  const firstName = profile?.full_name?.split(' ')[0];
  const access = coachAccess(profile);

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), 60_000);
      // RLS limits every query to the signed-in trainer's own rows.
      Promise.all([
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
          .gte('starts_at', startOfDay(new Date()).toISOString())
          .lt('starts_at', addDays(startOfDay(new Date()), 1).toISOString())
          .order('starts_at'),
      ]).then(([active, workouts, recent, today]) =>
        setStats({
          activeClients: active.count ?? 0,
          workouts: workouts.count ?? 0,
          recent: (recent.data as Stats['recent']) ?? [],
          today: (today.data as unknown as Session[]) ?? [],
        }),
      );
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
    }, []),
  );

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
      subtitle: 'Add a photo and specialties for the client app',
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
            actions={
              <>
                <IconButton icon="play-circle-outline" label="Reels" onPress={() => router.navigate('/reels')} />
                <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
              </>
            }
          />
          {/* Shown straight away so Home doesn't jump when the stories arrive. */}
          <StoriesRow
            groups={stories?.groups ?? []}
            seen={stories?.seen ?? NONE_SEEN}
            me={{ name: profile?.full_name ?? profile?.business_name ?? null, avatar: profile?.avatar_url ?? null }}
          />
        </View>

        <Section title="Today" action={{ label: 'Calendar', onPress: () => router.navigate('/calendar') }}>
          {!stats ? (
            showSkeleton ? (
              <View style={{ gap: Spacing.tight }}>
                <Skeleton height={168} radius={24} />
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
                <Animated.View entering={enterUp(0)}>
                  <UpNext
                    session={next}
                    now={now}
                    avatar={chats.find((c) => c.chat_id === next.client_id)?.other_avatar}
                  />
                </Animated.View>
              ) : null}
              {rest.length ? (
                <Animated.View entering={enterUp(1)}>
                  <Group>
                    {rest.map((s, i) => (
                      <SessionRow key={s.id} session={s} variant="grouped" last={i === rest.length - 1} />
                    ))}
                  </Group>
                </Animated.View>
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
                { value: stats.activeClients, label: 'Clients', onPress: () => router.navigate('/clients') },
                { value: stats.workouts, label: 'Workouts', onPress: () => router.navigate('/programs') },
                { value: stats.today.length, label: 'Today', onPress: () => router.navigate('/calendar') },
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
                    trailing={status !== 'joined' ? <AppStatusLabel status={status} short /> : null}
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

// The next session today as a hero card: who, when, where, and Join while the call is on.
function UpNext({ session, now, avatar }: { session: Session; now: Date; avatar?: string | null }) {
  const start = new Date(session.starts_at);
  const end = endOf(session);
  const live = start <= now && now < end;
  const name = sessionName(session);
  const place = session.online ? 'Video call' : session.location;
  const open = () => router.push({ pathname: '/sessions/[id]', params: { id: session.id } });
  return (
    <Card
      hero
      onPress={open}
      accessibilityLabel={`${live ? 'Now' : 'Up next'}: ${name}, ${timeRange(start, end)}${place ? `, ${place}` : ''}`}>
      <View style={styles.heroTop}>
        {live ? (
          <>
            <View style={styles.liveDot} />
            <Text variant="label" style={{ color: Colors.accentText, flex: 1 }}>
              Now
            </Text>
          </>
        ) : (
          <>
            <Text variant="label" tone="secondary" style={{ flex: 1 }}>
              Up next
            </Text>
            <Text variant="footnote" tone="secondary">
              {relative(start, now)}
            </Text>
          </>
        )}
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
          <Text variant="callout" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {place}
          </Text>
        </View>
      ) : null}
      <View style={{ marginTop: Spacing.gutter }}>
        {canJoin(session, now.getTime()) ? (
          <JoinCall session={session} name={name} avatar={avatar} onApp={!!session.clients?.user_id} />
        ) : (
          <Button title="View session" variant="secondary" size="medium" onPress={open} />
        )}
      </View>
    </Card>
  );
}

function Shortcut({ icon, label, href }: { icon: IconName; label: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(href)}
      style={[styles.shortcut, Platform.OS === 'web' && { cursor: 'pointer' }]}>
      {({ pressed }) => (
        <>
          <View style={[styles.shortcutCircle, pressed && { backgroundColor: Colors.tintPressed }]}>
            <Ionicons name={icon} size={22} color={Colors.text} />
          </View>
          <Text variant="footnote" numberOfLines={1} style={styles.shortcutLabel}>
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
    marginHorizontal: -Spacing.two, // a little more room for the four labels
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
