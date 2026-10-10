import { View } from 'react-native';

import { JoinCall } from '@/components/join-call';
import { Divider, Group, ListRow, StatusPill, Text, type StatusTone } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { weekdayShort } from '@/lib/format';
import { endOf, formatTime, SESSION_STATUS, trainerName, type Session, type SessionStatus } from '@/lib/sessions';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

// One session in a list. With `showDay` a date block (MON / 12) leads the row; otherwise the
// time does. The trainer's name shows when `showTrainer` (the client may have several).
// `card` stands on its own; `grouped` is a row inside a Group (`last` drops its hairline).
// `muted` quietens a past session. With `join`, an online session's "Join video call" shows
// under its row, inside the group, while the call is open.
export function SessionRow({
  session,
  showDay,
  showTrainer = true,
  variant = 'card',
  last,
  muted,
  join,
}: {
  session: Session;
  showDay?: boolean;
  showTrainer?: boolean;
  variant?: 'card' | 'grouped';
  last?: boolean;
  muted?: boolean;
  join?: boolean;
}) {
  const start = new Date(session.starts_at);
  const range = `${formatTime(start)}–${formatTime(endOf(session))}`;
  const cancelled = session.status === 'cancelled';
  const pill = PILLS[session.status];
  const where = session.online ? 'Video call' : session.location || `${session.duration_minutes} min`;
  const who = showTrainer ? trainerName(session).split(' ')[0] : null;
  const row = (
    <ListRow
      title={range}
      titleTone={muted ? 'secondary' : undefined}
      titleStyle={[Tabular, cancelled && { color: Colors.textTertiary, textDecorationLine: 'line-through' }]}
      subtitle={[where, who].filter(Boolean).join(' · ')}
      leading={
        showDay ? (
          <View style={{ minWidth: 44, alignItems: 'center' }}>
            <Text variant="label" tone="secondary">
              {weekdayShort(start)}
            </Text>
            <Text variant="title">{start.getDate()}</Text>
          </View>
        ) : undefined
      }
      status={pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
      chevron={false}
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
