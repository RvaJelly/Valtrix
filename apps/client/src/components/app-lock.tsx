import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { Button, Text } from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { useSettings } from '@/lib/settings';

// The app locks again after it has been in the background this long.
const RELOCK_AFTER_MS = 60_000;

// True while the lock screen covers the app.
export function useAppLocked() {
  const { session, locked } = useAuth();
  const { settings, ready } = useSettings();
  return ready && settings.biometric && !!session && locked;
}

// Covers the app with a lock screen until the client uses Face ID or a fingerprint.
// Only shown when they turned it on in Settings.
export function AppLock() {
  const { signOut, setLocked } = useAuth();
  const [name, setName] = useState('Face ID or fingerprint');
  const leftAt = useRef<number | null>(null);
  const active = useAppLocked();

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
    if (await confirmIdentity('Unlock Voltrix')) setLocked(false);
  }

  // Ask straight away when the lock screen appears.
  useEffect(() => {
    if (!active) return;
    confirmIdentity('Unlock Voltrix').then((ok) => ok && setLocked(false));
  }, [active, setLocked]);

  if (!active) return null;
  const cover = (
    <View style={styles.cover}>
      <View style={styles.middle}>
        <VMark height={48} />
        <Text variant="largeTitle" accessibilityRole="header" style={{ marginTop: Spacing.four }}>
          Locked
        </Text>
        <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
          Use {name} to open Voltrix.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Unlock" icon="lock-open-outline" onPress={unlock} accessibilityLabel={`Unlock with ${name}`} />
        <Button title="Sign in with password instead" variant="ghost" onPress={signOut} />
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
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.hero,
    paddingBottom: Spacing.five,
    backgroundColor: Colors.background,
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actions: {
    width: '100%',
    maxWidth: Layout.maxWelcome,
    gap: Spacing.two,
  },
}));
