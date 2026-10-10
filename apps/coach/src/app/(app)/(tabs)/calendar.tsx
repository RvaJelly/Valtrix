import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionRow } from '@/components/session-row';
import {
  Button,
  EmptyState,
  Group,
  IconButton,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { longDate, monthYear, weekdayShort } from '@/lib/format';
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
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  // The sessions of one week, kept with the week they belong to.
  const [loaded, setLoaded] = useState<{ week: string; list: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const showSkeleton = useDelayed(300);
  const weekStart = startOfWeek(selected);
  const weekKey = dayKey(weekStart);
  // Another week's sessions never stand in for this one while it loads.
  const sessions = loaded?.week === weekKey ? loaded.list : null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selected), i)), [selected]);
  const today = startOfDay(new Date(now));
  const book = () => router.push({ pathname: '/sessions/new', params: { date: dayKey(selected) } });

  // Keeps Join buttons current while the screen is open.
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(timer);
    }, []),
  );

  // Load the visible week whenever the screen is shown or the week changes.
  useFocusEffect(
    useCallback(() => {
      // A late answer for a week no longer shown must not replace the shown week's sessions.
      let current = true;
      const start = fromDayKey(weekKey);
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', addDays(start, 7).toISOString())
        .order('starts_at')
        .then(({ data, error }) => {
          if (!current) return;
          if (error) return setError(plainError(error));
          setError(null);
          setLoaded({ week: weekKey, list: data as unknown as Session[] });
        });
      return () => {
        current = false;
      };
    }, [weekKey]),
  );

  const dayList = (sessions ?? []).filter((s) => sameDay(new Date(s.starts_at), selected));
  // Every session that still happens or happened counts, the same for the summary and the day dots.
  const counted = (sessions ?? []).filter((s) => s.status !== 'cancelled');
  const done = (sessions ?? []).filter((s) => s.status === 'completed').length;
  const monthLabel = monthYear(selected);
  const isToday = sameDay(selected, today);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          title="Calendar"
          actions={<IconButton variant="tonal" icon="add" label="Book a session" onPress={book} />}
        />

        <View style={{ gap: Spacing.tight }}>
          <View style={styles.monthRow}>
            <IconButton icon="chevron-back" label="Previous week" onPress={() => setSelected(addDays(selected, -7))} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="headline" numberOfLines={1}>
                {monthLabel}
              </Text>
              <Text variant="footnote" tone="secondary" style={Tabular} numberOfLines={1}>
                {sessions
                  ? `${counted.length === 1 ? '1 session' : `${counted.length} sessions`} this week${
                      done ? ` · ${done} done` : ''
                    }`
                  : ' '}
              </Text>
            </View>
            <IconButton icon="chevron-forward" label="Next week" onPress={() => setSelected(addDays(selected, 7))} />
          </View>

          <View style={styles.week} accessibilityRole="tablist">
            {days.map((d) => {
              const on = sameDay(d, selected);
              const dayIsToday = sameDay(d, today);
              const count = counted.filter((s) => sameDay(new Date(s.starts_at), d)).length;
              return (
                <Pressable
                  key={d.toISOString()}
                  accessibilityRole="tab"
                  accessibilityLabel={`${dayIsToday ? 'Today, ' : ''}${longDate(d)}${
                    count ? `, ${count === 1 ? '1 session' : `${count} sessions`}` : ''
                  }`}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    if (!on) haptic.select();
                    setSelected(d);
                  }}
                  style={styles.day}>
                  {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
                    <>
                      <Text variant="label" tone={dayIsToday ? 'primary' : 'secondary'}>
                        {weekdayShort(d)}
                      </Text>
                      <View
                        style={[
                          styles.circle,
                          (pressed || hovered) && !on && { backgroundColor: Colors.tint },
                          on && { backgroundColor: Colors.text },
                        ]}>
                        <Text variant="title" style={[Tabular, { color: on ? Colors.background : Colors.text }]}>
                          {d.getDate()}
                        </Text>
                      </View>
                      {/* Today gets the one orange dot; other days with sessions a quiet one. */}
                      <View
                        style={[
                          styles.dot,
                          {
                            opacity: count || dayIsToday ? 1 : 0,
                            backgroundColor: dayIsToday ? Colors.accent : Colors.textTertiary,
                          },
                        ]}
                      />
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Section
          title={formatDay(selected, today)}
          action={isToday ? undefined : { label: 'Today', onPress: () => setSelected(today) }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {!sessions && !error && showSkeleton ? (
            <Group>
              <SkeletonRows count={3} />
            </Group>
          ) : null}
          {sessions && dayList.length === 0 ? (
            <EmptyState
              compact
              icon="calendar-clear-outline"
              title="Nothing booked"
              message="A free day."
              action={<Button title="Book" variant="ghost" size="small" onPress={book} />}
            />
          ) : null}
          {dayList.length > 0 ? (
            <Group>
              {dayList.map((s, i) => (
                <SessionRow key={s.id} session={s} variant="grouped" last={i === dayList.length - 1} now={now} />
              ))}
            </Group>
          ) : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -Spacing.tight,
  },
  // Seven light columns: the weekday, the date in a circle (filled when chosen) and a dot.
  week: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.one,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.one,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
}));
