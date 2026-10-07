import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props<T extends string> = {
  options: Record<T, string>;
  value: T | null;
  onChange: (value: T | null) => void;
  // When true, tapping the selected chip clears it.
  allowClear?: boolean;
};

export function Chips<T extends string>({ options, value, onChange, allowClear }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {(Object.keys(options) as T[]).map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected && allowClear ? null : key)}
            style={[styles.chip, selected && styles.selected]}>
            <Text style={[styles.text, selected && { color: Colors.black }]}>{options[key]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
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
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
  },
  text: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
