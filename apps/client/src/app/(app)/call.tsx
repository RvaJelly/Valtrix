import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { CallView, type CallViewHandle } from '@/components/call-view';
import { Spacing } from '@/constants/theme';
import type { CallPageEvent, CallSignal } from '@/lib/call-page';
import {
  fetchCall,
  ICE_SERVERS,
  isOver,
  knownCall,
  RING_SECONDS,
  setCurrentCall,
  startCall,
  updateCall,
  type Call,
  type CallRow,
} from '@/lib/calls';
import { formatSeconds } from '@/lib/chat';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { playTone, stopTone } from '@/lib/ring';
import { supabase } from '@/lib/supabase';

type Phase = 'starting' | 'ringing-out' | 'ringing-in' | 'connecting' | 'connected' | 'ended';

const GREEN = '#22C55E';
const RED = '#EF4444';

// Calls need the microphone, and video calls the camera too. Browsers ask by themselves.
async function askPermissions(video: boolean) {
  if (Platform.OS === 'web') return null;
  const mic = await requestRecordingPermissionsAsync();
  if (!mic.granted) return 'Allow the microphone in your phone settings to make calls.';
  if (video) {
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (!camera.granted) return 'Allow the camera in your phone settings to make video calls.';
  }
  return null;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// The same login can be open on two devices (a phone and a computer): both ring, and
// whichever answers first takes the call.
const ANSWERED_ELSEWHERE = 'Answered on another device.';

// Keeps the screen on, so a voice call doesn't go quiet or drop when the screen would
// turn off. Shown only while the call rings or is going. A browser may say no to keeping
// the screen on; that is not an error worth showing.
function StayAwake() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}

