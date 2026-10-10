import { Platform, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';

type Props<T extends string> = {
  options: Record<T, string>;
  value: T | null;
  onChange: (value: T | null) => void;
  // When true, tapping the selected chip clears it.
  allowClear?: boolean;
  // When true, chips wrap onto more lines instead of scrolling sideways.
  wrap?: boolean;
};

export function Chips<T extends string>({ options, value, onChange, allowClear, wrap }: Props<T>) {
  const chips = (Object.keys(options) as T[]).map((key) => {
    const selected = key === value;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(selected && allowClear ? null : key)}
        style={({ pressed }) => [
          styles.chip,
          pressed && { backgroundColor: Colors.tintPressed },
          selected && styles.selected,
        ]}>
        <Text variant="callout" style={[styles.text, selected && { color: Colors.background }]}>
          {options[key]}
        </Text>
      </Pressable>
    );
  });
  return wrap ? (
    <View style={[styles.row, styles.wrap]}>{chips}</View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

// Selected chips are inverted (text-coloured), not orange: orange is for the one main action.
const styles = themed(() => ({
  row: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  selected: {
    backgroundColor: Colors.text,
  },
  text: {
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
}));
