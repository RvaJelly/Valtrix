import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';

export type PickerOption<T extends string> = {
  value: T;
  label: string;
  detail?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

type Props<T extends string> = {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onClose: () => void;
};

// A list of choices that slides up from the bottom. Picking one closes it.
export function PickerSheet<T extends string>({ visible, title, options, value, onChange, onClose }: Props<T>) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={{ maxHeight: height * 0.6 }}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint={option.detail}
                accessibilityState={{ selected }}
                onPress={() => {
                  onClose();
                  onChange(option.value);
                }}
                style={({ pressed }) => [
                  styles.option,
                  selected && { backgroundColor: Colors.surface },
                  pressed && { backgroundColor: Colors.surfaceRaised },
                ]}>
                {option.icon ? (
                  <Ionicons name={option.icon} size={22} color={selected ? Colors.accentText : Colors.text} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{option.label}</Text>
                  {option.detail ? <Text style={styles.detail}>{option.detail}</Text> : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={22} color={Colors.accentText} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  detail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
}));
