import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import { Colors } from '@/constants/theme';

// The Valtrix wordmark, with white or black text to suit the theme.
export function Logo({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={
        Colors.scheme === 'light' ? require('@/assets/images/logo-dark.png') : require('@/assets/images/logo-white.png')
      }
      style={[{ aspectRatio: 2400 / 835 }, style]}
      contentFit="contain"
      accessibilityLabel="Valtrix"
    />
  );
}
