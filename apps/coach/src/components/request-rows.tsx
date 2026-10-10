import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import type { RequestOpening } from '@/components/request-sheet';
import { RowWithAction } from '@/components/row-action';
import { useToast } from '@/components/toast';
import { Button, ListRow, Text } from '@/components/ui';
import { fullName } from '@/lib/clients';
import { ago, shortDate, time24, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { answeredOne, answerTime, isBusy, type PersonRequest, type TimeRequest } from '@/lib/requests';
import { addFailure } from '@/lib/save-error';

// "Thu 15 Oct, 17:30–18:30". The times never break apart over two lines (word joiners round the dash).
export function askedFor(r: TimeRequest) {
  const start = new Date(r.starts_at);
  const end = new Date(start.getTime() + r.duration_minutes * 60_000);
  return `${shortDate(start)}, ${timeRange(start, end).replace('–', '\u2060–\u2060')}`;
}

// A client asking for a time, with Approve at the end as its own button. The row opens the request
// sheet; an Approve the database turns away (the time filled since, or the request settled) opens
// it too, with the reason, so the trainer decides there.
export function TimeRequestRow({
  request,
  last,
  onOpen,
  onApproved,
}: {
  request: TimeRequest;
  last?: boolean;
  onOpen: (request: TimeRequest, opening?: RequestOpening) => void;
  onApproved: (id: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const name = fullName(request);
  const first = request.first_name;
  const start = new Date(request.starts_at);
  const when = askedFor(request);

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      await answerTime(request.id, true);
      answeredOne();
      haptic.success();
      toast(`Booked ${first} for ${shortDate(start)} at ${time24(start)}.`);
      refreshReminders();
      setBusy(false);
      onApproved(request.id);
    } catch (e) {
      haptic.warning();
      const opening: RequestOpening = isBusy(e) ? { busy: true } : { error: await addFailure(e) };
      setBusy(false);
      onOpen(request, opening);
    }
  }

  return (
    <RowWithAction
      title={name}
      subtitle={
        <Text variant="footnote" tone="secondary" numberOfLines={2}>
          {`Asks for ${when}`}
          {request.clashes ? ' · clashes' : ''}
        </Text>
      }
      leading={<Avatar name={name} size={40} />}
      onPress={() => onOpen(request)}
      accessibilityLabel={`${name} asks for ${when}${request.clashes ? ', clashes with something else' : ''}`}
      accessibilityHint="Opens the request"
      testID={`request-row-${request.id}`}
      last={last}
      action={
        <Button
          title="Approve"
          variant="secondary"
          size="small"
          onPress={approve}
          loading={busy}
          accessibilityLabel={`Approve ${first} for ${shortDate(start)} at ${time24(start)}`}
          testID={`home-approve-${request.id}`}
        />
      }
    />
  );
}

// Someone asking to train with the trainer. No Accept here: accepting links a person, so the
// trainer looks at the person sheet first.
export function PersonRequestRow({
  request,
  last,
  now,
  onOpen,
}: {
  request: PersonRequest;
  last?: boolean;
  now: number;
  onOpen: (request: PersonRequest) => void;
}) {
  const name = request.full_name?.trim() || 'Someone';
  // "Asked to train 13 hours ago", in the same words as the person sheet's "Asked 13 hours ago".
  const asked = ago(new Date(request.created_at), new Date(now));
  return (
    <ListRow
      title={name}
      subtitle={`Asked to train ${asked}`}
      leading={<Avatar url={request.avatar_url} name={name} size={40} />}
      onPress={() => onOpen(request)}
      accessibilityLabel={`${name} wants to train with you, asked ${asked}`}
      testID={`person-row-${request.id}`}
      last={last}
    />
  );
}
