import { Alert, Platform } from 'react-native';

import { haptic } from '@/lib/haptics';

// Ask before a destructive action, with a short warning buzz on a phone. Alert.alert has no
// buttons on web.
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  haptic.warning();
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

// Tell the person something that needs no answer.
export function notice(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
