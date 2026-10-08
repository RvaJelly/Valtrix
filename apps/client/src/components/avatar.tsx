import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function initialsOf(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'V';
}

// A round profile photo, or the person's initials when there is no photo.
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
    <View style={[round, { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent }]}>
      <Text style={{ color: Colors.onAccent, fontSize: size * 0.36, fontWeight: '800' }}>{initialsOf(name)}</Text>
    </View>
  );
}
