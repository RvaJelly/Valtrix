import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { MarkPaidSheet, owedLabel } from '@/components/mark-paid-sheet';
import { PackSheet } from '@/components/pack-sheet';
import { PaySheet, type PayItem } from '@/components/pay-sheet';
import { SellPackSheet } from '@/components/sell-pack-sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  Group,
  ListRow,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { fullName } from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { dayMonth, shortDate } from '@/lib/format';
import { currencyOf, formatMoney } from '@/lib/money';
import { loadOverview, type ClientOverview } from '@/lib/overview';
import { packToPutOn } from '@/lib/pack-rules';
import { loadPacks, type Pack } from '@/lib/packs';
import { loadOwed, owedWords, PAY_METHODS, type OwedItem, type PayMethod } from '@/lib/paid';
import { SESSION_STATUS, type SessionStatus } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { addDaysKey, dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

type PaidSession = {
  id: string;
  starts_at: string;
  status: SessionStatus;
  price_cents: number | null;
  currency: string | null;
  paid_on: string;
  paid_method: PayMethod | null;
};

type Data = { row: ClientOverview | null; owed: OwedItem[]; packs: Pack[]; paid: PaidSession[] };

// "2 sessions and a pack", "1 session", "3 packs".
function itemsWords(items: OwedItem[]) {
  const s = items.filter((i) => i.kind === 'session').length;
  const p = items.length - s;
  const parts = [
    s ? (s === 1 ? '1 session' : `${s} sessions`) : null,
    p ? (p === 1 ? (s ? 'a pack' : '1 pack') : `${p} packs`) : null,
  ].filter(Boolean);
  return parts.join(' and ');
}

function paidWords(method: PayMethod | null, day: string) {
  return `${method ? `${PAY_METHODS[method]} ` : 'Paid '}${dayMonth(dayFromKey(day))}`;
}

// One client's money: what they owe now, their packs, and what they paid in the last 90 days. The
// trainer's own record; Voltrix moves no money.
export default function ClientMoney() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'ZAR';
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [paying, setPaying] = useState<{ item: PayItem; putOn: Pack | null } | null>(null);
  const [marking, setMarking] = useState(false);
  const [selling, setSelling] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const load = useCallback(() => {
    const n = ++loads.current;
    const since = addDaysKey(today, -90);
    return Promise.all([
      loadOverview(today, id),
      loadOwed(id),
      loadPacks(id),
      supabase
        .from('sessions')
        .select('id, starts_at, status, price_cents, currency, paid_on, paid_method')
        .eq('client_id', id)
        .not('paid_on', 'is', null)
        .gte('paid_on', since)
        .order('paid_on', { ascending: false })
        .limit(100),
    ]).then(
      ([rows, owed, packs, paid]) => {
        if (n !== loads.current) return;
        if (paid.error) return setFailed(true);
        setFailed(false);
        setData({ row: rows?.[0] ?? null, owed, packs, paid: (paid.data ?? []) as PaidSession[] });
      },
      () => {
        if (n === loads.current) setFailed(true);
      },
    );
  }, [id, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A cancellation by this client may change what's owed.
  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(load, 1000);
    return () => clearTimeout(timer);
  }, [load, news]);
  useChatEvents((event) => {
    if (event.type === 'news' && event.client_id === id && event.kind === 'cancelled') setNews((n) => n + 1);
  });

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  const row = data?.row ?? null;
  const first = row?.first_name ?? 'The client';
  const name = row ? fullName(row) : ' ';

  if (!data) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Money', headerTitle: '' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <PageHeader eyebrow=" " title="Money" />
          {failed ? (
            <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
              The money page couldn’t be loaded.
            </Notice>
          ) : showSkeleton ? (
            <>
              <Skeleton height={120} radius={20} />
              <SkeletonRows count={5} />
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  const mineOwed = data.owed.filter((i) => i.currency === currency);
  const owedCents = mineOwed.reduce((sum, i) => sum + i.cents, 0);
  const otherOwed = new Map<string, number>();
  for (const i of data.owed)
    if (i.currency !== currency) otherOwed.set(i.currency, (otherOwed.get(i.currency) ?? 0) + i.cents);
  const since = mineOwed[0]?.day ?? null;
  const paidPacks = data.packs.filter((p) => p.paid_on && p.paid_on >= addDaysKey(today, -90));
  const paidRows = [
    ...data.paid.map((s) => ({ kind: 'session' as const, day: s.paid_on, s })),
    ...paidPacks.map((p) => ({ kind: 'pack' as const, day: p.paid_on!, p })),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const empty = !data.owed.length && !data.packs.length && !paidRows.length;
  const owes = owedCents > 0 || data.owed.length > 0;

  async function putOnPack(item: OwedItem, onto: Pack): Promise<string | null> {
    const { error } = await supabase.from('sessions').update({ pack_id: onto.id }).eq('id', item.id);
    if (error) return plainError(error, 'Couldn’t put it on the pack. Try again.');
    toast(`On ${first}’s pack. Nothing owed for it now.`);
    load();
    return null;
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Money', headerTitle: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow={name} title="Money" />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            Couldn’t refresh the money page.
          </Notice>
        ) : null}

        {empty ? (
          <EmptyState
            icon="wallet-outline"
            title="Nothing to track yet"
            message="Sessions marked done and packs you sell show here."
            action={
              <Button title="Sell a pack" size="medium" onPress={() => setSelling(true)} testID="money-sell-empty" />
            }
          />
        ) : (
          <>
            <Card hero style={{ gap: Spacing.two }} testID="money-hero">
              <Text variant="label" tone="secondary">
                {owes ? 'Owes' : 'Paid up'}
              </Text>
              {owes ? (
                <>
                  <Text variant="stat" style={Tabular}>
                    {formatMoney(owedCents, currency)}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {owedWords(itemsWords(mineOwed), since)}
                  </Text>
                  {[...otherOwed].map(([code, cents]) => (
                    <Text key={code} variant="footnote" tone="secondary">
                      {`Also owed in ${currencyOf(code).name}: ${formatMoney(cents, code)}`}
                    </Text>
                  ))}
                  <Button
                    title={owedCents > 0 ? `Mark ${formatMoney(owedCents, currency)} paid` : 'Mark paid'}
                    onPress={() => setMarking(true)}
                    testID="money-mark-all"
                    style={{ marginTop: Spacing.two }}
                  />
                </>
              ) : (
                <Text variant="footnote" tone="secondary">
                  Nothing owed right now.
                </Text>
              )}
            </Card>

            {data.owed.length ? (
              <Section title="Not paid">
                <Group>
                  {data.owed.map((i, n) => {
                    const onto =
                      i.kind === 'session' && i.status === 'completed' ? packToPutOn(data.packs, i.day) : null;
                    return (
                      <ListRow
                        key={i.id}
                        title={owedLabel(i)}
                        trailing={
                          <Text variant="callout" style={Tabular}>
                            {formatMoney(i.cents, i.currency)}
                          </Text>
                        }
                        onPress={() =>
                          setPaying({
                            item: { kind: i.kind, id: i.id, paid_on: null, paid_method: null },
                            putOn: onto,
                          })
                        }
                        testID={`money-item-${i.id}`}
                        last={n === data.owed.length - 1}
                      />
                    );
                  })}
                </Group>
              </Section>
            ) : null}

            <Section
              title="Packs"
              action={
                owes || data.packs.length ? { label: 'Sell a pack', onPress: () => setSelling(true) } : undefined
              }>
              {!owes && !data.packs.length ? (
                <Button title="Sell a pack" onPress={() => setSelling(true)} testID="money-sell" />
              ) : null}
              {data.packs.length ? (
                <Group>
                  {data.packs.map((p, n) => {
                    const ends = p.expires_on ? `ends ${dayMonth(dayFromKey(p.expires_on))}` : 'no end';
                    const paid = p.paid_on ? ` · paid by ${paidWords(p.paid_method, p.paid_on)}` : ' · not paid';
                    return (
                      <ListRow
                        key={p.id}
                        title={`${p.sessions_total} sessions · ${formatMoney(p.price_cents, p.currency)}`}
                        subtitle={
                          p.ended
                            ? `${p.sessions_left ? `${p.sessions_left} not used` : 'All used'}${paid}`
                            : `${p.sessions_left} left · ${p.booked} booked · ${ends}${paid}`
                        }
                        subtitleLines={2}
                        status={p.ended ? <StatusPill tone="muted" label="Ended" /> : null}
                        onPress={() => setPack(p)}
                        testID={`money-pack-${p.id}`}
                        last={n === data.packs.length - 1}
                      />
                    );
                  })}
                </Group>
              ) : (
                <Text variant="footnote" tone="secondary">
                  {`No packs yet. A pack is paid up front and ${first}’s sessions use it, whoever books them.`}
                </Text>
              )}
            </Section>

            {paidRows.length ? (
              <Section title="Paid in the last 90 days">
                <Group>
                  {paidRows.map((r, n) =>
                    r.kind === 'session' ? (
                      <ListRow
                        key={r.s.id}
                        title={`${shortDate(new Date(r.s.starts_at))} · ${SESSION_STATUS[r.s.status]}`}
                        subtitle={paidWords(r.s.paid_method, r.s.paid_on)}
                        trailing={
                          <Text variant="callout" tone="secondary" style={Tabular}>
                            {formatMoney(r.s.price_cents ?? 0, r.s.currency ?? currency)}
                          </Text>
                        }
                        onPress={() =>
                          setPaying({
                            item: { kind: 'session', id: r.s.id, paid_on: r.s.paid_on, paid_method: r.s.paid_method },
                            putOn: null,
                          })
                        }
                        last={n === paidRows.length - 1}
                      />
                    ) : (
                      <ListRow
                        key={r.p.id}
                        title={`Pack of ${r.p.sessions_total}`}
                        subtitle={paidWords(r.p.paid_method, r.p.paid_on!)}
                        trailing={
                          <Text variant="callout" tone="secondary" style={Tabular}>
                            {formatMoney(r.p.price_cents, r.p.currency)}
                          </Text>
                        }
                        onPress={() =>
                          setPaying({
                            item: { kind: 'pack', id: r.p.id, paid_on: r.p.paid_on, paid_method: r.p.paid_method },
                            putOn: null,
                          })
                        }
                        last={n === paidRows.length - 1}
                      />
                    ),
                  )}
                </Group>
              </Section>
            ) : null}
          </>
        )}

        <Text variant="footnote" tone="secondary">
          {`Voltrix doesn’t take payments. This is your own record of what ${first} has paid.`}
        </Text>
      </ScrollView>

      <PaySheet
        item={paying?.item ?? null}
        first={first}
        onClose={() => setPaying(null)}
        onChanged={() => load()}
        putOn={
          paying?.putOn
            ? () => {
                const onto = paying.putOn!;
                const item = data.owed.find((i) => i.id === paying.item.id);
                return item ? putOnPack(item, onto) : Promise.resolve(null);
              }
            : null
        }
      />
      <MarkPaidSheet clientId={marking ? id : null} first={first} onClose={() => setMarking(false)} onDone={load} />
      <SellPackSheet
        clientId={selling ? id : null}
        first={first}
        clientPriceCents={row?.session_price_cents ?? null}
        onClose={() => setSelling(false)}
        onSold={load}
      />
      <PackSheet pack={pack} first={first} onClose={() => setPack(null)} onSaved={load} />
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
}));
