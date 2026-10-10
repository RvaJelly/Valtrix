import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { currentCall, ringingCalls } from '@/lib/calls';
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

// "Join video call" for an online session with a client, while it is on. It is the view's
// primary action, so it is the one orange button.
export function JoinCall({
  session,
  name,
  avatar,
  onApp,
  style,
}: {
  session: Pick<Session, 'online' | 'status' | 'starts_at' | 'duration_minutes' | 'client_id'>;
  name: string;
  avatar?: string | null;
  // Whether the client accepted the invite in the Voltrix app, so there is someone to call.
  onApp: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const now = useNow();
  const { session: signedIn } = useAuth();
  const [joining, setJoining] = useState(false);
  if (!session.client_id || !canJoin(session, now)) return null;
  if (!onApp) {
    return (
      <Text variant="callout" tone="secondary" style={style}>
        You can call {name} here once they accept your invite in the Voltrix app.
      </Text>
    );
  }
  const params = { chat: session.client_id, video: '1', name, avatar: avatar ?? '' };
  return (
    <Button
      title="Join video call"
      icon="videocam-outline"
      accessibilityLabel={`Join video call with ${name}`}
      loading={joining}
      onPress={async () => {
        setJoining(true);
        await join(signedIn?.user.id, params);
        setJoining(false);
      }}
      style={style}
    />
  );
}
