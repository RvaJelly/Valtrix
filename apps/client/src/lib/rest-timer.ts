import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Platform, Vibration } from 'react-native';

// The rest timer between sets: how long, the buzz and the beep when it's over.

// When the trainer set no rest. A rest of 0 (supersets) means none.
export const DEFAULT_REST_SECONDS = 90;
// A rest end noticed later than this (the phone or tab was asleep) is cleared without a sound,
// so nobody gets a stale buzz minutes later.
export const LATE_MS = 2000;
export const REST_SOUND_KEY = 'voltrix.restSound';

export async function loadRestSound(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REST_SOUND_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveRestSound(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(REST_SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Kept for this visit only.
  }
}

// iPhone browsers can't vibrate, so the "Rest over" banner is the only signal there.
export function buzz(): void {
  try {
    if (Platform.OS === 'web') {
      (navigator as Navigator & { vibrate?: (pattern: number[]) => boolean }).vibrate?.([400, 200, 400]);
    } else {
      Vibration.vibrate([0, 400, 200, 400]);
    }
  } catch {
    // No vibration on this device.
  }
}

// One player for the whole app, like the ringtone in ring.ts: made when the workout screen
// opens and released when it closes.
let beep: AudioPlayer | null = null;
let unlocked = false;

export function prepareRestBeep(): void {
  if (beep) return;
  try {
    beep = createAudioPlayer(require('@/assets/sounds/rest-done.wav'));
  } catch {
    beep = null;
  }
}

export function releaseRestBeep(): void {
  const player = beep;
  beep = null;
  unlocked = false;
  try {
    player?.remove();
  } catch {
    // Already gone.
  }
}

// iPhone Safari only plays a sound later if one was started during a tap, so the first tick
// plays the beep silently. It plays to its end (under a second) rather than being paused
// at once, which would make the browser drop the play request with an error. Phones don't
// need this, and playing there would pause the person's music.
export function unlockRestBeep(): void {
  if (Platform.OS !== 'web' || unlocked || !beep) return;
  unlocked = true;
  try {
    beep.volume = 0;
    beep.play();
  } catch {
    unlocked = false;
  }
}

// The double beep at the end of a rest. On phones the person's music keeps playing (dipped
// on Android) and the silent switch mutes it. Never throws.
export function playRestBeep(): void {
  const player = beep;
  if (!player) return;
  (async () => {
    try {
      if (Platform.OS !== 'web') {
        // iOS refuses duckOthers when the silent switch is respected, so it mixes instead.
        await setAudioModeAsync(
          Platform.OS === 'android'
            ? { playsInSilentMode: false, interruptionMode: 'duckOthers' }
            : { playsInSilentMode: false, interruptionMode: 'mixWithOthers' },
        );
      }
      await player.seekTo(0);
      player.volume = 1;
      player.play();
    } catch {
      // No sound this time; the buzz and the banner still show.
    }
  })();
}

// Seconds left, rounded up, re-rendering every 250 ms while running; 0 when over; null when
// there is no rest. Worked out from the clock, so a throttled timer never runs slow.
export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
