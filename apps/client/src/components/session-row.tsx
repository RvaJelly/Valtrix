import { View } from 'react-native';

import { Group, ListRow, StatusPill, Text, type StatusTone } from '@/components/ui';
import { Colors, Tabular } from '@/constants/theme';
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
export function SessionRow({
  session,
  showDay,
  showTrainer = true,
  variant = 'card',
  last,
}: {
  session: Session;
  showDay?: boolean;
  showTrainer?: boolean;
  variant?: 'card' | 'grouped';
  last?: boolean;
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
      titleStyle={[Tabular, cancelled && { color: Colors.textTertiary, textDecorationLine: 'line-through' }]}
      subtitle={[where, who].filter(Boolean).join(' · ')}
      leading={
        showDay ? (
          <View style={{ width: 44, alignItems: 'center' }}>
            <Text variant="label" tone="secondary">
              {weekdayShort(start)}
            </Text>
            <Text variant="title">{start.getDate()}</Text>
          </View>
        ) : undefined
      }
      trailing={pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
      chevron={false}
      last={variant === 'card' || last}
    />
  );
  return variant === 'card' ? <Group>{row}</Group> : row;
}
