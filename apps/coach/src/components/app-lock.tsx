import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { Logo } from '@/components/logo';
import { Body, Button } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { useSettings } from '@/lib/settings';

// The app locks again after it has been in the background this long.
const RELOCK_AFTER_MS = 60_000;

// Covers the app with a lock screen until the trainer uses Face ID or a fingerprint.
// Only shown when they turned it on in Settings.
export function AppLock() {
  const { session, signOut, locked, setLocked } = useAuth();
  const { settings, ready } = useSettings();
  const [name, setName] = useState('Face ID or fingerprint');
  const leftAt = useRef<number | null>(null);
  const active = ready && settings.biometric && !!session && locked;

  useEffect(() => {
    biometricName().then((n) => n && setName(n));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) setLocked(true);
      if (state === 'active') leftAt.current = null;
    });
    return () => sub.remove();
  }, [setLocked]);

  async function unlock() {
    if (await confirmIdentity('Unlock Voltrix Coach')) setLocked(false);
  }

  // Ask straight away when the lock screen appears.
  useEffect(() => {
    if (!active) return;
    confirmIdentity('Unlock Voltrix Coach').then((ok) => ok && setLocked(false));
  }, [active, setLocked]);

  if (!active) return null;
  const cover = (
    <View style={styles.cover}>
      <Logo style={{ width: 200 }} />
      <Body secondary style={{ textAlign: 'center' }}>
        Voltrix Coach is locked.
      </Body>
      <View style={{ alignSelf: 'stretch', gap: Spacing.three }}>
        <Button title={`Unlock with ${name}`} onPress={unlock} />
        <Pressable accessibilityRole="button" onPress={signOut} hitSlop={8}>
          <Text style={styles.link}>Sign in with password instead</Text>
        </Pressable>
      </View>
    </View>
  );
  // The lock must cover everything, including sheets, video players and screens that
  // slide up, which sit above the rest of the app. On iPhone a full-window overlay goes
  // on top of them; on Android a Modal is a window of its own, shown above any open one
  // (and the Back button can't close it).
  if (Platform.OS === 'ios') return <FullWindowOverlay>{cover}</FullWindowOverlay>;
  if (Platform.OS === 'android') {
    return (
      <Modal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
        {cover}
      </Modal>
    );
  }
  return cover;
}

const styles = themed(() => ({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
    padding: Spacing.five,
    backgroundColor: Colors.background,
  },
  link: {
    color: Colors.accentText,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
}));
