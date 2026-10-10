import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { DayPickSheet } from '@/components/day-pick-sheet';
import { PaidOn } from '@/components/paid-on';
import { PriceField } from '@/components/price-field';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Segmented, Text, TextField } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonth, dayMonthShort } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatMoney, moneyInput, parseMoney } from '@/lib/money';
import { packEnd, perSession } from '@/lib/pack-rules';
import { removePack, savePack, type Pack } from '@/lib/packs';
import { lastMethod, methodsInOrder, PAY_METHODS, type PayMethod } from '@/lib/paid';
import { addDaysKey, dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

const ENDS = { none: 'No end', '1': '1 month', '3': '3 months', '6': '6 months', pick: 'Pick a day' } as const;
type EndKey = keyof typeof ENDS;

function endKeyOf(soldOn: string, expiresOn: string | null): EndKey {
  if (!expiresOn) return 'none';
  for (const m of ['1', '3', '6'] as const) if (packEnd(soldOn, Number(m)) === expiresOn) return m;
  return 'pick';
}

// One pack: its size, price, end, whether it's paid, and a note. Removing it is offered while none
// of its sessions is done.
export function PackSheet({
  pack,
  first,
  onClose,
  onSaved,
}: {
  pack: Pack | null;
  first: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A fresh form each time the sheet opens; the last one stays while it slides away.
  const [shown, setShown] = useState<Pack | null>(pack);
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(!!pack);
  if (!!pack !== wasOpen) {
    setWasOpen(!!pack);
    if (pack) {
      setShown(pack);
      setOpens((n) => n + 1);
    }
  }
  const p = pack ?? shown;
  return (
    <Sheet visible={!!pack} onClose={onClose} title={p ? `Pack of ${p.sessions_total}` : undefined}>
      {p ? <PackForm key={`${p.id}-${opens}`} pack={p} first={first} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function PackForm({
  pack,
  first,
  onClose,
  onSaved,
}: {
  pack: Pack;
  first: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [sessions, setSessions] = useState(pack.sessions_total);
  const [price, setPrice] = useState(moneyInput(pack.price_cents));
  const [endKey, setEndKey] = useState<EndKey>(endKeyOf(pack.sold_on, pack.expires_on));
  const [picked, setPicked] = useState<string | null>(
    endKeyOf(pack.sold_on, pack.expires_on) === 'pick' ? pack.expires_on : null,
  );
  const [picking, setPicking] = useState(false);
  const [paid, setPaid] = useState(!!pack.paid_on);
  const [paidOn, setPaidOn] = useState(pack.paid_on ?? today);
  const [method, setMethod] = useState<PayMethod | null>(pack.paid_method);
  const [order, setOrder] = useState<PayMethod[]>(methodsInOrder(null));
  const [note, setNote] = useState(pack.note ?? '');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    lastMethod().then((m) => live && setOrder(methodsInOrder(m)));
    return () => {
      live = false;
    };
  }, []);

  const parsed = parseMoney(price, pack.currency);
  const expires = endKey === 'none' ? null : endKey === 'pick' ? picked : packEnd(pack.sold_on, Number(endKey));
  const patch = {
    sessions_total: sessions,
    price_cents: parsed.cents ?? 0,
    expires_on: expires,
    paid_on: paid ? paidOn : null,
    paid_method: paid ? method : null,
    note: note.trim() || null,
  };
  const changed =
    patch.sessions_total !== pack.sessions_total ||
    patch.price_cents !== pack.price_cents ||
    patch.expires_on !== pack.expires_on ||
    patch.paid_on !== pack.paid_on ||
    patch.paid_method !== pack.paid_method ||
    patch.note !== (pack.note ?? null);
  const atLeast = Math.max(1, pack.used + pack.booked);

  async function save() {
    if (busy || !changed) return;
    if (parsed.error || parsed.cents == null) return setError(parsed.error ?? 'Enter the price of the whole pack.');
    if (paid && !method) return setError('Pick how it was paid.');
    if (endKey === 'pick' && !picked) return setError('Pick the day the pack ends.');
    setBusy('save');
    setError(null);
    try {
      await savePack(pack.id, patch);
    } catch (e) {
      setBusy(null);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t save. Try again.'));
    }
    setBusy(null);
    haptic.success();
    toast('Saved');
    onSaved();
    onClose();
  }

  async function remove() {
    const ok = await confirm(
      'Remove this pack?',
      pack.booked
        ? `Its ${pack.booked === 1 ? '1 booked session goes' : `${pack.booked} booked sessions go`} back to ${first}’s own price.`
        : 'It has no sessions on it yet.',
      'Remove pack',
    );
    if (!ok) return;
    setBusy('remove');
    setError(null);
    try {
      await removePack(pack.id);
    } catch (e) {
      setBusy(null);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t remove it. Try again.'));
    }
    setBusy(null);
    haptic.success();
    toast('Pack removed.');
    onSaved();
    onClose();
  }

  return (
    <>
      <Text variant="callout" tone="secondary" style={{ marginTop: -Spacing.two }}>
        {`Sold ${dayMonth(dayFromKey(pack.sold_on))}`}
      </Text>
      <Stepper
        label="Sessions"
        value={String(sessions)}
        onLess={() => setSessions((n) => Math.max(atLeast, n - 1))}
        onMore={() => setSessions((n) => Math.min(200, n + 1))}
        lessDisabled={sessions <= atLeast}
        moreDisabled={sessions >= 200}
        testID="pack-sessions"
      />
      {atLeast > 1 && sessions <= atLeast ? (
        <Text variant="footnote" tone="secondary" style={{ marginTop: -Spacing.two }}>
          {`This pack has ${atLeast} sessions booked or done.`}
        </Text>
      ) : null}
      <View style={{ gap: Spacing.two }}>
        <PriceField
          label="Price of the whole pack"
          value={price}
          onChangeText={setPrice}
          currency={pack.currency}
          placeholder="0"
          error={parsed.error}
          testID="pack-price"
        />
        {parsed.cents != null && sessions > 0 ? (
          <Text variant="footnote" tone="secondary">
            {`${formatMoney(perSession(parsed.cents, sessions), pack.currency)} a session`}
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
          testIDPrefix="pack-ends-"
        />
      </View>
      <View style={{ gap: Spacing.two }}>
        <Segmented
          options={[
            { value: 'no', label: 'Not paid' },
            { value: 'yes', label: 'Paid' },
          ]}
          value={paid ? 'yes' : 'no'}
          onChange={(v) => setPaid(v === 'yes')}
          testID="pack-paid"
        />
        {paid ? (
          <>
            <Chips
              options={Object.fromEntries(order.map((m) => [m, PAY_METHODS[m]])) as Record<PayMethod, string>}
              value={method}
              onChange={(m) => m && setMethod(m)}
              wrap
              testIDPrefix="pack-method-"
            />
            <PaidOn
              day={paidOn}
              today={today}
              onChange={setPaidOn}
              background={Colors.surfaceHigh}
              testIDPrefix="pack-paid-day-"
            />
          </>
        ) : null}
      </View>
      <TextField
        label="Note"
        optional
        value={note}
        onChangeText={setNote}
        maxLength={300}
        multiline
        placeholder="Part-payments, what was agreed"
        style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.tight }}
        testID="pack-note"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy === 'save'} disabled={!changed || !!busy} testID="pack-save" />
      {pack.used === 0 ? (
        <Button
          title="Remove pack"
          variant="destructive"
          onPress={remove}
          loading={busy === 'remove'}
          disabled={!!busy}
          testID="pack-remove"
        />
      ) : null}
      <DayPickSheet
        visible={picking}
        title="Pack ends"
        from={pack.sold_on}
        to={addDaysKey(pack.sold_on, 3 * 366)}
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
