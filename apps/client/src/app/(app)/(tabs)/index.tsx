import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SessionRow } from '@/components/session-row';
import { StoriesRow } from '@/components/stories-row';
import { TrainerCircle } from '@/components/trainer-circle';
import { Body, Button, Card, ErrorText, Title } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { loadSeen, loadStories, type StoryGroup } from '@/lib/posts';
import { refreshReminders } from '@/lib/reminders';
import { addDays, endOf, formatDay, formatTime, loadSessions, trainerName, type Session } from '@/lib/sessions';
import { listTrainers, loadTrainers, type PublicTrainer, type Trainer } from '@/lib/trainers';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// "in 3 days", "in 2 hours", "now"
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
  trainers: Trainer[];
  everyone: PublicTrainer[];
  sessions: Session[];
  doneThisMonth: number;
  stories: StoryGroup[];
  seen: Set<string>;
};

export default function Home() {
  const { session, profile } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const firstName = profile?.full_name?.split(' ')[0];

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [trainers, sessions, everyone, stories, seen] = await Promise.all([
        loadTrainers(),
        loadSessions(monthStart, addDays(now, 90)),
        listTrainers().catch(() => [] as PublicTrainer[]),
        loadStories().catch(() => [] as StoryGroup[]),
        loadSeen(),
      ]);
      setError(null);
      setData({
        trainers,
        everyone,
        sessions: sessions.filter((s) => s.status === 'scheduled' && endOf(s) > now),
        doneThisMonth: sessions.filter((s) => s.status === 'completed').length,
        stories,
        seen,
      });
      // A newly linked trainer may have sessions booked already.
      refreshReminders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your sessions.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const next = data?.sessions[0];
  const later = data?.sessions.slice(1, 4) ?? [];

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

      <ErrorText>{error}</ErrorText>
      {!data && !error ? <ActivityIndicator color={Colors.accentText} /> : null}

      {data && data.trainers.length === 0 ? (
        <Card style={{ gap: Spacing.three }}>
          <View style={styles.waitIcon}>
            <Ionicons name="link" size={26} color={Colors.accentText} />
          </View>
          <Text style={styles.cardTitle}>Connect to your trainer</Text>
          <Body secondary>Ask your personal trainer to add you as a client in Valtrix Coach with this email:</Body>
          <Text style={styles.email}>{session?.user.email}</Text>
          <Body secondary>Then tap the button below. Your sessions will show up here.</Body>
          <Button title="Check again" onPress={refresh} loading={refreshing} />
        </Card>
      ) : null}

      {data && data.trainers.length > 0 ? (
        <>
          <View style={{ gap: Spacing.three }}>
            <Text style={styles.section}>Next session</Text>
            {next ? (
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
                {next.location ? (
                  <View style={styles.nextMeta}>
                    <Ionicons name="location" size={16} color={Colors.onAccent} />
                    <Text style={styles.nextMetaText}>{next.location}</Text>
                  </View>
                ) : null}
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
                <Pressable onPress={() => router.navigate('/sessions')} hitSlop={8}>
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
              <Text style={styles.statNumber}>{data.doneThisMonth}</Text>
              <Body secondary style={{ fontSize: 14 }}>
                Sessions done this month
              </Body>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{data.sessions.length}</Text>
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
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {data && data.everyone.length ? (
        <View style={{ gap: Spacing.three }}>
          <View style={styles.header}>
            <Text style={[styles.section, { flex: 1 }]}>Trainers on Valtrix</Text>
            <Pressable onPress={() => router.navigate('/trainers')} hitSlop={8}>
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
}));
