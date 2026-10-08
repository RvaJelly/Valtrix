import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { SessionRow } from '@/components/session-row';
import { Body, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { addDays, dayKey, endOf, formatDay, loadSessions, type Session } from '@/lib/sessions';

type View_ = 'upcoming' | 'past';

// How far ahead and back the lists reach.
const DAYS = 180;

export default function Sessions() {
  const [view, setView] = useState<View_>('upcoming');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      setSessions(await loadSessions(addDays(now, -DAYS), addDays(now, DAYS)));
      setError(null);
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

  const now = new Date();
  const shown = (sessions ?? []).filter((s) =>
    view === 'upcoming' ? s.status === 'scheduled' && endOf(s) > now : endOf(s) <= now || s.status !== 'scheduled',
  );
  if (view === 'past') shown.reverse();

  // Group by day, keeping the order.
  const days: { key: string; date: Date; items: Session[] }[] = [];
  for (const s of shown) {
    const date = new Date(s.starts_at);
    const key = dayKey(date);
    if (days.at(-1)?.key !== key) days.push({ key, date, items: [] });
    days.at(-1)!.items.push(s);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      <View style={styles.segmented}>
        {(['upcoming', 'past'] as const).map((key) => {
          const selected = key === view;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setView(key)}
              style={[styles.segment, selected && { backgroundColor: Colors.accent }]}>
              <Text style={[styles.segmentText, selected && { color: Colors.onAccent }]}>
                {key === 'upcoming' ? 'Upcoming' : 'Past'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ErrorText>{error}</ErrorText>
      {!sessions && !error ? <ActivityIndicator color={Colors.accentText} /> : null}
      {sessions && days.length === 0 ? (
        <Card>
          <Body secondary>
            {view === 'upcoming'
              ? 'Nothing booked yet. Sessions your trainer books will show here.'
              : 'Your finished sessions will show here.'}
          </Body>
        </Card>
      ) : null}

      {days.map((d) => (
        <View key={d.key} style={{ gap: Spacing.two }}>
          <Text style={styles.day}>{formatDay(d.date)}</Text>
          {d.items.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  segmented: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
  segmentText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  day: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
}));