// A voice or video call, like WhatsApp: calling someone, or someone calling you.
export default function CallScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    chat?: string;
    video?: string;
    incoming?: string;
    name?: string;
    avatar?: string;
  }>();
  const incoming = params.incoming === '1';
  const insets = useSafeAreaInsets();
  const { chats } = useChat();

  const [call, setCall] = useState<Call | CallRow | null>(() => (params.id ? knownCall(params.id) : null));
  const [phase, setPhase] = useState<Phase>(incoming ? 'ringing-in' : 'starting');
  const [endText, setEndText] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pageOn, setPageOn] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // A short note in place of the call time, like "Couldn't switch camera."
  const [notice, setNotice] = useState<string | null>(null);

  const page = useRef<CallViewHandle>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const callId = useRef<string | null>(params.id ?? null);
  const phaseNow = useRef<Phase>(phase);
  const joined = useRef(false);
  const outbox = useRef<{ event: string; payload: object }[]>([]);
  const pageLoaded = useRef(false);
  const pageStarted = useRef(false);
  const mediaReady = useRef(false);
  const wantOffer = useRef(false);
  const gotOffer = useRef(false);
  const hangingUp = useRef(false);
  const connectedAt = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const helloTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatId = call?.chat_id ?? params.chat;
  const summary = chats.find((c) => c.chat_id === chatId);
  const video = call ? call.video : params.video === '1';
  const named = call && 'caller_name' in call ? call : null;
  const otherName =
    (named ? (incoming ? named.caller_name : named.callee_name) : null) ?? summary?.other_name ?? params.name ?? 'Call';
  const otherAvatar =
    (named ? (incoming ? named.caller_avatar : named.callee_avatar) : null) ??
    summary?.other_avatar ??
    (params.avatar || null);

  // The phase lives in a ref too, because channel and timer callbacks need it right away.
  function go(next: Phase) {
    phaseNow.current = next;
    setPhase(next);
  }

  // A function, so TypeScript doesn't assume the phase stayed the same across an await.
  function ended() {
    return phaseNow.current === 'ended';
  }

  function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }

  function stopHello() {
    if (helloTimer.current) clearInterval(helloTimer.current);
    helloTimer.current = null;
  }

  function leaveChannel() {
    const current = channel.current;
    channel.current = null;
    joined.current = false;
    // Give a last "bye" a moment to go out first.
    if (current) setTimeout(() => supabase.removeChannel(current), 800);
  }

  // Ends the call on this phone and closes the screen shortly after.
  function finish(text: string, closeAfter = 1800) {
    if (phaseNow.current === 'ended') return;
    go('ended');
    setEndText(text);
    stopTone();
    stopHello();
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    page.current?.send({ type: 'stop' });
    leaveChannel();
    setCurrentCall(null);
    later(close, closeAfter);
  }

  function send(event: string, payload: object) {
    if (channel.current && joined.current) {
      channel.current.send({ type: 'broadcast', event, payload }).catch(() => {});
    } else {
      outbox.current.push({ event, payload });
    }
  }

  // The person being called says "ready" until the caller's offer arrives.
  function sayHello() {
    if (helloTimer.current || !mediaReady.current || !joined.current) return;
    let tries = 0;
    send('hello', {});
    helloTimer.current = setInterval(() => {
      tries++;
      if (gotOffer.current || tries > 20 || phaseNow.current === 'ended') stopHello();
      else send('hello', {});
    }, 1500);
  }

  function startPage() {
    if (pageStarted.current || !pageLoaded.current || !page.current) return;
    pageStarted.current = true;
    page.current.send({
      type: 'start',
      role: incoming ? 'callee' : 'caller',
      video,
      iceServers: ICE_SERVERS,
      previewTop: insets.top + 96,
    });
  }

  function onHello() {
    if (incoming) return;
    // The other phone answered, even if the "answered" update hasn't arrived yet.
    if (phaseNow.current === 'ringing-out') {
      stopTone();
      go('connecting');
    }
    if (mediaReady.current) page.current?.send({ type: 'offer' });
    else wantOffer.current = true;
  }

  function onSignal(data: CallSignal) {
    if (data.description?.type === 'offer') {
      gotOffer.current = true;
      stopHello();
    }
    page.current?.send({ type: 'signal', data });
  }

  async function join(id: string) {
    await supabase.realtime.setAuth();
    if (phaseNow.current === 'ended') return;
    channel.current = supabase
      .channel(`call:${id}`, { config: { private: true } })
      .on('broadcast', { event: 'hello' }, () => onHello())
      .on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload as CallSignal))
      .on('broadcast', { event: 'bye' }, () => finish('Call ended.'))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        joined.current = true;
        const waiting = outbox.current;
        outbox.current = [];
        for (const item of waiting) send(item.event, item.payload);
        if (incoming) sayHello();
      });
  }

  // Hangs up for both people. A reason is shown a little longer than a plain "Call ended".
  function hangUp(reason?: string) {
    const id = callId.current;
    hangingUp.current = true;
    if (id) {
      send('bye', {});
      updateCall(id, phaseNow.current === 'ringing-out' ? 'cancel' : 'end').catch(() => {});
    }
    const plain =
      phaseNow.current === 'ringing-out' || phaseNow.current === 'starting' ? 'Call cancelled.' : 'Call ended.';
    finish(reason ?? plain, reason ? 3500 : 900);
  }

  function onPageEvent(event: CallPageEvent) {
    if (event.type === 'loaded') {
      pageLoaded.current = true;
      startPage();
    } else if (event.type === 'media') {
      if (!event.ok) {
        hangUp(
          video
            ? 'Could not use your camera or microphone. Allow them in your settings and try again.'
            : 'Could not use your microphone. Allow it in your settings and try again.',
        );
        return;
      }
      mediaReady.current = true;
      if (incoming) sayHello();
      else if (wantOffer.current) page.current?.send({ type: 'offer' });
    } else if (event.type === 'signal') {
      send('signal', event.data);
    } else if (event.type === 'remote') {
      setRemoteVideo(event.video);
    } else if (event.type === 'flip') {
      if (!event.ok) {
        setNotice('Couldn’t switch camera.');
        later(() => setNotice(null), 3000);
      }
    } else if (event.type === 'state') {
      if (event.state === 'connected') {
        stopHello();
        setReconnecting(false);
        if (dropTimer.current) clearTimeout(dropTimer.current);
        dropTimer.current = null;
        if (phaseNow.current !== 'connected' && phaseNow.current !== 'ended') {
          stopTone();
          go('connected');
          connectedAt.current = Date.now();
          tickTimer.current = setInterval(
            () => setSeconds(Math.round((Date.now() - connectedAt.current) / 1000)),
            1000,
          );
        }
      } else if (event.state === 'disconnected') {
        setReconnecting(true);
        if (!dropTimer.current) {
          dropTimer.current = setTimeout(() => hangUp('The call dropped. Check your internet and try again.'), 15_000);
        }
      } else if (event.state === 'failed') {
        hangUp('The call could not connect. Check your internet and try again.');
      }
    }
  }

  // A call that rang here and ended without being answered here.
  function missedText() {
    const id = callId.current;
    return id && knownCall(id)?.answered_at ? ANSWERED_ELSEWHERE : 'Missed call.';
  }

  // Updates from the database: answered, declined, ended on the other phone...
  useChatEvents((event) => {
    if (event.type !== 'call' || event.call.id !== callId.current) return;
    const next = event.call;
    setCall(next);
    if (next.status === 'accepted' && phaseNow.current === 'ringing-out') {
      stopTone();
      go('connecting');
    } else if (next.status === 'accepted' && incoming && phaseNow.current === 'ringing-in') {
      // Answered on this person's other device: stop ringing here.
      finish(ANSWERED_ELSEWHERE);
    } else if (isOver(next.status) && !hangingUp.current) {
      if (incoming && phaseNow.current === 'ringing-in') finish(next.answered_at ? ANSWERED_ELSEWHERE : 'Missed call.');
      else if (next.status === 'declined') finish(`${next.callee_name} declined the call.`);
      else if (next.status === 'busy') finish(`${next.callee_name} is on another call.`);
      else if (next.status === 'missed') finish('No answer.');
      else finish('Call ended.');
    }
  });

  async function begin() {
    if (incoming) {
      const id = params.id!;
      setCurrentCall(id);
      let current: Call | CallRow | null = knownCall(id);
      if (!current) {
        current = await fetchCall(id);
        if (current) setCall((c) => c ?? current);
      }
      if (!current || isOver(current.status)) {
        return finish(current ? (current.answered_at ? ANSWERED_ELSEWHERE : 'Missed call.') : 'This call has ended.');
      }
      if (current.status === 'accepted') return finish(ANSWERED_ELSEWHERE);
      playTone('incoming');
      later(
        () => {
          if (phaseNow.current === 'ringing-in') finish(missedText());
        },
        (RING_SECONDS + 10) * 1000,
      );
      return;
    }

    setCurrentCall('starting');
    const problem = await askPermissions(video);
    if (problem) return finish(problem, 3500);
    if (ended()) return;
    let started: Call;
    try {
      started = await startCall(params.chat!, video);
    } catch (e) {
      const message = e instanceof Error && /yourself/.test(e.message) ? "You can't call yourself." : null;
      return finish(message ?? 'Could not start the call. Check your internet and try again.', 3000);
    }
    callId.current = started.id;
    setCall(started);
    if (hangingUp.current || ended()) {
      updateCall(started.id, 'cancel').catch(() => {});
      return;
    }
    setCurrentCall(started.id);
    if (started.status === 'busy') return finish(`${started.callee_name} is on another call.`, 3000);
    if (isOver(started.status)) return finish('Call ended.');
    go('ringing-out');
    playTone('outgoing');
    join(started.id);
    setPageOn(true);
    later(() => {
      if (phaseNow.current === 'ringing-out') {
        updateCall(started.id, 'missed').catch(() => {});
        finish('No answer.', 2500);
      }
    }, RING_SECONDS * 1000);
  }

  function leave() {
    // Leaving the screen (the back button) hangs up.
    if (phaseNow.current !== 'ended') {
      const id = callId.current;
      if (id) {
        send('bye', {});
        updateCall(id, phaseNow.current === 'ringing-in' ? 'decline' : 'end').catch(() => {});
      }
      phaseNow.current = 'ended';
      stopTone();
      page.current?.send({ type: 'stop' });
      leaveChannel();
      setCurrentCall(null);
    }
    stopHello();
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
  }

  const onOpen = useEffectEvent(() => begin());
  const onClose = useEffectEvent(() => leave());
  useEffect(() => {
    // Start right after the screen appears, so it shows before the ringing and permission prompts.
    const timer = setTimeout(onOpen, 0);
    return () => {
      clearTimeout(timer);
      onClose();
    };
  }, []);

  async function accept() {
    const id = callId.current;
    if (!id || phaseNow.current !== 'ringing-in') return;
    stopTone();
    go('connecting');
    const problem = await askPermissions(video);
    if (problem) {
      updateCall(id, 'decline').catch(() => {});
      return finish(problem, 3500);
    }
    // Already answered on another device (that news can arrive while this one asks).
    if (knownCall(id)?.status === 'accepted') return finish(ANSWERED_ELSEWHERE);
    try {
      const answered = await updateCall(id, 'accept');
      setCall(answered);
      if (answered.status !== 'accepted') {
        return finish(
          answered.status === 'ended' ? (answered.answered_at ? ANSWERED_ELSEWHERE : 'Call ended.') : 'Missed call.',
        );
      }
      // The database says whether this tap is what answered it. Joining as well would
      // add a third device to the call, and hanging up there would end it for everyone.
      if (answered.answered_here === false) return finish(ANSWERED_ELSEWHERE);
    } catch {
      return finish('Could not answer. Check your internet and try again.', 3000);
    }
    join(id);
    setPageOn(true);
  }

  function decline() {
    const id = callId.current;
    hangingUp.current = true;
    if (id) updateCall(id, 'decline').catch(() => {});
    finish('Call declined.', 600);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    page.current?.send({ type: 'mute', on: next });
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    page.current?.send({ type: 'camera', on: next });
  }

  const status =
    phase === 'starting'
      ? 'Calling…'
      : phase === 'ringing-out'
        ? 'Ringing…'
        : phase === 'ringing-in'
          ? video
            ? 'Incoming video call'
            : 'Incoming voice call'
          : phase === 'connecting'
            ? 'Connecting…'
            : phase === 'connected'
              ? reconnecting
                ? 'Reconnecting…'
                : (notice ?? formatSeconds(seconds))
              : (endText ?? 'Call ended.');

  // Video calls show the cameras; voice calls (and video before it connects) show the person's photo.
  const showFace = !video || !pageOn || phase === 'ended' || (phase === 'connected' && !remoteVideo && !cameraOn);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <StatusBar style="light" />
      {phase !== 'ended' ? <StayAwake /> : null}
      {pageOn ? <CallView ref={page} onEvent={onPageEvent} /> : null}

      <View style={[styles.top, { paddingTop: insets.top + Spacing.five }, !showFace && styles.topOverVideo]}>
        <Text style={styles.name} numberOfLines={1}>
          {otherName}
        </Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {status}
        </Text>
      </View>

      {showFace ? (
        <View style={styles.face} pointerEvents="none">
          <Avatar url={otherAvatar} name={otherName} size={132} />
        </View>
      ) : (
        <View style={{ flex: 1 }} pointerEvents="none" />
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.five }]}>
        {phase === 'ringing-in' ? (
          <>
            <RoundButton icon="call" color={RED} rotate label="Decline" onPress={decline} />
            <RoundButton icon={video ? 'videocam' : 'call'} color={GREEN} label="Answer" onPress={accept} />
          </>
        ) : phase === 'ended' ? (
          <RoundButton icon="close" color="rgba(255,255,255,0.18)" label="Close" onPress={close} />
        ) : (
          <>
            <RoundButton
              icon={muted ? 'mic-off' : 'mic'}
              color={muted ? '#FFFFFF' : 'rgba(255,255,255,0.18)'}
              iconColor={muted ? '#0E0E0F' : '#FFFFFF'}
              label={muted ? 'Unmute' : 'Mute'}
              onPress={toggleMute}
            />
            {video ? (
              <RoundButton
                icon={cameraOn ? 'videocam' : 'videocam-off'}
                color={cameraOn ? 'rgba(255,255,255,0.18)' : '#FFFFFF'}
                iconColor={cameraOn ? '#FFFFFF' : '#0E0E0F'}
                label={cameraOn ? 'Camera off' : 'Camera on'}
                onPress={toggleCamera}
              />
            ) : null}
            {video && Platform.OS !== 'web' ? (
              <RoundButton
                icon="camera-reverse"
                color="rgba(255,255,255,0.18)"
                label="Flip camera"
                onPress={() => page.current?.send({ type: 'flip' })}
              />
            ) : null}
            <RoundButton icon="call" color={RED} rotate label="End call" onPress={() => hangUp()} />
          </>
        )}
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  color,
  iconColor = '#FFFFFF',
  label,
  rotate,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  iconColor?: string;
  label: string;
  rotate?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.buttonWrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.button, { backgroundColor: color, opacity: pressed ? 0.75 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Ionicons
          name={icon}
          size={30}
          color={iconColor}
          style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </Pressable>
      <Text style={styles.buttonLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B0F1A',
  },
  top: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  topOverVideo: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  status: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
  },
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  buttonWrap: {
    alignItems: 'center',
    gap: Spacing.two,
    width: 80,
  },
  button: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
  },
});
