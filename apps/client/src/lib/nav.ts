import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';
import { useCallback } from 'react';

// A screen opened from a link, a notification or a page reload has the tabs under it, but
// the person never saw them there. True once the tabs have shown.
let tabsShown = false;

// For the tabs layout.
export function useTabsShown() {
  useFocusEffect(
    useCallback(() => {
      tabsShown = true;
    }, []),
  );
}

// Closes the screen after saving or sharing: back to where the person came from. A screen
// opened from a link has nothing they came from under it (only the unseen tabs), so
// `fallback` opens instead, like the Reels tab after sharing a reel.
export function useGoBack() {
  const navigation = useNavigation();
  return useCallback(
    (fallback: Href = '/') => {
      const state = navigation.getState();
      const below = state && state.index > 0 ? state.routes[state.index - 1] : undefined;
      if (below && (below.name !== '(tabs)' || tabsShown)) router.back();
      // Goes back to the tabs and opens the right one, or opens `fallback` in place of this screen.
      else router.dismissTo(fallback);
    },
    [navigation],
  );
}
