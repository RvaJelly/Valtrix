import { Alert, Platform } from 'react-native';

import { haptic } from '@/lib/haptics';

// Ask before a destructive action, with a short warning buzz on a phone. Alert.alert has no
// buttons on web. `destructive` false for an action that only puts something back (Restore).
export function confirm(title: string, message: string, action: string, destructive = true): Promise<boolean> {
  haptic.warning();
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
