import { Platform, Pressable } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// A word in the stack header's right corner ("Edit"), in the text colour like the header's icons.
export function HeaderTextButton({
  title,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: Spacing.two,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          // The web header has no right inset of its own; the phones' headers do.
          marginRight: Platform.OS === 'web' ? Spacing.tight : 0,
        },
        pressed && { backgroundColor: Colors.tint },
        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
      ]}>
      <Text variant="body" style={{ fontFamily: Fonts.textSemi }}>
        {title}
      </Text>
    </Pressable>
  );
}
