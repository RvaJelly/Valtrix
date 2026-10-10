import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { JoinCall } from '@/components/join-call';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  StatusPill,
  Text,
  type IconName,
  type StatusTone,
} from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { canCancel } from '@/lib/book-times';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonth, shortDate, time24, timeRange, weekdayShort } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { cancelMySession, endOf, ONLINE_LABEL, trainerName, type Session } from '@/lib/sessions';

const CANCEL_FAILED = 'Couldn’t cancel. Check your connection and try again.';

// What the status row says, with its pill.
function statusOf(s: Session, first: string): { icon: IconName; words: string; tone: StatusTone; pill: string } {
  switch (s.status) {
    case 'cancelled':
      return {
        icon: 'close-circle-outline',
        words: s.cancelled_by_me ? 'You cancelled this' : 'Cancelled',
        tone: 'neutral',
        pill: 'Cancelled',
      };
    case 'completed':
      return { icon: 'checkmark-circle-outline', words: `${first} marked it done`, tone: 'success', pill: 'Done' };
    case 'no_show':
      return { icon: 'remove-circle-outline', words: `${first} marked it missed`, tone: 'neutral', pill: 'Missed' };
    default:
      return {
        icon: 'calendar-outline',
        words: s.booked_by_me ? 'You booked this' : `${first} booked this`,
        tone: 'neutral',
        pill: 'Booked',
      };
  }
}

// One session, opened from a row in Plan › Sessions or Home: with whom, where, whether it repeats or
// uses a pack (never a price), and Cancel while the trainer allows it in the app; otherwise a message
// to the trainer. `onChanged` loads the list again after a cancel.
export function SessionSheet({
  session,
  onClose,
  onChanged,
}: {
  session: Session | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last session shown stays while the sheet slides away.
  const [shown, setShown] = useState<Session | null>(session);
  if (session && session !== shown) {
    setShown(session);
    setError(null);
  }
  const picked = session ?? shown;
  if (!picked) return <Sheet visible={false} onClose={onClose} />;
  const s = picked;

  const start = new Date(s.starts_at);
  const name = trainerName(s);
  const first = name.split(' ')[0] || name;
  const status = statusOf(s, first);
  const cancellable = canCancel(s);
  const until = s.cancel_until ? new Date(s.cancel_until) : null;
  const place = s.online ? ONLINE_LABEL : s.location;

  function message() {
    onClose();
    router.push({ pathname: '/chat/[id]', params: { id: s.client_id, name, avatar: s.trainer_avatar ?? '' } });
  }

  async function cancel() {
    const sure = await confirm('Cancel this session?', `${first} will see that you cancelled.`, 'Cancel session');
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const now = await cancelMySession(s.id);
      haptic.success();
      toast(now ? `Session cancelled. ${first} can see it.` : 'This session was cancelled already.');
      refreshReminders();
      onClose();
      onChanged();
    } catch (e) {
      haptic.warning();
      setError(plainError(e, CANCEL_FAILED));
      // The cut-off may have passed, or the trainer marked it meanwhile: show what is true now.
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!session}
      onClose={onClose}
      onClosed={() => setError(null)}
      title={`${weekdayShort(start)} ${dayMonth(start)} · ${timeRange(start, endOf(s))}`}>
      <View testID="session-sheet" style={{ gap: Spacing.gutter }}>
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title={`With ${name}`}
            leading={
              // As wide as the icon tiles below, so the rows' lines start together.
              <View style={{ width: 36, alignItems: 'center' }}>
                <Avatar url={s.trainer_avatar} name={name} size={28} />
              </View>
            }
            compact
          />
          {place ? (
            <ListRow
              title={place}
              titleLines={2}
              leading={<IconTile icon={s.online ? 'videocam-outline' : 'location-outline'} />}
              compact
            />
          ) : null}
          {s.repeats ? (
            <ListRow title="Repeats every week" leading={<IconTile icon="repeat-outline" />} compact />
          ) : null}
          {s.on_pack ? <ListRow title="On your pack" leading={<IconTile icon="albums-outline" />} compact /> : null}
          <ListRow
            title={status.words}
            leading={<IconTile icon={status.icon} />}
            status={<StatusPill tone={status.tone} label={status.pill} />}
            compact
            last
          />
        </Group>

        {cancellable && until ? (
          <View style={{ gap: Spacing.tight }}>
            <Text variant="footnote" tone="secondary">
              You can cancel in the app until {shortDate(until)}, {time24(until)}.
            </Text>
            <ErrorText>{error}</ErrorText>
            <JoinCall session={s} />
            <Button
              title="Cancel session"
              variant="destructive"
              onPress={cancel}
              loading={busy}
              testID="session-cancel"
            />
          </View>
        ) : (
          <View style={{ gap: Spacing.tight }}>
            {s.status === 'scheduled' ? (
              <Text variant="footnote" tone="secondary">
                To change or cancel, message {first}.
              </Text>
            ) : null}
            <ErrorText>{error}</ErrorText>
            <JoinCall session={s} />
            <Button
              title={`Message ${first}`}
              icon="chatbubble-outline"
              variant="secondary"
              onPress={message}
              testID="session-message"
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}
