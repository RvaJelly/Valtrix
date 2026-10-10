import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { BRAND, Colors } from '@/constants/theme';

// The Rising V from the brand kit, drawn with two slanted bars so it follows the theme and needs no
// image (the kit's viewBox is x 0..85.8, y -20..100). The rising stroke is always Voltrix orange;
// `mono` draws both strokes in `color`, for the faint watermark on the welcome screens.
export function VMark({
  height,
  color,
  mono,
  style,
}: {
  height: number;
  color?: ColorValue;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = height / 120;
  const ink = color ?? Colors.text;
  const bar = { position: 'absolute' as const, width: 22 * s };
  return (
    <View
      style={[{ width: 85.8 * s, height }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      <View
        style={[
          bar,
          { left: 14.5 * s, top: 20 * s, height: 100 * s, backgroundColor: ink, transform: [{ skewX: '16.17deg' }] },
        ]}
      />
      <View
        style={[
          bar,
          {
            left: 46.4 * s,
            top: 0,
            height: 120 * s,
            backgroundColor: mono ? ink : BRAND.orange,
            transform: [{ skewX: '-16.17deg' }],
          },
        ]}
      />
    </View>
  );
}
