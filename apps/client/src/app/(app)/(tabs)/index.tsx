import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { InviteCard } from '@/components/invite-card';
import { InviteCodeSheet } from '@/components/invite-code-sheet';
import { canJoin, JoinCall } from '@/components/join-call';
import { SessionRow } from '@/components/session-row';
import { StoriesRow } from '@/components/stories-row';
import { TodayCard } from '@/components/today-card';
import { TrainerCircle } from '@/components/trainer-circle';
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
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { BRAND, Colors, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { longDate, relative, timeRange } from '@/lib/format';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import { refreshReminders } from '@/lib/reminders';
import { serial, type Current } from '@/lib/serial';
import { addDays, endOf, formatDay, loadSessions, trainerName, type Session } from '@/lib/sessions';
import { loadToday, mergeToday, type TodayData } from '@/lib/today';
import {
  listTrainers,
  loadInvites,
  loadTrainers,
  trainerTitle,
  type Invite,
  type PublicTrainer,
  type Trainer,
} from '@/lib/trainers';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type HomeData = {
  // Null when they couldn't be loaded.
  trainers: Trainer[] | null;
  // Trainers waiting for a yes or no.
  invites: Invite[];
  everyone: PublicTrainer[];
  // Booked sessions that hadn't ended when they were loaded; null when they couldn't be loaded.
  sessions: Session[] | null;
  doneThisMonth: number;
  stories: StoryGroup[];
  seen: Set<string>;
};

// Home's loads overlap (focus, coming back to the app, live news), so they run one at a
// time, in order: an older answer can't bring back an invite a newer one removed. A load
// asked to refresh reminders leaves that to the next load that gets the sessions (a newly
// linked trainer may have sessions booked already).
// `now` starts a fresh load straight away when the person asked for it (see serial).
function loadsInOrder(loadOnce: (current: Current) => Promise<boolean>) {
  let wantReminders = false;
  const inOrder = serial(async (current) => {
    if ((await loadOnce(current)) && wantReminders) {
      wantReminders = false;
      refreshReminders();
    }
  });
  return (reminders = true, now = false) => {
    if (reminders) wantReminders = true;
    return inOrder(now);
  };
}

export default function Home() {
  const { session, profile, refreshProfile } = useAuth();
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
  const showSkeleton = useDelayed(300);

  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "I have an invite code": the sheet for a code from a trainer's WhatsApp message.
  const [codeOpen, setCodeOpen] = useState(false);

  // The Today card loads on its own, so the rest of Home never waits for it. A part that
  // fails keeps the last answer for the same day.
  const [today, setToday] = useState<TodayData | null>(null);
  const userId = session?.user.id;
  const loadTodayInOrder = useMemo(
    () =>
      serial(async (current) => {
        if (!userId) return;
        const t = await loadToday(userId).catch(() => null);
        if (t && current()) setToday((old) => mergeToday(old, t));
      }),
    [userId],
  );
  const todayChanged = useCallback(() => loadTodayInOrder(true), [loadTodayInOrder]);

  // Each part loads on its own, so stories and trainers still show when the sessions
  // can't be loaded, and a failed refresh keeps what was already on screen. True when the
  // trainers and sessions loaded and were shown.
  const loadOnce = useCallback(async (current: Current) => {
    const start = new Date();
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const [trainers, invites, sessions, everyone, stories, seen] = await Promise.all([
      loadTrainers().catch(() => null),
      loadInvites().catch(() => null),
      loadSessions(monthStart, addDays(start, 90)).catch(() => null),
      listTrainers().catch(() => null),
      loadStories().catch(() => null),
      loadSeen(),
    ]);
    const failed = 'Could not load everything. Check your internet connection.';
    // Nothing came back: say so, but leave the screen to an older load that may still answer.
    if (!trainers && !invites && !sessions && !everyone && !stories) {
      if (current(false)) setError(failed);
      return false;
    }
    // A newer load has shown its answer already, so this one's is older.
    if (!current()) return false;
    setNow(new Date());
    setError(trainers && sessions ? null : failed);
    setData((old) => ({
      // A trainer who added the client twice shows once.
      trainers:
        trainers?.filter((t, i) => trainers.findIndex((x) => x.trainer_id === t.trainer_id) === i) ??
        old?.trainers ??
        null,
      invites: invites ?? old?.invites ?? [],
      everyone: everyone ?? old?.everyone ?? [],
      sessions: sessions
        ? sessions.filter((s) => s.status === 'scheduled' && endOf(s) > start)
        : (old?.sessions ?? null),
      doneThisMonth: sessions ? sessions.filter((s) => s.status === 'completed').length : (old?.doneThisMonth ?? 0),
      stories: stories ?? old?.stories ?? [],
      seen,
    }));
    return Boolean(trainers && sessions);
  }, []);

  const load = useMemo(() => loadsInOrder(loadOnce), [loadOnce]);
  // An invite was answered here: load now, without waiting for a stuck load.
  const answered = useCallback(() => load(true, true), [load]);

  // A trainer invited this person, or an invite or link changed on another phone. One
  // answer can send several pieces of news at once, so load once they have stopped.
  useChatEvents((event) => {
    if (event.type === 'link') {
      if (linkTimer.current) clearTimeout(linkTimer.current);
      linkTimer.current = setTimeout(() => {
        linkTimer.current = null;
        load();
      }, 250);
    } else if (event.type === 'reconnected') {
      // News sent while the connection was down is missed, and may have changed sessions.
      load();
      loadTodayInOrder();
    } else if (event.type === 'progress') {
      // A trainer replied to a check-in.
      loadTodayInOrder();
    } else if (event.type === 'session') {
      // A trainer booked, moved, cancelled or marked a session: the next session may have changed.
      if (sessionTimer.current) clearTimeout(sessionTimer.current);
      sessionTimer.current = setTimeout(() => {
        sessionTimer.current = null;
        load(false);
      }, 1000);
    } else if (event.type === 'plan') {
      // The plan changed: today's workouts on the Today card may have too.
      if (planTimer.current) clearTimeout(planTimer.current);
      planTimer.current = setTimeout(() => {
        planTimer.current = null;
        loadTodayInOrder();
      }, 1000);
    }
  });
  useEffect(
    () => () => {
      for (const timer of [linkTimer, sessionTimer, planTimer]) {
        if (timer.current) clearTimeout(timer.current);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      loadTodayInOrder();
      // Coming back to the app doesn't refocus Home, so load again then: the next session
      // may have ended and stories may have expired while the phone was locked. The app's
      // layout already refreshes the reminders then.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          load(false);
          loadTodayInOrder();
        }
      });
      const timer = setInterval(() => setNow(new Date()), 60_000);
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [load, loadTodayInOrder]),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(true, true), loadTodayInOrder(true), profile ? null : refreshProfile()]);
    setRefreshing(false);
  }

  async function retry() {
    setRetrying(true);
    await Promise.all([load(true, true), loadTodayInOrder(true)]);
    setRetrying(false);
  }

  // Sessions that ended since they were loaded drop off here.
  const upcoming = data?.sessions?.filter((s) => endOf(s) > now) ?? null;
  const next = upcoming?.[0];
  const later = upcoming?.slice(1, 4) ?? [];
  // A session in the next 24 hours is the most important thing on the screen, so it comes first, above
  // the Today card; one further off sits below it.
  const hasTrainers = !!data?.trainers && data.trainers.length > 0;
  const nextSoon = !!next && hasTrainers && new Date(next.starts_at).getTime() - now.getTime() < 86_400_000;
  // The trainers loaded but the sessions didn't: the Next session card says so instead.
  const sessionsMissing = !!data?.trainers && !upcoming;

  const waiting = !!data?.trainers && data.trainers.length === 0 && !data.invites.length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />
        }>
        <View style={{ gap: Spacing.gutter }}>
          {/* Settings moved off the tab bar, so it lives behind the gear at the top of Home. */}
          <PageHeader
            brand
            eyebrow={longDate(now)}
            title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
            actions={<IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />}
          />
          {data ? (
            <StoriesRow
              groups={data.stories}
              seen={data.seen}
              me={{ name: profile?.full_name ?? null, avatar: profile?.avatar_url ?? null }}
            />
          ) : null}
        </View>

        {/* A web page can't be pulled down to refresh, so there's always a button. */}
        {error && !sessionsMissing ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {error}
          </Notice>
        ) : null}
        {data && !profile ? <Notice>Your account details could not be loaded. Pull down to try again.</Notice> : null}
        {!data && !error && showSkeleton ? (
          <View style={{ gap: Spacing.tight }}>
            <Skeleton height={200} radius={Radius.large} />
            <SkeletonRows count={3} />
          </View>
        ) : null}

        {data?.invites.map((invite) => (
          <InviteCard key={invite.client_id} invite={invite} onAnswered={answered} />
        ))}

        {waiting && isTrainer ? (
          <Card style={styles.connect}>
            <Text variant="label" tone="secondary">
              Trainer account
            </Text>
            <Text variant="headline">You&apos;re in with your trainer account</Text>
            <Text variant="callout" tone="secondary">
              Post stories and reels, and see Voltrix the way your clients do. Your clients and calendar stay in Voltrix
              Coach.
            </Text>
            <Text variant="callout" tone="secondary">
              Training with someone yourself? When a trainer adds you as a client with {session?.user.email}, their
              invite shows up here for you to accept.
            </Text>
            <EnterCode onPress={() => setCodeOpen(true)} />
            <Button title="Check again" icon="refresh" variant="secondary" onPress={refresh} loading={refreshing} />
          </Card>
        ) : null}

        {waiting && isClient ? (
          <Card style={styles.connect}>
            <Text variant="label" tone="secondary">
              Get started
            </Text>
            <Text variant="headline">Connect with your trainer</Text>
            <Text variant="callout" tone="secondary">
              Your trainer can send you an invite code on WhatsApp, or add you in Voltrix Coach with this email. Their
              invite shows up here.
            </Text>
            <EmailRow email={session?.user.email ?? ''} />
            <EnterCode onPress={() => setCodeOpen(true)} />
            <Button title="Check again" icon="refresh" variant="secondary" onPress={refresh} loading={refreshing} />
          </Card>
        ) : null}

        {nextSoon && next ? (
          <EnterUp>
            <NextSession session={next} now={now} />
          </EnterUp>
        ) : null}

        {today && userId ? (
          <TodayCard today={today} userId={userId} hasTrainers={hasTrainers} onChanged={todayChanged} />
        ) : null}

        {data?.trainers && hasTrainers ? (
          <>
            {!upcoming ? (
              <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
                Your sessions could not be loaded.
              </Notice>
            ) : next ? (
              nextSoon ? null : (
                <EnterUp>
                  <NextSession session={next} now={now} />
                </EnterUp>
              )
            ) : (
              <EmptyState
                compact
                icon="calendar-clear-outline"
                title="No session booked"
                message="Your trainer books your sessions."
              />
            )}

            {later.length ? (
              <Section
                title="Coming up"
                action={{
                  label: 'See all',
                  onPress: () => router.navigate({ pathname: '/plan', params: { view: 'sessions' } }),
                }}>
                <Group>
                  {later.map((s, i) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      showDay
                      showTrainer={data.trainers!.length > 1}
                      variant="grouped"
                      last={i === later.length - 1}
                    />
                  ))}
                </Group>
              </Section>
            ) : null}

            {!upcoming || data.doneThisMonth > 0 || upcoming.length > 0 ? (
              <StatStrip
                items={[
                  { value: upcoming ? data.doneThisMonth : null, label: 'Done this month' },
                  { value: upcoming ? upcoming.length : null, label: 'Booked ahead' },
                ]}
              />
            ) : null}

            <Section title={data.trainers.length === 1 ? 'Your trainer' : 'Your trainers'}>
              <Group>
                {data.trainers.map((t, i) => (
                  <ListRow
                    key={t.client_id}
                    title={trainerTitle(t)}
                    subtitle={t.trainer_name && t.business_name ? t.business_name : undefined}
                    leading={<Avatar url={t.trainer_avatar} name={trainerTitle(t)} size={44} />}
                    status={t.client_status === 'paused' ? <StatusPill tone="neutral" label="Paused" /> : null}
                    trailing={
                      <IconButton
                        variant="tonal"
                        icon="chatbubble-outline"
                        label={`Message ${t.trainer_name || t.business_name || 'your trainer'}`}
                        onPress={() =>
                          router.push({
                            pathname: '/chat/[id]',
                            params: { id: t.client_id, name: trainerTitle(t), avatar: t.trainer_avatar ?? '' },
                          })
                        }
                      />
                    }
                    chevron={false}
                    onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: t.trainer_id } })}
                    last={i === data.trainers!.length - 1}
                  />
                ))}
              </Group>
            </Section>

            {/* Their trainer's face is already above, so other trainers are one row away. */}
            <Group>
              <ListRow
                title="Explore trainers on Voltrix"
                leading={<IconTile icon="compass-outline" />}
                onPress={() => router.push('/trainers')}
                last
              />
            </Group>
          </>
        ) : null}

        {data && !hasTrainers && data.everyone.length ? (
          <Section title="Trainers on Voltrix" action={{ label: 'See all', onPress: () => router.push('/trainers') }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.carousel}>
              {data.everyone.slice(0, 12).map((t) => (
                <TrainerCircle key={t.id} trainer={t} width={88} />
              ))}
            </ScrollView>
          </Section>
        ) : null}
      </ScrollView>
      <InviteCodeSheet visible={codeOpen} onClose={() => setCodeOpen(false)} onJoined={answered} />
    </SafeAreaView>
  );
}

