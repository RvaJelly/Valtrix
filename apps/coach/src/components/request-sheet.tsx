import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, Notice, Text } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { ago, longDate, shortDate, time24, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { packFor } from '@/lib/pack-rules';
import { loadPacks, type Pack } from '@/lib/packs';
import { refreshReminders } from '@/lib/reminders';
import { answeredOne, answerTime, isBusy, type TimeRequest } from '@/lib/requests';
import { addFailure } from '@/lib/save-error';
import { HOME_ZONE, zonedParts } from '@/lib/zones';

// Refusals that mean the request isn't waiting any more: the buttons turn off.
export const SETTLED = [
  'The client withdrew this request.',
  'This request has expired: its time has passed.',
  'You’ve answered this request already.',
  'This request is no longer available.',
  'This client is archived. Restore them first.',
];

// What an Approve tapped elsewhere (on a row) answered, for the sheet to open with: the time filled
// since, or the refusal's sentence.
export type RequestOpening = { busy?: boolean; error?: string | null };

// A client asking for a time: the day and time, their note, Approve or Decline, or message them.
// `gone` turns it off when the request was withdrawn or settled while open. `clashName` names what
// else is on at that time, when the opener knows.
export function RequestSheet({
  request,
  onClose,
  onAnswered,
  gone,
  clashName,
  opening,
}: {
  request: TimeRequest | null;
  onClose: () => void;
  // The opener reloads (after an answer, or a refusal that settled it).
  onAnswered: () => void;
  gone?: boolean;
  clashName?: string | null;
  opening?: RequestOpening | null;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const [shown, setShown] = useState(request);
  const [busy, setBusy] = useState<'approve' | 'decline' | 'anyway' | null>(null);
  const [busyNow, setBusyNow] = useState(!!opening?.busy);
  const [error, setError] = useState<string | null>(opening?.error ?? null);
  const [settled, setSettled] = useState(!!opening?.error && SETTLED.includes(opening.error));
  const [packs, setPacks] = useState<{ client: string; list: Pack[] } | null>(null);
  // Fresh each time it opens, or opens on another request.
  const [wasOpen, setWasOpen] = useState(!!request);
  if (!!request !== wasOpen) setWasOpen(!!request);
  if (request && (request.id !== shown?.id || !wasOpen)) {
    setShown(request);
    setBusy(null);
    setBusyNow(!!opening?.busy);
    setError(opening?.error ?? null);
    setSettled(!!opening?.error && SETTLED.includes(opening.error));
  }
  const r = request ?? shown;
  const clientId = request?.client_id ?? null;

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    loadPacks(clientId)
      .then((list) => live && setPacks({ client: clientId, list }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [clientId]);

  if (!r) return <Sheet visible={false} onClose={onClose} />;
  const start = new Date(r.starts_at);
  const end = new Date(start.getTime() + r.duration_minutes * 60_000);
  const first = r.first_name;
  const day = zonedParts(start, profile?.time_zone || HOME_ZONE).day;
  const pack = packs?.client === r.client_id ? packFor(packs.list, day) : null;
  const off = settled || !!gone || r.status !== 'pending';

  async function answer(approve: boolean, evenIfBusy = false) {
    if (!r || busy) return;
    setBusy(approve ? (evenIfBusy ? 'anyway' : 'approve') : 'decline');
    setError(null);
    try {
      await answerTime(r.id, approve, evenIfBusy);
      answeredOne();
      if (approve) {
        haptic.success();
        toast(`Booked ${first} for ${shortDate(start)} at ${time24(start)}.`);
        refreshReminders();
      } else {
        haptic.select();
        toast(`Declined. ${first} can pick another time.`);
      }
      setBusy(null);
      onAnswered();
      onClose();
    } catch (e) {
      setBusy(null);
      haptic.warning();
      if (isBusy(e)) return setBusyNow(true);
      const words = approve ? await addFailure(e) : plainError(e, 'Couldn’t answer. Try again.');
      if (SETTLED.includes(words)) {
        setSettled(true);
        onAnswered();
      }
      setError(words);
    }
  }

  return (
    <Sheet visible={!!request} onClose={onClose} title={`${first} asks for a time`}>
      <View style={{ gap: Spacing.one }}>
        <Text variant="headline">{longDate(start)}</Text>
        <Text variant="title" style={Tabular}>
          {timeRange(start, end)}
        </Text>
      </View>
      {r.note ? (
        // A tinted card, so the note stands apart on the sheet in both themes.
        <Card style={{ backgroundColor: Colors.tint }}>
          <Text variant="callout">{`“${r.note}”`}</Text>
        </Card>
      ) : null}
      <View style={{ gap: Spacing.one }}>
        <Text variant="footnote" tone="secondary">
          {`Asked ${ago(new Date(r.created_at))}`}
        </Text>
        {pack ? (
          <Text variant="footnote" tone="secondary" testID="request-pack">
            {`Uses ${first}’s pack · ${pack.sessions_left} left`}
          </Text>
        ) : null}
      </View>
      {gone ? (
        <Notice tone="neutral" onCard>
          This request is no longer waiting.
        </Notice>
      ) : busyNow ? (
        <Notice
          tone="warning"
          onCard
          action={{
            label: 'Book anyway',
            onPress: () => answer(true, true),
            loading: busy === 'anyway',
            testID: 'request-anyway',
          }}>
          You have something else at that time now.
        </Notice>
      ) : r.clashes && !off ? (
        <Notice tone="warning" onCard>
          {`You have ${clashName || 'something else'} at ${time24(start)} now.`}
        </Notice>
      ) : null}
      <View style={{ gap: Spacing.tight }}>
        <Button
          title="Approve"
          onPress={() => answer(true)}
          loading={busy === 'approve'}
          disabled={off || busyNow || (!!busy && busy !== 'approve')}
          testID="request-approve"
        />
        <Button
          title="Decline"
          variant="secondary"
          onPress={() => answer(false)}
          loading={busy === 'decline'}
          disabled={off || (!!busy && busy !== 'decline')}
          testID="request-decline"
        />
        <ErrorText testID="request-error">{error}</ErrorText>
        <Button
          title={`Message ${first}`}
          variant="ghost"
          onPress={() => {
            onClose();
            router.push({ pathname: '/chat/[id]', params: { id: r.client_id, name: first } });
          }}
          testID="request-message"
        />
      </View>
    </Sheet>
  );
}
