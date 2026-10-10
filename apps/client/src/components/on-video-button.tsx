import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { BRAND, Fonts, Radius, Spacing, themed } from '@/constants/theme';

// A quiet button over video, white on a see-through fill, the same in both themes (the theme's
// secondary button would be dark on dark in light mode).
export function OnVideoButton({ title, onPress, loading }: { title: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: !!loading }}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.button, pressed && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
      <View style={{ opacity: loading ? 0 : 1 }}>
        <Text variant="callout" style={styles.text}>
          {title}
        </Text>
      </View>
      {loading ? <ActivityIndicator color={BRAND.white} style={{ position: 'absolute' }} /> : null}
    </Pressable>
  );
}

const styles = themed(() => ({
  button: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  text: {
    color: BRAND.white,
    fontFamily: Fonts.textSemi,
  },
}));
