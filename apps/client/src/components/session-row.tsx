import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Body } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { endOf, formatDay, formatTime, SESSION_STATUS, trainerName, type Session } from '@/lib/sessions';

// One session in a list: time on the left, trainer and where on the right.
export function SessionRow({ session, showDay }: { session: Session; showDay?: boolean }) {
  const start = new Date(session.starts_at);
  const muted = session.status === 'cancelled' || session.status === 'no_show';
  return (
    <View style={styles.row}>
      <View style={[styles.bar, { backgroundColor: muted ? Colors.border : Colors.accent }]} />
      <View style={styles.time}>
        <Text style={styles.start}>{formatTime(start)}</Text>
        <Body secondary style={styles.small}>
          {formatTime(endOf(session))}
        </Body>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.name, muted && styles.struck]} numberOfLines={1}>
          {showDay ? `${formatDay(start)} · ` : ''}
          {trainerName(session)}
        </Text>
        <Body secondary style={styles.small} numberOfLines={1}>
          {[session.location, session.status !== 'scheduled' ? SESSION_STATUS[session.status] : null]
            .filter(Boolean)
            .join(' · ') || `${session.duration_minutes} min`}
        </Body>
      </View>
      {session.status === 'completed' ? <Ionicons name="checkmark-circle" size={22} color={Colors.accent} /> : null}
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingRight: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  bar: {
    width: 4,
    alignSelf: 'stretch',
  },
  time: {
    width: 52,
  },
  start: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  struck: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  small: {
    fontSize: 13,
  },
}));
