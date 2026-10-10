import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequestSheet } from '@/components/request-sheet';
import { SessionRow } from '@/components/session-row';
import { ToMarkSheet } from '@/components/to-mark-sheet';
import {
  Button,
  EmptyState,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { longDate, monthYear, time24, timeRange, weekdayShort } from '@/lib/format';
import { refreshReminders } from '@/lib/reminders';
import { topUpRepeats } from '@/lib/repeats';
import { loadRequests, type TimeRequest } from '@/lib/requests';
import {
  addDays,
  dayKey,
  formatDay,
  fromDayKey,
  endOf,
  namesOf,
  overlaps,
  SESSION_COLUMNS,
  sessionName,
  sameDay,
  startOfDay,
  startOfWeek,
  toMark,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function CalendarScreen() {
  // `date` opens a day ('YYYY-MM-DD'), as after booking every week.
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [selected, setSelected] = useState(() => (date ? fromDayKey(date) : startOfDay(new Date())));
  const [openedDate, setOpenedDate] = useState(date);
  if (date !== openedDate) {
    setOpenedDate(date);
    if (date) setSelected(fromDayKey(date));
  }
  // Times clients asked for that are still waiting, and the one open in the request sheet.
  const [asked, setAsked] = useState<TimeRequest[]>([]);
  const [request, setRequest] = useState<TimeRequest | null>(null);
  const [goneId, setGoneId] = useState<string | null>(null);
  // The sessions of one week, kept with the week they belong to.
  const [loaded, setLoaded] = useState<{ week: string; list: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [marking, setMarking] = useState(false);
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

  // Only the newest load may show its answer: a late answer for a week no longer shown must not
  // replace the shown week's sessions.
  const loads = useRef(0);
  const loadWeek = useCallback(() => {
    const id = ++loads.current;
    const start = fromDayKey(weekKey);
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .gte('starts_at', start.toISOString())
      .lt('starts_at', addDays(start, 7).toISOString())
      .order('starts_at')
      .then(({ data, error }) => {
        if (id !== loads.current) return;
        if (error) return setError(plainError(error));
        setError(null);
        setLoaded({ week: weekKey, list: data as unknown as Session[] });
      });
    // A failed read of the requests only leaves them out.
    loadRequests()
      .then((found) => {
        if (id === loads.current) setAsked((found?.times ?? []).filter((t) => t.status === 'pending'));
      })
      .catch(() => {});
  }, [weekKey]);

  // New bookings, cancellations and requests from clients show without leaving the screen.
  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(loadWeek, 1000);
    return () => clearTimeout(timer);
  }, [news, loadWeek]);
  useChatEvents((event) => {
    if (event.type === 'news') {
      if (event.kind === 'withdrawn' && event.request_id) setGoneId(event.request_id);
      if (event.kind === 'booked' || event.kind === 'cancelled') refreshReminders();
      setNews((n) => n + 1);
    } else if (event.type === 'reconnected') setNews((n) => n + 1);
  });

  // Load the visible week whenever the screen is shown or the week changes.
  useFocusEffect(
    useCallback(() => {
      loadWeek();
      // Repeats are made 12 weeks ahead; topping them up may add to the shown week.
      topUpRepeats().then((made) => {
        if (made > 0) loadWeek();
      });
      return () => {
        loads.current++;
      };
    }, [loadWeek]),
  );

  const dayList = (sessions ?? []).filter((s) => sameDay(new Date(s.starts_at), selected));
  // The day's sessions and the times asked for, in time order. Asked times never count in the stats.
  const dayAsked = sessions
    ? asked.filter((t) => sameDay(new Date(t.starts_at), selected) && new Date(t.starts_at).getTime() > now)
    : [];
  const dayItems: ({ kind: 'session'; session: Session } | { kind: 'asked'; request: TimeRequest })[] = [
    ...dayList.map((session) => ({ kind: 'session' as const, session })),
    ...dayAsked.map((request) => ({ kind: 'asked' as const, request })),
  ].sort((a, b) =>
    (a.kind === 'session' ? a.session.starts_at : a.request.starts_at) <
    (b.kind === 'session' ? b.session.starts_at : b.request.starts_at)
      ? -1
      : 1,
  );
  // What else is on at the open request's time, for the sheet's words.
  const clashWith = request
    ? (sessions ?? []).find(
        (s) =>
          s.status !== 'cancelled' &&
          overlaps(s, { starts_at: request.starts_at, duration_minutes: request.duration_minutes }),
      )
    : null;
  // Every session that still happens or happened counts, the same for the summary and the day dots.
  const counted = (sessions ?? []).filter((s) => s.status !== 'cancelled');
  const done = (sessions ?? []).filter((s) => s.status === 'completed').length;
  const noShows = (sessions ?? []).filter((s) => s.status === 'no_show').length;
  // This week's sessions that have ended and are still Booked.
  const unmarked = (sessions ?? []).filter((s) => toMark(s, now));
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
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {sessions
                  ? [
                      counted.length === 1 ? '1 session' : `${counted.length} sessions`,
                      `${done} done`,
                      noShows ? `${noShows} ${noShows === 1 ? 'no-show' : 'no-shows'}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
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

        {unmarked.length ? (
          <Group>
            <ListRow
              title={unmarked.length === 1 ? '1 session to mark' : `${unmarked.length} sessions to mark`}
              subtitle={namesOf(unmarked)}
              leading={<IconTile icon="checkmark-done-outline" />}
              onPress={() => setMarking(true)}
              testID="calendar-to-mark"
              last
            />
          </Group>
        ) : null}

        <Section
          title={formatDay(selected, today)}
          action={isToday ? undefined : { label: 'Today', onPress: () => setSelected(today) }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {!sessions && !error && showSkeleton ? (
            <Group>
              <SkeletonRows count={3} />
            </Group>
          ) : null}
          {sessions && dayItems.length === 0 ? (
            <EmptyState
              compact
              icon="calendar-clear-outline"
              title="Nothing booked"
              message="A free day."
              action={<Button title="Book" variant="ghost" size="small" onPress={book} />}
            />
          ) : null}
          {dayItems.length > 0 ? (
            <Group>
              {dayItems.map((item, i) =>
                item.kind === 'session' ? (
                  <SessionRow
                    key={item.session.id}
                    session={item.session}
                    variant="grouped"
                    last={i === dayItems.length - 1}
                    now={now}
                  />
                ) : (
                  <AskedRow
                    key={item.request.id}
                    request={item.request}
                    onPress={() => setRequest(item.request)}
                    last={i === dayItems.length - 1}
                  />
                ),
              )}
            </Group>
          ) : null}
        </Section>
      </ScrollView>
      <ToMarkSheet visible={marking} sessions={unmarked} onClose={() => setMarking(false)} onChanged={loadWeek} />
      <RequestSheet
        request={request}
        onClose={() => setRequest(null)}
        onAnswered={loadWeek}
        gone={!!request && goneId === request.id}
        clashName={clashWith ? sessionName(clashWith) : null}
      />
    </SafeAreaView>
  );
}

// A time a client asked for, in its place in the day until the trainer answers.
function AskedRow({ request, onPress, last }: { request: TimeRequest; onPress: () => void; last: boolean }) {
  const start = new Date(request.starts_at);
  const end = endOf(request);
  const name = [request.first_name, request.last_name].filter(Boolean).join(' ');
  return (
    <ListRow
      title={name}
      // The time is on the left already; the line says what it is.
      subtitle={request.clashes ? 'Asked in Voltrix · clashes' : 'Asked in Voltrix'}
      leading={
        <View style={styles.time}>
          <Text variant="rowTitle" tone="secondary" style={Tabular}>
            {time24(start)}
          </Text>
          <Text variant="footnote" tone="tertiary" style={Tabular}>
            {time24(end)}
          </Text>
        </View>
      }
      status={<StatusPill tone="neutral" label="Asked" />}
      onPress={onPress}
      accessibilityLabel={`${name} asks for ${timeRange(start, end)}${request.clashes ? ', clashes with something else' : ''}. Answer`}
      testID={`calendar-asked-${request.id}`}
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
  time: {
    minWidth: 54,
  },
}));
