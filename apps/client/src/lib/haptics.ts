import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Small taps from the phone for the moments that matter, one word at each call site. Never on
// scroll, navigation or typing. A phone without haptics simply does nothing. The web has its own
// file (haptics.web.ts) that does nothing at all.
const android = Platform.OS === 'android';
const quiet = () => {};

function androidTap(type: Haptics.AndroidHaptics) {
  Haptics.performAndroidHapticsAsync(type).catch(quiet);
}

export const haptic = {
  // A primary action was committed: Start workout, Log set, Send.
  tap() {
    if (android) androidTap(Haptics.AndroidHaptics.Confirm);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(quiet);
  },
  // A choice changed: a chip, a segment, a toggle.
  select(on?: boolean) {
    if (android)
      androidTap(
        on === undefined
          ? Haptics.AndroidHaptics.Segment_Tick
          : on
            ? Haptics.AndroidHaptics.Toggle_On
            : Haptics.AndroidHaptics.Toggle_Off,
      );
    else Haptics.selectionAsync().catch(quiet);
  },
  // Something finished well: a workout, a check-in, a habit goal reached.
  success() {
    if (android) androidTap(Haptics.AndroidHaptics.Confirm);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(quiet);
  },
  // About to do something that can't be undone: asking before a delete.
  warning() {
    if (android) androidTap(Haptics.AndroidHaptics.Reject);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(quiet);
  },
};
