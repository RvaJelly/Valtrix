import { router } from 'expo-router';
import { View } from 'react-native';

import { Group, ListRow, StatusPill, Text, type StatusTone } from '@/components/ui';
import { Colors, Tabular } from '@/constants/theme';
import { endOf, formatTime, SESSION_STATUS, sessionName, type Session, type SessionStatus } from '@/lib/sessions';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

// One session in a list: the time on the left, who and where, and a pill once it isn't just booked.
// `card` stands on its own; `grouped` is a row inside a Group (`last` drops its hairline).
export function SessionRow({
  session,
  variant = 'card',
  last,
}: {
  session: Session;
  variant?: 'card' | 'grouped';
  last?: boolean;
}) {
  const start = new Date(session.starts_at);
  const cancelled = session.status === 'cancelled';
  const pill = PILLS[session.status];
  const where = session.online ? 'Video call' : session.location || `${session.duration_minutes} min`;
  const row = (
    <ListRow
      title={sessionName(session)}
      titleStyle={cancelled ? { color: Colors.textTertiary, textDecorationLine: 'line-through' } : undefined}
      subtitle={where}
      leading={
        <View style={{ width: 48 }}>
          <Text variant="rowTitle" style={Tabular}>
            {formatTime(start)}
          </Text>
          <Text variant="footnote" tone="secondary" style={Tabular}>
            {formatTime(endOf(session))}
          </Text>
        </View>
      }
      trailing={pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
      onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: session.id } })}
      accessibilityLabel={`${formatTime(start)} to ${formatTime(endOf(session))}, ${sessionName(session)}, ${where}${
        pill ? `, ${SESSION_STATUS[session.status]}` : ''
      }`}
      last={variant === 'card' || last}
    />
  );
  return variant === 'card' ? <Group>{row}</Group> : row;
}
