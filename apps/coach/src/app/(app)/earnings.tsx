import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  Group,
  IconButton,
  ListRow,
  Notice,
  Section,
  Segmented,
  Skeleton,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { fillPrices, loadTotals, summarize, type Summary } from '@/lib/earnings';
import { plainError } from '@/lib/errors';
import { dayMonthShort, monthYear, shortDate, time24 } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, priceLabel, spokenMoney } from '@/lib/money';
import { addDays, dayKey, sessionName, startOfDay, startOfWeek, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type Period = 'week' | 'month';
type Done = Pick<
  Session,
  'id' | 'client_id' | 'title' | 'starts_at' | 'duration_minutes' | 'price_cents' | 'currency'
> & {
  clients: { first_name: string; last_name: string | null; user_id: string | null } | null;
};

const PAGE = 100;
const DONE_COLUMNS =
  'id, client_id, title, starts_at, duration_minutes, price_cents, currency, clients(first_name, last_name, user_id)';

// From the start of the period `offset` periods from now, to the start of the next one.
function rangeOf(period: Period, offset: number, now: Date): [Date, Date] {
  if (period === 'week') {
    const from = addDays(startOfWeek(startOfDay(now)), offset * 7);
    return [from, addDays(from, 7)];
  }
  return [
    new Date(now.getFullYear(), now.getMonth() + offset, 1),
    new Date(now.getFullYear(), now.getMonth() + offset + 1, 1),
  ];
}

// "5 – 11 Oct", "28 Sep – 4 Oct", "October 2026".
function rangeLabel(period: Period, [from, to]: [Date, Date]) {
  if (period === 'month') return monthYear(from);
  const last = addDays(to, -1);
  return from.getMonth() === last.getMonth()
    ? `${from.getDate()} – ${dayMonthShort(last)}`
    : `${dayMonthShort(from)} – ${dayMonthShort(last)}`;
}

// What the trainer earned in a week or a month: sessions marked done at the price they were
// booked for, with the done sessions under it.
export default function Earnings() {
  const { profile } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [done, setDone] = useState<Done[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Some clients have their own price, so filling prices can work without a usual price.
  const [clientPrices, setClientPrices] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [filling, setFilling] = useState(false);
  const loads = useRef(0);
  const showSkeleton = useDelayed(300);
  const currency = profile?.currency ?? 'ZAR';
  const usual = profile?.session_price_cents ?? null;

  const now = new Date();
  const range = rangeOf(period, offset, now);
  const label = rangeLabel(period, range);

  const load = useCallback(async () => {
    const id = ++loads.current;
    const [from, to] = rangeOf(period, offset, new Date());
    try {
      const [totals, list, own] = await Promise.all([
        loadTotals(from, to),
        supabase
          .from('sessions')
          .select(DONE_COLUMNS)
          .eq('status', 'completed')
          .gte('starts_at', from.toISOString())
          .lt('starts_at', to.toISOString())
          .order('starts_at', { ascending: false })
          .range(0, PAGE - 1),
        supabase.from('clients').select('id', { count: 'exact', head: true }).not('session_price_cents', 'is', null),
      ]);
      if (id !== loads.current) return;
      if (list.error) throw list.error;
      const rows = (list.data ?? []) as unknown as Done[];
      setSummary(totals ? summarize(totals, currency) : null);
      setDone(rows);
      setMore(rows.length === PAGE);
      setClientPrices(!own.error && (own.count ?? 0) > 0);
      setFailed(false);
    } catch {
      if (id === loads.current) setFailed(true);
    }
  }, [period, offset, currency]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function move(by: number) {
    haptic.select();
    setSummary(null);
    setDone(null);
    setOffset((o) => o + by);
  }

  function choose(next: Period) {
    setSummary(null);
    setDone(null);
    setOffset(0);
    setPeriod(next);
  }

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function showMore() {
    if (!done) return;
    setLoadingMore(true);
    const [from, to] = range;
    const { data, error } = await supabase
      .from('sessions')
      .select(DONE_COLUMNS)
      .eq('status', 'completed')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at', { ascending: false })
      .range(done.length, done.length + PAGE - 1);
    setLoadingMore(false);
    if (error) return toast(plainError(error, 'Couldn’t load more. Try again.'));
    const rows = (data ?? []) as unknown as Done[];
    setDone([...done, ...rows]);
    setMore(rows.length === PAGE);
  }

  async function fill() {
    const word = period === 'week' ? 'week' : 'month';
    const ok = await confirm(
      'Price sessions without one?',
      `Sessions with a client in this ${word} that have no price get the client’s own price, or your usual price. Sessions that have a price keep it.`,
      'Use prices',
    );
    if (!ok) return;
    setFilling(true);
    try {
      const count = await fillPrices(range[0], range[1]);
      haptic.success();
      toast(
        count === 0
          ? 'No sessions could be priced. Set your usual price first.'
          : count === 1
            ? '1 session priced'
            : `${count} sessions priced`,
      );
      await load();
    } catch (e) {
      toast(plainError(e, 'Couldn’t price the sessions. Try again.'));
    }
    setFilling(false);
  }

  const ready = !!done && !failed;
  const askForPrice = !!summary && usual == null && !summary.priced;
  const canFill = usual != null || clientPrices;
  const word = period === 'week' ? 'week' : 'month';
  const empty =
    offset === 0
      ? `Nothing earned this ${word} yet`
      : `Nothing earned in ${period === 'month' ? monthYear(range[0]).split(' ')[0] : label}`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.tight }}>
          <Segmented
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={period}
            onChange={choose}
          />
          <View style={styles.period}>
            <IconButton
              icon="chevron-back"
              label={period === 'week' ? 'Previous week' : 'Previous month'}
              onPress={() => move(-1)}
              testID="earnings-prev"
            />
            <Text variant="headline" style={[Tabular, styles.periodLabel]} testID="earnings-period">
              {label}
            </Text>
            <IconButton
              icon="chevron-forward"
              label={period === 'week' ? 'Next week' : 'Next month'}
              onPress={() => move(1)}
              disabled={offset >= 1}
              testID="earnings-next"
            />
          </View>
        </View>

        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {done ? 'Couldn’t refresh your earnings.' : 'Your earnings couldn’t be loaded.'}
          </Notice>
        ) : null}

        {!ready ? (
          showSkeleton && !failed ? (
            <View style={{ gap: Spacing.section }} accessible accessibilityLabel="Loading">
              <Skeleton height={132} radius={Radius.large} />
              <SkeletonRows count={3} avatar />
            </View>
          ) : null
        ) : (
          <>
            {!summary ? (
              <Notice>Earnings aren’t ready yet. Your done sessions are below.</Notice>
            ) : askForPrice ? (
              <Card hero>
                <Text variant="headline">Set your session price</Text>
                <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.one }}>
                  Then Home and this page show what you earn.
                </Text>
                <Button
                  title="Set price"
                  onPress={() => router.push('/settings/prices')}
                  style={{ marginTop: Spacing.gutter }}
                />
              </Card>
            ) : (
              <View style={{ gap: Spacing.tight }}>
                <Card hero>
                  <Text variant="label" tone="secondary">
                    Earned
                  </Text>
                  <Text
                    variant="stat"
                    style={[Tabular, styles.total]}
                    testID="earnings-total"
                    accessibilityLabel={`${spokenMoney(summary.earned, currency)} earned`}>
                    {formatMoney(summary.earned, currency)}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {[
                      `${summary.done} done`,
                      summary.noShows ? `${summary.noShows} ${summary.noShows === 1 ? 'no-show' : 'no-shows'}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Card>
                {summary.ahead > 0 ? (
                  <Text variant="callout" tone="secondary" style={Tabular}>
                    {formatMoney(summary.ahead, currency)} booked ahead
                  </Text>
                ) : null}
                {summary.others.map((o) => (
                  <Text key={o.currency} variant="footnote" tone="secondary" style={Tabular}>
                    Plus {formatMoney(o.cents, o.currency)} in {o.currency}.
                  </Text>
                ))}
              </View>
            )}

            {summary && summary.unpriced > 0 && !askForPrice ? (
              <View testID="earnings-unpriced">
                <Notice
                  action={
                    canFill
                      ? { label: 'Use your prices', onPress: fill, loading: filling, testID: 'earnings-fill' }
                      : {
                          label: 'Set your price',
                          onPress: () => router.push('/settings/prices'),
                          testID: 'earnings-fill',
                        }
                  }>
                  {summary.unpriced === 1
                    ? '1 done session has no price.'
                    : `${summary.unpriced} done sessions have no price.`}
                </Notice>
              </View>
            ) : null}

            {done.length ? (
              <Section title="Done">
                <DoneList sessions={done} now={now} />
                {more ? (
                  <Button
                    title="Show more"
                    variant="ghost"
                    onPress={showMore}
                    loading={loadingMore}
                    style={{ alignSelf: 'center' }}
                  />
                ) : null}
              </Section>
            ) : (
              <EmptyState
                compact
                icon="cash-outline"
                title={empty}
                message="Sessions you mark done show here with their price."
              />
            )}

            <Text variant="footnote" tone="secondary">
              Earned counts sessions marked done, at the price they were booked for. No-shows aren’t counted.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Done sessions, newest first, under a label for each day.
function DoneList({ sessions, now }: { sessions: Done[]; now: Date }) {
  const days: { key: string; date: Date; rows: Done[] }[] = [];
  for (const s of sessions) {
    const date = new Date(s.starts_at);
    const key = dayKey(date);
    const day = days[days.length - 1];
    if (day?.key === key) day.rows.push(s);
    else days.push({ key, date, rows: [s] });
  }
  return (
    <View style={{ gap: Spacing.three }}>
      {days.map((day) => (
        <View key={day.key} style={{ gap: Spacing.two }}>
          <Text variant="footnote" tone="secondary">
            {shortDate(day.date, now)}
          </Text>
          <Group>
            {day.rows.map((s, i) => {
              const name = sessionName(s);
              const price = priceLabel(s.price_cents, s.currency ?? 'ZAR');
              const time = time24(new Date(s.starts_at));
              return (
                <ListRow
                  key={s.id}
                  title={name}
                  subtitle={time}
                  leading={<Avatar name={name} size={40} />}
                  trailing={
                    <Text variant="callout" tone={price ? 'primary' : 'tertiary'} style={Tabular}>
                      {price ?? 'No price'}
                    </Text>
                  }
                  onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: s.id } })}
                  accessibilityLabel={`${name}, ${time}, ${
                    s.price_cents == null ? 'no price' : spokenMoney(s.price_cents, s.currency ?? 'ZAR')
                  }`}
                  testID={`earnings-row-${s.id}`}
                  last={i === day.rows.length - 1}
                />
              );
            })}
          </Group>
        </View>
      ))}
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
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  period: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodLabel: {
    flex: 1,
    textAlign: 'center',
  },
  total: {
    fontSize: 40,
    lineHeight: 46,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
}));
