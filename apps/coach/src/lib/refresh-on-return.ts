import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';

// Runs `refresh` again while the screen shows, each time the app comes back to the
// front, or in a browser the window is clicked on again, so a page left open on a
// computer picks up what changed meanwhile (like a client joining the app).
export function useRefreshOnReturn(refresh: () => void) {
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      // Coming back to a browser tab fires both, so one refresh is enough.
      const again = () => {
        if (Date.now() - last.current < 2000) return;
        last.current = Date.now();
        refresh();
      };
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') again();
      });
      if (Platform.OS === 'web') window.addEventListener('focus', again);
      return () => {
        subscription.remove();
        if (Platform.OS === 'web') window.removeEventListener('focus', again);
      };
    }, [refresh]),
  );
}
