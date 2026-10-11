import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { JoinCall } from '@/components/join-call';
import { Divider, Group, ListRow, StatusPill, Text, type StatusTone } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { dayMonthShort, shortDate, weekdayShort } from '@/lib/format';
import { endOf, formatTime, SESSION_STATUS, trainerName, type Session, type SessionStatus } from '@/lib/sessions';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'neutral',
};

// One session in a list. With `showDay` a date block (MON / 12) leads the row, and with `showMonth`
// the month under it (a list with no month headers); otherwise the time does. The trainer's name shows
// when `showTrainer` (the client may have several). A cancelled one says who cancelled it.
// `card` stands on its own; `grouped` is a row inside a Group (`last` drops its hairline).
// `muted` quietens a past session. With `join`, an online session's "Join video call" shows
// under its row, inside the group, while the call is open. With `onPress` the row opens the
// session (its sheet). A session made by a weekly repeat booking carries a small repeat mark.
export function SessionRow({
  session,
  showDay,
  showMonth,
  showTrainer = true,
  variant = 'card',
  last,
  muted,
  join,
  onPress,
}: {
  session: Session;
  showDay?: boolean;
  showMonth?: boolean;
  showTrainer?: boolean;
  variant?: 'card' | 'grouped';
  last?: boolean;
  muted?: boolean;
  join?: boolean;
  onPress?: () => void;
}) {
  const start = new Date(session.starts_at);
  const range = `${formatTime(start)}–${formatTime(endOf(session))}`;
  const cancelled = session.status === 'cancelled';
  const pill = PILLS[session.status];
  const where = session.online ? 'Video call' : session.location || `${session.duration_minutes} min`;
  const first = trainerName(session).split(' ')[0];
  const by = cancelled ? (session.cancelled_by_me ? 'You cancelled' : `${first} cancelled`) : null;
  const who = showTrainer && !by ? first : null;
  const subtitle = [by, where, who].filter(Boolean).join(' · ');
  const spoken = [
    showDay ? (showMonth ? shortDate(start) : `${weekdayShort(start)} ${start.getDate()}`) : null,
    range,
    subtitle,
    session.repeats ? 'repeats every week' : null,
    pill && !by ? SESSION_STATUS[session.status] : null,
  ]
    .filter(Boolean)
    .join(', ');
  const row = (
    <ListRow
      title={range}
      titleTone={muted ? 'secondary' : undefined}
      titleStyle={[Tabular, cancelled && { color: Colors.textTertiary, textDecorationLine: 'line-through' }]}
      subtitle={subtitle}
      leading={
        showDay ? (
          // Three lines with the month, so the row grows to keep air above and below them.
          <View style={{ minWidth: 44, alignItems: 'center', paddingVertical: showMonth ? Spacing.two : 0 }}>
            <Text variant="label" tone="secondary">
              {weekdayShort(start)}
            </Text>
            <Text variant="title">{start.getDate()}</Text>
            {showMonth ? (
              <Text variant="label" tone="secondary">
                {dayMonthShort(start).split(' ')[1]}
              </Text>
            ) : null}
          </View>
        ) : undefined
      }
      status={
        pill ? (
          <StatusPill tone={pill} label={SESSION_STATUS[session.status]} testID={`session-status-${session.id}`} />
        ) : null
      }
      trailing={
        session.repeats ? (
          <Ionicons
            name="repeat-outline"
            size={14}
            color={Colors.textSecondary}
            accessibilityLabel="Repeats every week"
            testID={`session-repeats-${session.id}`}
          />
        ) : null
      }
      chevron={onPress ? undefined : false}
      onPress={onPress}
      accessibilityLabel={onPress ? spoken : undefined}
      accessibilityHint={onPress ? 'Opens the session' : undefined}
      testID={`session-row-${session.id}`}
      last={variant === 'card' || last || join}
    />
  );
  if (join) {
    // The hairline goes under the Join button, so the button stays with its own session.
    const grouped = (
      <View>
        {row}
        <JoinCall
          session={session}
          size="medium"
          style={{ marginHorizontal: Spacing.gutter, marginBottom: Spacing.tight }}
        />
        {variant === 'grouped' && !last ? <Divider inset={Spacing.gutter} /> : null}
      </View>
    );
    return variant === 'card' ? <Group>{grouped}</Group> : grouped;
  }
  return variant === 'card' ? <Group>{row}</Group> : row;
}
