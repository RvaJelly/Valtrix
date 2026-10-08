import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import { Colors } from '@/constants/theme';

// The Voltrix Coach wordmark, with white or black text to suit the theme.
export function Logo({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={
        Colors.scheme === 'light'
          ? require('@/assets/images/logo-coach-dark.png')
          : require('@/assets/images/logo-coach-white.png')
      }
      style={[{ aspectRatio: 2400 / 1025 }, style]}
      contentFit="contain"
      accessibilityLabel="Voltrix Coach"
    />
  );
}
