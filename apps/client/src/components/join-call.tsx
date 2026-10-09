import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { trainerName, type Session } from '@/lib/sessions';

// Both people can join an online session's video call from this long before it
// starts until it ends.
const EARLY_MINUTES = 15;

export function canJoin(s: Pick<Session, 'online' | 'status' | 'starts_at' | 'duration_minutes'>, now: number) {
  if (!s.online || s.status !== 'scheduled') return false;
  const start = new Date(s.starts_at).getTime();
  return now >= start - EARLY_MINUTES * 60_000 && now < start + s.duration_minutes * 60_000;
}

// The time now, updated every few seconds so buttons appear and go on time.
function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// "Join video call" for an online session with a trainer, while it is on.
// onAccent is for the orange "Next session" card.
export function JoinCall({
  session,
  onAccent,
  style,
}: {
  session: Session;
  onAccent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const now = useNow();
  if (!session.client_id || !canJoin(session, now)) return null;
  const name = trainerName(session);
  const params = { chat: session.client_id, video: '1', name, avatar: session.trainer_avatar ?? '' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Join video call with ${name}`}
      onPress={() => router.push({ pathname: '/call', params })}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: onAccent ? Colors.onAccent : pressed ? Colors.accentPressed : Colors.accent },
        pressed && onAccent && { opacity: 0.85 },
        style,
      ]}>
      <Ionicons name="videocam" size={22} color={onAccent ? Colors.accent : Colors.onAccent} />
      <Text style={[styles.text, { color: onAccent ? '#FFFFFF' : Colors.onAccent }]}>Join video call</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
}));
