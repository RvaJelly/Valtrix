import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { canJoin, JoinCall } from '@/components/join-call';
import { Group, ListRow, StatusPill, Text, type StatusTone } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { shortDate } from '@/lib/format';
import { priceLabel } from '@/lib/money';
import {
  endOf,
  formatDay,
  formatTime,
  SESSION_STATUS,
  sessionName,
  type Session,
  type SessionStatus,
} from '@/lib/sessions';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

// One session in a list: the time on the left, who and where, and a pill once it isn't just booked.
// `card` stands on its own; `grouped` is a row inside a Group (`last` drops its hairline).
// With `now`, an online session that can be joined gets its Join button under the row (beside the
// row's own button, not inside it, so screen readers reach both). `showDay` is for a list of one
// client's sessions: the row names the day instead of repeating the client.
export function SessionRow({
  session,
  variant = 'card',
  last,
  now,
  showDay,
  price,
}: {
  session: Session;
  variant?: 'card' | 'grouped';
  last?: boolean;
  now?: number;
  showDay?: boolean;
  // Shows the session's price at the end ("R400", "Free", nothing without one).
  price?: boolean;
}) {
  const start = new Date(session.starts_at);
  const cancelled = session.status === 'cancelled';
  const pill = PILLS[session.status];
  const where = session.online ? 'Video call' : session.location || `${session.duration_minutes} min`;
  const joinable = now !== undefined && canJoin(session, now);
  const lastLine = variant === 'card' || last;
  // 'Today', 'Tomorrow' or 'Mon 5 Oct': short, so a pill and a price still fit beside it.
  const title = showDay ? shortDay(start) : sessionName(session);
  const cost = price ? priceLabel(session.price_cents, session.currency ?? 'ZAR') : null;
  const row = (
    <>
      <ListRow
        title={title}
        titleStyle={cancelled ? { color: Colors.textTertiary, textDecorationLine: 'line-through' } : undefined}
        subtitle={where}
        leading={
          <View style={styles.time}>
            <Text variant="rowTitle" style={Tabular}>
              {formatTime(start)}
            </Text>
            <Text variant="footnote" tone="secondary" style={Tabular}>
              {formatTime(endOf(session))}
            </Text>
          </View>
        }
        status={pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
        trailing={
          cost ? (
            <Text variant="footnote" tone="secondary" style={Tabular}>
              {cost}
            </Text>
          ) : null
        }
        onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: session.id } })}
        accessibilityLabel={`${showDay ? `${formatDay(start)}, ` : ''}${formatTime(start)} to ${formatTime(endOf(session))}, ${sessionName(session)}, ${where}${
          pill ? `, ${SESSION_STATUS[session.status]}` : ''
        }${cost ? `, ${cost}` : ''}`}
        last={lastLine || joinable}
      />
      {joinable ? (
        <View style={[styles.join, !lastLine && styles.joinLine]}>
          <JoinCall session={session} name={sessionName(session)} onApp={!!session.clients?.user_id} size="medium" />
        </View>
      ) : null}
    </>
  );
  return variant === 'card' ? <Group>{row}</Group> : row;
}

function shortDay(date: Date) {
  const day = formatDay(date);
  return day === 'Today' || day === 'Tomorrow' ? day : shortDate(date);
}

const styles = themed(() => ({
  // Grows with large text instead of cutting the times.
  time: {
    minWidth: 48,
  },
  // Lines up with the row's title.
  join: {
    paddingLeft: Spacing.gutter + 48 + Spacing.tight,
    paddingRight: Spacing.gutter,
    paddingBottom: Spacing.tight,
  },
  joinLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
}));
