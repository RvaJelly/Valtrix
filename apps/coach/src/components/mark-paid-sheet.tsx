import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { PaidOn } from '@/components/paid-on';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, ListRow, Notice, SkeletonRows, Text, Toggle } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { dayMonthShort, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { currencyOf, formatMoney } from '@/lib/money';
import {
  lastMethod,
  loadOwed,
  methodsInOrder,
  PAY_METHODS,
  rememberMethod,
  setPaid,
  type OwedItem,
  type PayMethod,
} from '@/lib/paid';
import { dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

// "Tue 6 Oct · Done", "Pack of 10 · sold 1 Oct".
export function owedLabel(i: OwedItem) {
  if (i.kind === 'pack') return `Pack of ${i.sessions ?? 0} · sold ${dayMonthShort(dayFromKey(i.day))}`;
  const when = i.starts_at ? shortDate(new Date(i.starts_at)) : shortDate(dayFromKey(i.day));
  return `${when} · ${i.status === 'no_show' ? 'No-show' : 'Done'}`;
}

// Everything one client owes, marked paid in one go: the day, the way, and the items (all on).
export function MarkPaidSheet({
  clientId,
  first,
  onClose,
  onDone,
}: {
  // The client, or null when the sheet is closed.
  clientId: string | null;
  first: string;
  onClose: () => void;
  // The opener reloads, after a save and after an Undo.
  onDone: () => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'ZAR';
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [shown, setShown] = useState(clientId);
  const [items, setItems] = useState<OwedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  const [day, setDay] = useState(today);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [last, setLast] = useState<PayMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  if (clientId && clientId !== shown) {
    setShown(clientId);
    setItems(null);
    setOff([]);
    setDay(today);
    setMethod(null);
    setError(null);
  }

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    loadOwed(clientId).then(
      (found) => {
        if (!live) return;
        setFailed(false);
        setItems(found);
      },
      () => live && setFailed(true),
    );
    lastMethod().then((m) => live && setLast(m));
    return () => {
      live = false;
    };
  }, [clientId, tries]);

  const on = (items ?? []).filter((i) => !off.includes(i.id));
  const mine = on.filter((i) => i.currency === currency);
  const others = (items ?? []).filter((i) => i.currency !== currency);
  const total = mine.reduce((sum, i) => sum + i.cents, 0);
  const label =
    !on.length || mine.length !== on.length
      ? on.length === 1
        ? 'Mark 1 item paid'
        : `Mark ${on.length} items paid`
      : `Mark ${formatMoney(total, currency)} paid`;

  async function save() {
    if (!method || !on.length || busy) return;
    setBusy(true);
    setError(null);
    const sessions = on.filter((i) => i.kind === 'session').map((i) => i.id);
    const packs = on.filter((i) => i.kind === 'pack').map((i) => i.id);
    try {
      await setPaid(sessions, packs, day, method);
    } catch (e) {
      setBusy(false);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t save. Try again.'));
    }
    setBusy(false);
    haptic.success();
    rememberMethod(method);
    onDone();
    onClose();
    toast(
      mine.length === on.length ? `Marked ${formatMoney(total, currency)} paid` : `Marked ${on.length} items paid`,
      {
        action: {
          label: 'Undo',
          onPress: () => {
            haptic.select();
            setPaid(sessions, packs, null).then(onDone, (e) => toast(plainError(e, 'Couldn’t undo. Try again.')));
          },
        },
      },
    );
  }

  const row = (i: OwedItem, index: number, count: number) => (
    <ListRow
      key={i.id}
      title={owedLabel(i)}
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.tight }}>
          <Text variant="callout" style={Tabular}>
            {formatMoney(i.cents, i.currency)}
          </Text>
          <Toggle
            accessibilityLabel={`${owedLabel(i)}, ${formatMoney(i.cents, i.currency)}`}
            value={!off.includes(i.id)}
            onValueChange={(v) => setOff((o) => (v ? o.filter((x) => x !== i.id) : [...o, i.id]))}
            testID={`mark-paid-item-${i.id}`}
          />
        </View>
      }
      compact
      last={index === count - 1}
    />
  );

  return (
    <Sheet visible={!!clientId} onClose={onClose} title="Mark paid">
      <View style={{ gap: Spacing.two }}>
        <Text variant="label" tone="secondary">
          Paid on
        </Text>
        <PaidOn day={day} today={today} onChange={setDay} testIDPrefix="mark-paid-day-" />
      </View>
      <View style={{ gap: Spacing.two }}>
        <Text variant="label" tone="secondary">
          How
        </Text>
        <Chips
          options={
            Object.fromEntries(methodsInOrder(last).map((m) => [m, PAY_METHODS[m]])) as Record<PayMethod, string>
          }
          value={method}
          onChange={(m) => m && setMethod(m)}
          wrap
          testIDPrefix="mark-paid-method-"
        />
      </View>
      {failed ? (
        <Notice tone="danger" onCard action={{ label: 'Try again', onPress: () => setTries((t) => t + 1) }}>
          {`What ${first} owes couldn’t be loaded.`}
        </Notice>
      ) : !items ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <SkeletonRows count={3} />
        </Group>
      ) : items.length ? (
        <>
          {items.some((i) => i.currency === currency) ? (
            <Group style={{ backgroundColor: Colors.tint }}>
              {items.filter((i) => i.currency === currency).map((i, n, all) => row(i, n, all.length))}
            </Group>
          ) : null}
          {others.length ? (
            <>
              <Text variant="footnote" tone="secondary">
                {`Owed in ${currencyOf(others[0].currency).name}`}
              </Text>
              <Group style={{ backgroundColor: Colors.tint }}>{others.map((i, n) => row(i, n, others.length))}</Group>
            </>
          ) : null}
        </>
      ) : (
        <Text variant="body" tone="secondary">
          {`${first} doesn’t owe anything right now.`}
        </Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Button title={label} onPress={save} loading={busy} disabled={!method || !on.length} testID="mark-paid-save" />
      {!method && on.length ? (
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          Pick how it was paid.
        </Text>
      ) : null}
    </Sheet>
  );
}
