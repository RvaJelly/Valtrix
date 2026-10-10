import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Notice, Text } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { firstOf } from '@/lib/book-times';
import { withdrawTime, type MyTimeRequest } from '@/lib/booking';
import { plainError } from '@/lib/errors';
import { ago, shortDate, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';

// A time the person asked their trainer for, still waiting for an answer: the day and time, their
// note, when they asked, and Withdraw. A time that passed before the trainer answered reads Expired.
export function WaitingSheet({
  request,
  onClose,
  onChanged,
}: {
  request: MyTimeRequest | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The trainer answered while the sheet was open.
  const [answered, setAnswered] = useState(false);
  const [shown, setShown] = useState<MyTimeRequest | null>(request);
  if (request && request !== shown) {
    setShown(request);
    setError(null);
    setAnswered(false);
  }
  const picked = request ?? shown;
  if (!picked) return <Sheet visible={false} onClose={onClose} />;
  const r = picked;

  const first = firstOf(r);
  const start = new Date(r.starts_at);
  const end = new Date(start.getTime() + r.duration_minutes * 60_000);
  const expired = r.status === 'expired';
  const declined = r.status === 'declined';
  // Answered or withdrawn meanwhile (the list loaded again while the sheet was open).
  const settled = answered || (r.status !== 'pending' && !expired && !declined);

  async function withdraw() {
    haptic.select();
    setBusy(true);
    setError(null);
    try {
      if (await withdrawTime(r.id)) {
        toast('Request withdrawn.');
        onClose();
      } else setAnswered(true);
      onChanged();
    } catch (e) {
      haptic.warning();
      setError(plainError(e, 'Couldn’t withdraw. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!request}
      onClose={onClose}
      title={expired ? 'Time passed' : declined ? 'Not booked' : `Waiting for ${first}`}>
      <View testID="waiting-sheet" style={{ gap: Spacing.gutter }}>
        <View style={{ gap: Spacing.one }}>
          <Text variant="headline" style={Tabular}>
            {`${shortDate(start)} · ${timeRange(start, end)}`}
          </Text>
          <Text variant="footnote" tone="secondary">
            Asked {ago(new Date(r.created_at))}
          </Text>
        </View>
        {r.note ? (
          <View style={styles.quote}>
            <Text variant="callout" tone="secondary">
              “{r.note}”
            </Text>
          </View>
        ) : null}
        {settled ? (
          <Notice onCard>
            {r.status === 'withdrawn' ? 'You withdrew this request.' : `${first} has answered already.`}
          </Notice>
        ) : expired || declined ? (
          <Text variant="footnote" tone="secondary">
            {expired ? `The time passed before ${first} answered.` : `${first} couldn’t take this time.`} Pick another
            time that suits you.
          </Text>
        ) : (
          <Text variant="footnote" tone="secondary">
            {first} approves times in Voltrix Coach. You’ll see the answer here.
          </Text>
        )}
        <ErrorText>{error}</ErrorText>
        {expired || declined ? (
          <Button
            title="Book another time"
            variant="secondary"
            icon="calendar-outline"
            onPress={() => {
              onClose();
              router.push({ pathname: '/book', params: { trainer: r.trainer_id } });
            }}
          />
        ) : settled ? null : (
          <Button
            title="Withdraw request"
            variant="destructive"
            onPress={withdraw}
            loading={busy}
            testID="waiting-withdraw"
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = themed(() => ({
  quote: {
    paddingLeft: Spacing.tight,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderStrong,
  },
}));
