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
        style={styles.target}>
        {({ pressed }) => (
          <View style={[styles.chip, pressed && { backgroundColor: Colors.tintPressed }, selected && styles.selected]}>
            <Text variant="callout" style={[styles.text, selected && { color: Colors.background }]}>
              {options[key]}
            </Text>
          </View>
        )}
      </Pressable>
    );
  });
  return wrap ? (
    <View style={[styles.row, styles.wrap]}>{chips}</View>
  ) : (
    // A sideways row runs to the screen edges (pages and cards both pad 20), so a chip cut by the
    // edge reads as "more this way" rather than as clipped.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={[styles.row, styles.bleedContent]}>
      {chips}
    </ScrollView>
  );
}

// Selected chips are inverted (text-coloured), not orange: orange is for the one main action.
// Each chip is drawn 36 high inside a 44 high touch target (hitSlop does nothing on the web).
const styles = themed(() => ({
  row: {
    columnGap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bleed: {
    marginHorizontal: -Spacing.gutter,
  },
  bleedContent: {
    paddingHorizontal: Spacing.gutter,
  },
  target: {
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  selected: {
    backgroundColor: Colors.text,
  },
  text: {
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
}));
