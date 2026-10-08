import { Pressable, ScrollView, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';

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
        style={[styles.chip, selected && styles.selected]}>
        <Text style={[styles.text, selected && { color: Colors.onAccent }]}>{options[key]}</Text>
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

const styles = themed(() => ({
  row: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  text: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
}));
