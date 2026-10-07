import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SessionRow } from '@/components/session-row';
import { Body, Button, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import {
  addDays,
  dayKey,
  formatDay,
  fromDayKey,
  SESSION_COLUMNS,
  sameDay,
  startOfDay,
  startOfWeek,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function CalendarScreen() {
  const navigation = useNavigation();
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const weekStart = startOfWeek(selected);
  const weekKey = dayKey(weekStart);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selected), i)), [selected]);
  const today = startOfDay(new Date());

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="Book a session"
          hitSlop={12}
          onPress={() => router.push({ pathname: '/sessions/new', params: { date: dayKey(selected) } })}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="add-circle" size={28} color={Colors.accent} />
        </Pressable>
      ),
    });
  }, [navigation, selected]);

  // Load the visible week whenever the screen is shown or the week changes.
  useFocusEffect(
    useCallback(() => {
      const start = fromDayKey(weekKey);
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', addDays(start, 7).toISOString())
        .order('starts_at')
        .then(({ data, error }) => {
          if (error) return setError(error.message);
          setError(null);
          setSessions(data as unknown as Session[]);
        });
    }, [weekKey]),
  );

  const dayList = (sessions ?? []).filter((s) => sameDay(new Date(s.starts_at), selected));
  const booked = (sessions ?? []).filter((s) => s.status === 'scheduled' || s.status === 'completed');
  const done = (sessions ?? []).filter((s) => s.status === 'completed').length;
  const monthLabel = selected.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.monthRow}>
        <Pressable accessibilityLabel="Previous week" hitSlop={8} onPress={() => setSelected(addDays(selected, -7))} style={styles.arrow}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.month}>{monthLabel}</Text>
        <Pressable accessibilityLabel="Next week" hitSlop={8} onPress={() => setSelected(addDays(selected, 7))} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {days.map((d) => {
          const isSelected = sameDay(d, selected);
          const isToday = sameDay(d, today);
          const count = (sessions ?? []).filter((s) => s.status === 'scheduled' && sameDay(new Date(s.starts_at), d)).length;
          return (
            <Pressable
              key={d.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(d)}
              style={[styles.day, isSelected && { backgroundColor: Colors.accent }]}>
              <Text style={[styles.weekday, isSelected && { color: Colors.onAccent }]}>
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
              <Text
                style={[
                  styles.date,
                  isToday && !isSelected && { color: Colors.accent },
                  isSelected && { color: Colors.onAccent },
                ]}>
                {d.getDate()}
              </Text>
              <View style={[styles.dot, { opacity: count ? 1 : 0 }, isSelected && { backgroundColor: Colors.onAccent }]} />
            </Pressable>
          );
        })}
      </View>

      {sessions ? (
        <Body secondary style={{ fontSize: 14, textAlign: 'center' }}>
          {booked.length === 1 ? '1 session' : `${booked.length} sessions`} this week
          {done ? ` · ${done} done` : ''}
        </Body>
      ) : null}

      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{formatDay(selected)}</Text>
        {!sameDay(selected, today) ? (
          <Pressable onPress={() => setSelected(today)} hitSlop={8}>
            <Text style={styles.link}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      <ErrorText>{error}</ErrorText>
      {!sessions && !error ? <ActivityIndicator color={Colors.accent} /> : null}
      {sessions && dayList.length === 0 ? (
        <View style={styles.empty}>
          <Body secondary style={{ textAlign: 'center' }}>
            Nothing booked {sameDay(selected, today) ? 'today' : 'on this day'}.
          </Body>
          <Button
            title="Book a session"
            onPress={() => router.push({ pathname: '/sessions/new', params: { date: dayKey(selected) } })}
          />
        </View>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {dayList.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  month: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  week: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  weekday: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  dayTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  link: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
}));
