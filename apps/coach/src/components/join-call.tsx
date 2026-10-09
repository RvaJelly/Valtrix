import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Body } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { Session } from '@/lib/sessions';

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

// "Join video call" for an online session with a client, while it is on.
export function JoinCall({
  session,
  name,
  avatar,
  onApp,
}: {
  session: Pick<Session, 'online' | 'status' | 'starts_at' | 'duration_minutes' | 'client_id'>;
  name: string;
  avatar?: string | null;
  // Whether the client has joined the Voltrix app, so there is someone to call.
  onApp: boolean;
}) {
  const now = useNow();
  if (!session.client_id || !canJoin(session, now)) return null;
  if (!onApp) {
    return (
      <Body secondary style={{ fontSize: 14 }}>
        {name} isn&apos;t on the Voltrix app yet, so you can&apos;t call them here.
      </Body>
    );
  }
  const chat = session.client_id;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Join video call with ${name}`}
      onPress={() => router.push({ pathname: '/call', params: { chat, video: '1', name, avatar: avatar ?? '' } })}
      style={({ pressed }) => [styles.button, { backgroundColor: pressed ? Colors.accentPressed : Colors.accent }]}>
      <Ionicons name="videocam" size={22} color={Colors.onAccent} />
      <Text style={styles.text}>Join video call</Text>
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
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
}));
