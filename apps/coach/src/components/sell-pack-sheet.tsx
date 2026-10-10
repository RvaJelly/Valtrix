import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { DayPickSheet } from '@/components/day-pick-sheet';
import { PriceField } from '@/components/price-field';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, ListRow, Text, TextField, Toggle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { dayMonthShort } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, moneyInput, parseMoney, priceFor } from '@/lib/money';
import { packEnd, perSession } from '@/lib/pack-rules';
import { sellPack } from '@/lib/packs';
import { lastMethod, loadOwed, methodsInOrder, PAY_METHODS, type PayMethod } from '@/lib/paid';
import { addFailure } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';
import { addDaysKey, dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

const SIZES = { '5': '5', '10': '10', '20': '20', other: 'Other' } as const;
const ENDS = { none: 'No end', '1': '1 month', '3': '3 months', '6': '6 months', pick: 'Pick a day' } as const;
type SizeKey = keyof typeof SIZES;
type EndKey = keyof typeof ENDS;

// Selling a client a pack of sessions, from the Overview, the Money page, the More sheet and Needs you.
export function SellPackSheet({
  clientId,
  first,
  clientPriceCents,
  onClose,
  onSold,
}: {
  // The client, or null when the sheet is closed.
  clientId: string | null;
  first: string;
  // The client's own price, if they have one.
  clientPriceCents: number | null;
  onClose: () => void;
  onSold: () => void;
}) {
  // A fresh form each time the sheet opens; the last one stays while it slides away.
  const [shown, setShown] = useState({ id: clientId, first });
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(!!clientId);
  if (!!clientId !== wasOpen) {
    setWasOpen(!!clientId);
    if (clientId) {
      setShown({ id: clientId, first });
      setOpens((n) => n + 1);
    }
  }
  const id = clientId ?? shown.id;
  const name = clientId ? first : shown.first;
  return (
    <Sheet visible={!!clientId} onClose={onClose} title={`Sell ${name} a pack`}>
      {id ? (
        <SellForm
          key={`${id}-${opens}`}
          clientId={id}
          first={name}
          clientPriceCents={clientPriceCents}
          onClose={onClose}
          onSold={onSold}
        />
      ) : null}
    </Sheet>
  );
}

function SellForm({
  clientId,
  first,
  clientPriceCents,
  onClose,
  onSold,
}: {
  clientId: string;
  first: string;
  clientPriceCents: number | null;
  onClose: () => void;
  onSold: () => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'ZAR';
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const rate = priceFor(clientPriceCents, profile?.session_price_cents ?? null).cents;
  const [size, setSize] = useState<SizeKey>('10');
  const [other, setOther] = useState(8);
  const sessions = size === 'other' ? other : Number(size);
  const [price, setPrice] = useState(rate != null ? moneyInput(rate * 10) : '');
  const [typed, setTyped] = useState(false);
  const [endKey, setEndKey] = useState<EndKey>('none');
  const [picked, setPicked] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [paidNow, setPaidNow] = useState(false);
  const [paidDay, setPaidDay] = useState<'today' | 'yesterday'>('today');
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [order, setOrder] = useState<PayMethod[]>(methodsInOrder(null));
  const [useBooked, setUseBooked] = useState(true);
  const [useUnpaid, setUseUnpaid] = useState(false);
  const [booked, setBooked] = useState(0);
  const [unpaid, setUnpaid] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    lastMethod().then((m) => live && setOrder(methodsInOrder(m)));
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .is('pack_id', null)
      .is('paid_on', null)
      .then(({ count }) => live && setBooked(count ?? 0));
    loadOwed(clientId).then(
      (items) => live && setUnpaid(items.filter((i) => i.kind === 'session').length),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [clientId]);

  function chooseSize(next: SizeKey) {
    setSize(next);
    const n = next === 'other' ? other : Number(next);
    if (!typed && rate != null) setPrice(moneyInput(rate * n));
  }

  function changeOther(n: number) {
    setOther(n);
    if (!typed && rate != null) setPrice(moneyInput(rate * n));
  }

  const parsed = parseMoney(price, currency);
  const expires = endKey === 'none' ? null : endKey === 'pick' ? picked : packEnd(today, Number(endKey));

  async function sell() {
    if (busy) return;
    setError(null);
    if (parsed.error || parsed.cents == null) return setError(parsed.error ?? 'Enter the price of the whole pack.');
    if (paidNow && !method) return setError('Pick how it was paid.');
    if (endKey === 'pick' && !picked) return setError('Pick the day the pack ends.');
    setBusy(true);
    try {
      const sold = await sellPack({
        clientId,
        sessions,
        priceCents: parsed.cents,
        expiresOn: expires,
        paidOn: paidNow ? (paidDay === 'today' ? today : addDaysKey(today, -1)) : null,
        method: paidNow ? method : null,
        note: note.trim() || null,
        useBooked: booked > 0 && useBooked,
        useUnpaid: unpaid > 0 && useUnpaid,
      });
      haptic.success();
      toast(
        sold.moved
          ? `Pack sold. ${sold.moved === 1 ? '1 session uses it.' : `${sold.moved} sessions use it.`}`
          : 'Pack sold.',
      );
      setBusy(false);
      onSold();
      onClose();
    } catch (e) {
      setBusy(false);
      haptic.warning();
      setError(await addFailure(e));
    }
  }

  return (
    <>
      <View style={{ gap: Spacing.two }}>
        <Text variant="label" tone="secondary">
          Sessions
        </Text>
        <Chips options={SIZES} value={size} onChange={(v) => v && chooseSize(v)} wrap testIDPrefix="sell-size-" />
        {size === 'other' ? (
          <Stepper
            label="Sessions in the pack"
            value={String(other)}
            onLess={() => changeOther(Math.max(1, other - 1))}
            onMore={() => changeOther(Math.min(200, other + 1))}
            lessDisabled={other <= 1}
            moreDisabled={other >= 200}
            testID="sell-other"
          />
        ) : null}
      </View>
      <View style={{ gap: Spacing.two }}>
        <PriceField
          label="Price of the whole pack"
          value={price}
          onChangeText={(t) => {
            setTyped(true);
            setPrice(t);
          }}
          currency={currency}
          placeholder={rate == null ? 'For example: 4000' : moneyInput(rate * sessions)}
          error={parsed.error}
          testID="sell-price"
        />
        {parsed.cents != null ? (
          <Text variant="footnote" tone="secondary">
            {`${formatMoney(perSession(parsed.cents, sessions), currency)} a session`}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: Spacing.two }}>
        <Text variant="label" tone="secondary">
          Ends
        </Text>
        <Chips
          options={{ ...ENDS, pick: endKey === 'pick' && picked ? dayMonthShort(dayFromKey(picked)) : ENDS.pick }}
          value={endKey}
          onChange={(v) => {
            if (!v) return;
            if (v === 'pick') setPicking(true);
            else setEndKey(v);
          }}
          wrap
          testIDPrefix="sell-ends-"
        />
      </View>
      <Group style={{ backgroundColor: Colors.tint }}>
        <ListRow
          title="Paid now"
          trailing={
            <Toggle accessibilityLabel="Paid now" value={paidNow} onValueChange={setPaidNow} testID="sell-paid-now" />
          }
          compact
          last={!paidNow && !booked && !unpaid}
        />
        {paidNow ? (
          <View style={{ gap: Spacing.two, paddingHorizontal: Spacing.gutter, paddingBottom: Spacing.three }}>
            <Chips
              options={Object.fromEntries(order.map((m) => [m, PAY_METHODS[m]])) as Record<PayMethod, string>}
              value={method}
              onChange={(m) => m && setMethod(m)}
              wrap
              testIDPrefix="sell-method-"
            />
            <Chips
              options={{ today: 'Today', yesterday: 'Yesterday' }}
              value={paidDay}
              onChange={(d) => d && setPaidDay(d)}
              wrap
              testIDPrefix="sell-paid-day-"
            />
          </View>
        ) : null}
        {booked ? (
          <ListRow
            title="Use for booked sessions"
            subtitle={
              useBooked
                ? `${first}’s ${booked === 1 ? 'booked session moves' : `${booked} booked sessions move`} onto this pack.`
                : 'Booked sessions keep their own price.'
            }
            subtitleLines={2}
            trailing={
              <Toggle
                accessibilityLabel="Use for booked sessions"
                value={useBooked}
                onValueChange={setUseBooked}
                testID="sell-use-booked"
              />
            }
            compact
            last={!unpaid}
          />
        ) : null}
        {unpaid ? (
          <ListRow
            title="Put done sessions not paid on it"
            titleLines={2}
            subtitle={
              useUnpaid
                ? `${unpaid === 1 ? '1 done session not paid moves' : `${unpaid} done sessions not paid move`} onto it, so ${unpaid === 1 ? 'it’s' : 'they’re'} no longer owed.`
                : undefined
            }
            subtitleLines={3}
            trailing={
              <Toggle
                accessibilityLabel="Put done sessions not paid on it"
                value={useUnpaid}
                onValueChange={setUseUnpaid}
                testID="sell-use-unpaid"
              />
            }
            compact
            last
          />
        ) : null}
      </Group>
      <TextField
        label="Note"
        optional
        value={note}
        onChangeText={setNote}
        maxLength={300}
        multiline
        placeholder="Part-payments, what was agreed"
        style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: Spacing.tight }}
        testID="sell-note"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Sell pack" onPress={sell} loading={busy} testID="sell-save" />
      <DayPickSheet
        visible={picking}
        title="Pack ends"
        from={today}
        to={addDaysKey(today, 3 * 365)}
        value={picked}
        onPick={(d) => {
          setPicked(d);
          setEndKey('pick');
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
