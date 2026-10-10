import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export function initialsOf(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'V';
}

// The same person always gets the same calm fill: slate, stone, sage, clay or plum.
function monogramFill(name: string | null | undefined) {
  let sum = 0;
  for (const ch of name ?? '') sum += ch.charCodeAt(0);
  return Colors.monogram[sum % Colors.monogram.length];
}

// A round profile photo, or the person's initials on a neutral fill when there is no photo.
export function Avatar({ url, name, size = 56 }: { url?: string | null; name?: string | null; size?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[round, { backgroundColor: Colors.surfaceRaised }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name ? `Photo of ${name}` : 'Profile photo'}
      />
    );
  }
  return (
    <View style={[round, { alignItems: 'center', justifyContent: 'center', backgroundColor: monogramFill(name) }]}>
      <Text
        maxFontSizeMultiplier={1}
        style={{
          color: Colors.text,
          fontFamily: Fonts.textSemi,
          fontSize: Math.round(size * 0.38),
          letterSpacing: 0.5,
        }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
