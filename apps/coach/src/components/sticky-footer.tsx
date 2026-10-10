import type { PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Spacing, themed } from '@/constants/theme';

// The bar under a form or an offer that holds the screen's main action, so it stays in reach while the
// page above it scrolls. On a phone it floats a level above the page (the sheet fill and shadow) and
// keeps clear of the home indicator. On a wide window it is just the button, on the page's own colour,
// lined up with the fields above it.
export function StickyFooter({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= Layout.wide;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.three) }, wide && styles.barWide]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = themed(() => ({
  bar: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.tight,
    backgroundColor: Colors.surfaceHigh,
    boxShadow: Colors.shadowFloating,
    // On dark themes a hairline catches the top edge, where a shadow can't show.
    borderTopWidth: Colors.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
    borderTopColor: Colors.borderStrong,
  },
  barWide: {
    backgroundColor: Colors.background,
    boxShadow: 'none',
    borderTopWidth: 0,
    paddingBottom: Spacing.four,
  },
  // The form above is Layout.maxForm wide including its side gutters, so the button is that less both.
  inner: {
    width: '100%',
    maxWidth: Layout.maxForm - 2 * Spacing.gutter,
    alignSelf: 'center',
    gap: Spacing.tight,
  },
}));
