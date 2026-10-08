import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform, Vibration } from 'react-native';

// The ringtone for incoming calls, and the ring-back tone while calling someone.

let player: AudioPlayer | null = null;

function startPlayer(source: number, volume: number) {
  const next = createAudioPlayer(source);
  next.loop = true;
  next.volume = volume;
  next.play();
  return next;
}

export function playTone(kind: 'incoming' | 'outgoing') {
  stopTone();
  // Ring even when the phone's silent switch is on, like a phone call.
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  try {
    player =
      kind === 'incoming'
        ? startPlayer(require('@/assets/sounds/ring.wav'), 1)
        : startPlayer(require('@/assets/sounds/ringback.wav'), 0.6);
  } catch {
    // A browser may block sound until the page is tapped; the screen still shows the call.
    player = null;
  }
  if (kind === 'incoming' && Platform.OS !== 'web') Vibration.vibrate([0, 900, 1100], true);
}

export function stopTone() {
  if (Platform.OS !== 'web') Vibration.cancel();
  if (!player) return;
  const current = player;
  player = null;
  try {
    current.pause();
    current.remove();
  } catch {
    // Already gone.
  }
}
