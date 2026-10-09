import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { JoinCall } from '@/components/join-call';
import { SessionRow } from '@/components/session-row';
import { StoriesRow } from '@/components/stories-row';
import { TrainerCircle } from '@/components/trainer-circle';
import { Body, Button, Card, ErrorText, Title } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import { refreshReminders } from '@/lib/reminders';
import {
  addDays,
  endOf,
  formatDay,
  formatTime,
  loadSessions,
  ONLINE_LABEL,
  trainerName,
  type Session,
} from '@/lib/sessions';
import { listTrainers, loadTrainers, type PublicTrainer, type Trainer } from '@/lib/trainers';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// "in 3 days", "in 2 hours", "now" (for a session that has started and not ended yet)
function fromNow(date: Date, now = new Date()) {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

type HomeData = {
  // Null when they couldn't be loaded.
  trainers: Trainer[] | null;
  everyone: PublicTrainer[];
  // Booked sessions that hadn't ended when they were loaded; null when they couldn't be loaded.
  sessions: Session[] | null;
  doneThisMonth: number;
  stories: StoryGroup[];
  seen: Set<string>;
};

export default function Home() {
  const { session, profile, refreshProfile } = useAuth();
  const navigation = useNavigation();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The time the screen was last drawn for, moved on every minute so a session that
  // has ended leaves "Next session".
  const [now, setNow] = useState(() => new Date());
  const firstName = profile?.full_name?.split(' ')[0];
  const isTrainer = profile?.role === 'trainer';
  const isClient = profile?.role === 'client';

  // Settings moved off the tab bar, so it lives behind the gear in Home's header.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          onPress={() => router.push('/settings')}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="settings-outline" size={26} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [navigation]);

  // Each part loads on its own, so stories and trainers still show when the sessions
  // can't be loaded, and a failed refresh keeps what was already on screen.
  const load = useCallback(async (reminders = true) => {
    const start = new Date();
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const [trainers, sessions, everyone, stories, seen] = await Promise.all([
      loadTrainers().catch(() => null),
      loadSessions(monthStart, addDays(start, 90)).catch(() => null),
      listTrainers().catch(() => null),
      loadStories().catch(() => null),
      loadSeen(),
    ]);
    setNow(new Date());
    setError(trainers && sessions ? null : 'Could not load everything. Check your internet connection.');
    setData((old) => ({
      trainers: trainers ?? old?.trainers ?? null,
      everyone: everyone ?? old?.everyone ?? [],
      sessions: sessions
        ? sessions.filter((s) => s.status === 'scheduled' && endOf(s) > start)
        : (old?.sessions ?? null),
      doneThisMonth: sessions ? sessions.filter((s) => s.status === 'completed').length : (old?.doneThisMonth ?? 0),
      stories: stories ?? old?.stories ?? [],
      seen,
    }));
    // A newly linked trainer may have sessions booked already.
    if (reminders && trainers && sessions) refreshReminders();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Coming back to the app doesn't refocus Home, so load again then: the next session
      // may have ended and stories may have expired while the phone was locked. The app's
      // layout already refreshes the reminders then.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') load(false);
      });
      const timer = setInterval(() => setNow(new Date()), 60_000);
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(), profile ? null : refreshProfile()]);
    setRefreshing(false);
  }

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  // Sessions that ended since they were loaded drop off here.
  const upcoming = data?.sessions?.filter((s) => endOf(s) > now) ?? null;
  const next = upcoming?.[0];
  const later = upcoming?.slice(1, 4) ?? [];
  // The trainers loaded but the sessions didn't: the Next session card says so instead.
  const sessionsMissing = !!data?.trainers && !upcoming;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      <Title>
        {greeting()}
        {firstName ? `, ${firstName}` : ''}
      </Title>

      {data ? (
        <StoriesRow
          groups={data.stories}
          seen={data.seen}
          me={{ name: profile?.full_name ?? null, avatar: profile?.avatar_url ?? null }}
        />
      ) : null}

      {/* A web page can't be pulled down to refresh, so there's always a button. */}
      {error && !sessionsMissing ? (
        <View style={{ gap: Spacing.two }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={retry} loading={retrying} />
        </View>
      ) : null}
      {data && !profile ? (
        <Card>
          <Body secondary>Your account details could not be loaded. Pull down to try again.</Body>
        </Card>
      ) : null}
      {!data && !error ? <ActivityIndicator color={Colors.accentText} /> : null}

      {data?.trainers && data.trainers.length === 0 && isTrainer ? (
        <Card style={{ gap: Spacing.three }}>
          <View style={styles.waitIcon}>
            <Ionicons name="barbell" size={26} color={Colors.accentText} />
          </View>
          <Text style={styles.cardTitle}>You&apos;re in with your trainer account</Text>
          <Body secondary>
            Post stories and reels, and see Voltrix the way your clients do. Your clients and calendar stay in Voltrix
            Coach.
          </Body>
          <Body secondary>
            Training with someone yourself? When a trainer adds you as a client with {session?.user.email}, your
            sessions show up here.
          </Body>
          <Button title="Check again" variant="secondary" onPress={refresh} loading={refreshing} />
        </Card>
      ) : null}

      {data?.trainers && data.trainers.length === 0 && isClient ? (
        <Card style={{ gap: Spacing.three }}>
          <View style={styles.waitIcon}>
            <Ionicons name="link" size={26} color={Colors.accentText} />
          </View>
          <Text style={styles.cardTitle}>Connect to your trainer</Text>
          <Body secondary>Ask your personal trainer to add you as a client in Voltrix Coach with this email:</Body>
          <Text style={styles.email}>{session?.user.email}</Text>
          <Body secondary>Then tap the button below. Your sessions will show up here.</Body>
          <Button title="Check again" onPress={refresh} loading={refreshing} />
        </Card>
      ) : null}

      {data?.trainers && data.trainers.length > 0 ? (
        <>
          <View style={{ gap: Spacing.three }}>
            <Text style={styles.section}>Next session</Text>
            {!upcoming ? (
              <Card style={{ gap: Spacing.three }}>
                <Body secondary>Your sessions could not be loaded. Check your internet connection.</Body>
                <Button title="Try again" variant="secondary" onPress={retry} loading={retrying} />
              </Card>
            ) : next ? (
              <View style={styles.next}>
                <Text style={styles.nextWhen}>{fromNow(new Date(next.starts_at))}</Text>
                <Text style={styles.nextDay}>{formatDay(new Date(next.starts_at))}</Text>
                <Text style={styles.nextTime}>
                  {formatTime(new Date(next.starts_at))} – {formatTime(endOf(next))}
                </Text>
                <View style={styles.nextMeta}>
                  <Ionicons name="person" size={16} color={Colors.onAccent} />
                  <Text style={styles.nextMetaText}>{trainerName(next)}</Text>
                </View>
                {next.online ? (
                  <View style={styles.nextMeta}>
                    <Ionicons name="videocam" size={16} color={Colors.onAccent} />
                    <Text style={styles.nextMetaText}>{ONLINE_LABEL}</Text>
                  </View>
                ) : null}
                {next.location ? (
                  <View style={styles.nextMeta}>
                    <Ionicons name="location" size={16} color={Colors.onAccent} />
                    <Text style={styles.nextMetaText}>{next.location}</Text>
                  </View>
                ) : null}
                <JoinCall session={next} onAccent style={{ marginTop: Spacing.two }} />
              </View>
            ) : (
              <Card>
                <Body secondary>No sessions booked yet. Your trainer will book them for you.</Body>
              </Card>
            )}
          </View>

          {later.length ? (
            <View style={{ gap: Spacing.two }}>
              <View style={styles.header}>
                <Text style={[styles.section, { flex: 1 }]}>Coming up</Text>
                <Pressable
                  onPress={() => router.navigate({ pathname: '/plan', params: { view: 'sessions' } })}
                  hitSlop={8}>
                  <Text style={styles.link}>See all</Text>
                </Pressable>
              </View>
              {later.map((s) => (
                <SessionRow key={s.id} session={s} showDay />
              ))}
            </View>
          ) : null}

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{upcoming ? data.doneThisMonth : '–'}</Text>
              <Body secondary style={{ fontSize: 14 }}>
                Sessions done this month
              </Body>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{upcoming ? upcoming.length : '–'}</Text>
              <Body secondary style={{ fontSize: 14 }}>
                Booked ahead
              </Body>
            </View>
          </View>

          <View style={{ gap: Spacing.two }}>
            <Text style={styles.section}>{data.trainers.length === 1 ? 'Your trainer' : 'Your trainers'}</Text>
            {data.trainers.map((t) => (
              <Pressable
                key={t.client_id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: t.trainer_id } })}
                style={({ pressed }) => [styles.trainer, pressed && { backgroundColor: Colors.surfaceRaised }]}>
                <Avatar
                  url={data.everyone.find((e) => e.id === t.trainer_id)?.avatar_url}
                  name={t.trainer_name ?? t.business_name}
                  size={48}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trainerName}>{t.trainer_name || t.business_name || 'Your trainer'}</Text>
                  {t.trainer_name && t.business_name ? (
                    <Body secondary style={{ fontSize: 14 }}>
                      {t.business_name}
                    </Body>
                  ) : null}
                </View>
                {t.client_status === 'paused' ? <Text style={styles.paused}>Paused</Text> : null}
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[id]',
                      params: { id: t.client_id, name: t.trainer_name || t.business_name || 'Your trainer' },
                    })
                  }
                  hitSlop={8}
                  style={styles.chatButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${t.trainer_name || t.business_name || 'your trainer'}`}>
                  <Ionicons name="chatbubble-ellipses" size={20} color={Colors.onAccent} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {data && data.everyone.length ? (
        <View style={{ gap: Spacing.three }}>
          <View style={styles.header}>
            <Text style={[styles.section, { flex: 1 }]}>Trainers on Voltrix</Text>
            <Pressable onPress={() => router.push('/trainers')} hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.three }}>
            {data.everyone.slice(0, 12).map((t) => (
              <TrainerCircle key={t.id} trainer={t} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  link: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  waitIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  email: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  next: {
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
  },
  nextWhen: {
    color: Colors.onAccent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  nextDay: {
    color: Colors.onAccent,
    fontSize: 28,
    fontWeight: '900',
  },
  nextTime: {
    color: Colors.onAccent,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  nextMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nextMetaText: {
    color: Colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  statNumber: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  trainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  trainerName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  paused: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
}));
