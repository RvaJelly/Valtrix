import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Text } from '@/components/ui';
import { BRAND, Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { currentCall, ringingCalls } from '@/lib/calls';
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

// Both people often tap Join at the start. When the other one is already calling,
// this opens their call to answer, instead of a second call that would cut it off.
async function join(myId: string | undefined, params: { chat: string; video: string; name: string; avatar: string }) {
  const ringing = myId ? await ringingCalls(myId).catch(() => []) : [];
  // Their call may have opened on its own screen in the meantime.
  if (currentCall()) return;
  const calling = ringing.find((c) => c.chat_id === params.chat);
  if (calling) router.push({ pathname: '/call', params: { id: calling.id, incoming: '1' } });
  else router.push({ pathname: '/call', params });
}

// "Join video call" for an online session with a trainer, while it is on: the view's one primary
// (orange) button. onAccent is for a card that is orange itself, where the button turns black.
export function JoinCall({
  session,
  onAccent,
  size,
  style,
}: {
  session: Session;
  onAccent?: boolean;
  size?: 'large' | 'medium';
  style?: StyleProp<ViewStyle>;
}) {
  const now = useNow();
  const { session: signedIn } = useAuth();
  const [joining, setJoining] = useState(false);
  if (!session.client_id || !canJoin(session, now)) return null;
  const name = trainerName(session);
  const params = { chat: session.client_id, video: '1', name, avatar: session.trainer_avatar ?? '' };
  async function onPress() {
    setJoining(true);
    await join(signedIn?.user.id, params);
    setJoining(false);
  }
  if (!onAccent) {
    return (
      <Button
        title="Join video call"
        icon="videocam-outline"
        size={size}
        accessibilityLabel={`Join video call with ${name}`}
        loading={joining}
        onPress={onPress}
        style={style}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Join video call with ${name}`}
      disabled={joining}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, style]}>
      <Ionicons name="videocam-outline" size={20} color={BRAND.white} />
      <Text variant="button" style={{ color: BRAND.white }}>
        Join video call
      </Text>
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
    backgroundColor: Colors.onAccent,
  },
}));
