import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { Sheet } from '@/components/sheet';
import { Group, IconTile, ListRow } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

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

// A list of choices that slides up from the bottom, as rows with neutral icons and a tick on the
// chosen one. Picking one closes it.
export function PickerSheet<T extends string>({ visible, title, options, value, onChange, onClose }: Props<T>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Group>
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <ListRow
              key={option.value}
              title={option.label}
              subtitle={option.detail}
              leading={option.icon ? <IconTile icon={option.icon} /> : undefined}
              trailing={selected ? <Ionicons name="checkmark" size={22} color={Colors.text} /> : null}
              chevron={false}
              accessibilityLabel={option.label}
              accessibilityHint={option.detail}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) haptic.select();
                onClose();
                onChange(option.value);
              }}
              last={i === options.length - 1}
            />
          );
        })}
      </Group>
    </Sheet>
  );
}
