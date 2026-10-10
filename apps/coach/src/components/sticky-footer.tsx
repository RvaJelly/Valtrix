import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Spacing, themed } from '@/constants/theme';

// The bar under a form or an offer that holds the screen's main action, so it stays in reach while the
// page above it scrolls. It floats a level above the page (the sheet fill and shadow) and keeps clear of
// the home indicator.
export function StickyFooter({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
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
  inner: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    gap: Spacing.tight,
  },
}));
