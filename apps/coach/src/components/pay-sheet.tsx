import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { PaidOn } from '@/components/paid-on';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, IconTile, ListRow, Text } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  lastMethod,
  methodsInOrder,
  PAY_ICONS,
  PAY_METHODS,
  rememberMethod,
  setPaid,
  type PayMethod,
} from '@/lib/paid';
import { dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

export type PayItem = {
  kind: 'session' | 'pack';
  id: string;
  paid_on: string | null;
  paid_method: PayMethod | null;
};

// One session or one pack: how the client paid and when, saved as soon as a way is tapped, with Undo
// on the toast. One already paid shows how, and Mark as not paid.
export function PaySheet({
  item,
  first,
  onClose,
  onChanged,
  putOn,
}: {
  item: PayItem | null;
  first: string;
  onClose: () => void;
  // The new paid day and way (null, null: not paid), after a save or an Undo.
  onChanged: (paidOn: string | null, method: PayMethod | null) => void;
  // A done session not paid: "Put on {first}’s pack" instead, when a pack has room. Answers a
  // refusal's words, or null when it worked.
  putOn?: (() => Promise<string | null>) | null;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [shown, setShown] = useState(item);
  const [day, setDay] = useState(today);
  const [last, setLast] = useState<PayMethod | null>(null);
  const [busy, setBusy] = useState<PayMethod | 'unpaid' | 'pack' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (item && item.id !== shown?.id) {
    setShown(item);
    setDay(today);
    setError(null);
    setBusy(null);
  }
  const it = item ?? shown;

  useEffect(() => {
    if (!item) return;
    lastMethod().then(setLast);
  }, [item]);

  const lists = (x: PayItem) => (x.kind === 'session' ? [[x.id], []] : [[], [x.id]]) as [string[], string[]];

  async function save(
    paidOn: string | null,
    method: PayMethod | null,
    undo: { on: string | null; method: PayMethod | null },
  ) {
    if (!it || busy) return;
    setBusy(method ?? 'unpaid');
    setError(null);
    const [sessions, packs] = lists(it);
    try {
      await setPaid(sessions, packs, paidOn, method);
    } catch (e) {
      setBusy(null);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t save. Try again.'));
    }
    setBusy(null);
    if (method) {
      haptic.success();
      rememberMethod(method);
    } else haptic.select();
    onChanged(paidOn, method);
    onClose();
    toast(method ? `Paid by ${PAY_METHODS[method]}` : 'Marked not paid', {
      action: {
        label: 'Undo',
        onPress: async () => {
          haptic.select();
          try {
            await setPaid(sessions, packs, undo.on, undo.method);
            onChanged(undo.on, undo.method);
          } catch (e) {
            toast(plainError(e, 'Couldn’t undo. Try again.'));
          }
        },
      },
    });
  }

  async function usePack() {
    if (!putOn || busy) return;
    setBusy('pack');
    setError(null);
    const problem = await putOn();
    setBusy(null);
    if (problem) {
      haptic.warning();
      return setError(problem);
    }
    haptic.success();
    onClose();
  }

  if (!it) return <Sheet visible={false} onClose={onClose} />;
  const paid = !!it.paid_on;

  return (
    <Sheet visible={!!item} onClose={onClose} title={paid ? 'Paid' : `How did ${first} pay?`}>
      {paid ? (
        <>
          <Text variant="body" testID="pay-paid-line">
            {`Paid${it.paid_method ? ` by ${PAY_METHODS[it.paid_method]}` : ''} on ${dayMonth(dayFromKey(it.paid_on!))}`}
          </Text>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Mark as not paid"
            variant="destructive"
            onPress={() => save(null, null, { on: it.paid_on, method: it.paid_method })}
            loading={busy === 'unpaid'}
            testID="pay-unpaid"
          />
        </>
      ) : (
        <>
          <View style={{ gap: Spacing.two }}>
            <Text variant="label" tone="secondary">
              Paid on
            </Text>
            <PaidOn day={day} today={today} onChange={setDay} testIDPrefix="pay-day-" />
          </View>
          <Group style={{ backgroundColor: Colors.tint }}>
            {methodsInOrder(last).map((m, i, all) => (
              <ListRow
                key={m}
                title={PAY_METHODS[m]}
                leading={<IconTile icon={PAY_ICONS[m]} />}
                chevron={false}
                onPress={() => save(day, m, { on: null, method: null })}
                accessibilityLabel={`Paid by ${PAY_METHODS[m]}`}
                accessibilityState={{ busy: busy === m }}
                testID={`pay-method-${m}`}
                last={i === all.length - 1}
              />
            ))}
          </Group>
          <Text variant="footnote" tone="secondary">
            Your own record of money paid to you. Voltrix doesn’t take payments.
          </Text>
          <ErrorText>{error}</ErrorText>
          {putOn ? (
            <Button
              title={`Put on ${first}’s pack`}
              variant="ghost"
              onPress={usePack}
              loading={busy === 'pack'}
              testID="money-put-on-pack"
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