// For someone a trainer reached on WhatsApp. Secondary, like Check again under it: Home's one
// orange button is elsewhere. The words match the WhatsApp message, which says to tap them.
function EnterCode({ onPress }: { onPress: () => void }) {
  return (
    <Button
      title="I have an invite code"
      icon="key-outline"
      variant="secondary"
      onPress={onPress}
      testID="home-enter-code"
    />
  );
}

// The next session as the one high-contrast object on the page: on the light theme an Iron Black
// card with white type (on dark themes the raised surface), when first and big, then with whom and
// where. Join, the screen's one orange button, sits under it as its own button while the call is on.
function NextSession({ session, now }: { session: Session; now: Date }) {
  // The big time steps down a size at large text, so "07:00–08:00" stays whole on one line.
  const large = useWindowDimensions().fontScale > 1.15;
  const start = new Date(session.starts_at);
  const end = endOf(session);
  // One phrase: "in 25 min" when it is close, otherwise the day.
  const soon = start.getTime() - now.getTime() < 2 * 3_600_000;
  const when = soon ? relative(start, now) : formatDay(start, now);
  const name = trainerName(session);
  const place = session.online ? 'Video call' : session.location;
  const iron = Colors.scheme === 'light';
  const ink = iron ? BRAND.white : Colors.text;
  const quiet = iron ? 'rgba(255,255,255,0.64)' : Colors.textSecondary;
  return (
    <Card
      hero
      style={{ backgroundColor: iron ? BRAND.iron : Colors.surfaceHigh }}
      pressedFill={iron ? 'rgba(255,255,255,0.08)' : undefined}
      onPress={() => router.navigate({ pathname: '/plan', params: { view: 'sessions' } })}
      accessibilityLabel={`Next session, ${when}, ${timeRange(start, end)} with ${name}${place ? `, ${place}` : ''}`}
      accessibilityHint="Opens your sessions"
      footer={canJoin(session, now.getTime()) ? <JoinCall session={session} /> : null}>
      <View style={styles.heroTop}>
        <Text variant="label" style={{ flex: 1, color: quiet }}>
          Next session
        </Text>
        <Ionicons name="chevron-forward" size={16} color={quiet} />
      </View>
      <Text variant="headline" style={{ color: ink, marginTop: Spacing.tight }}>
        {when}
      </Text>
      <Text
        variant="display"
        // Chakra Petch's figures reach past a 46 line, so the line is taller than the type scale's.
        style={[Tabular, { color: ink, marginTop: Spacing.one, lineHeight: 52 }, large && styles.heroTimeLarge]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}>
        {timeRange(start, end)}
      </Text>
      <View style={[styles.heroMeta, { marginTop: Spacing.three }]}>
        <Avatar url={session.trainer_avatar} name={name} size={32} />
        <Text variant="callout" numberOfLines={1} style={{ flex: 1, color: quiet }}>
          {name}
        </Text>
      </View>
      {place ? (
        <View style={[styles.heroMeta, { marginTop: Spacing.two }]}>
          <Ionicons
            name={session.online ? 'videocam-outline' : 'location-outline'}
            size={16}
            color={quiet}
            style={{ width: 32, textAlign: 'center' }}
          />
          <Text variant="callout" numberOfLines={2} style={{ flex: 1, color: quiet }}>
            {place}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

// The client's email with a Copy button, so they can send it to their trainer.
function EmailRow({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <View style={styles.email}>
      <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
      <Text variant="rowTitle" numberOfLines={2} style={{ flex: 1 }} selectable>
        {email}
      </Text>
      <Button
        title={copied ? 'Copied' : 'Copy'}
        icon={copied ? 'checkmark' : 'copy-outline'}
        variant="ghost"
        size="small"
        accessibilityLabel={copied ? 'Email copied' : 'Copy your email'}
        onPress={() => {
          Clipboard.setStringAsync(email)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
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
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  connect: {
    gap: Spacing.tight,
  },
  email: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 52,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroTimeLarge: {
    fontSize: 32,
    lineHeight: 40,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  // The carousel runs to the screen's edges while its first trainer lines up with the page.
  bleed: {
    marginHorizontal: -Spacing.gutter,
  },
  // Half of the fourth trainer shows at 390, so the row reads as one to scroll.
  carousel: {
    gap: Spacing.gutter,
    paddingHorizontal: Spacing.gutter,
  },
}));
