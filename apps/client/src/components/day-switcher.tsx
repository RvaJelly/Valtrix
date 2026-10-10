import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { relativeDay } from '@/lib/days';
import { shiftDay } from '@/lib/food';
import { dayKey } from '@/lib/sessions';

type DaySwitcherProps = {
  // YYYY-MM-DD
  day: string;
  onChange: (day: string) => void;
  // The left arrow stops this many days before today.
  daysBack: number;
  testIDPrefix?: string;
};

// ‹ Today › — the day being logged. It can't go past today.
export function DaySwitcher({ day, onChange, daysBack, testIDPrefix }: DaySwitcherProps) {
  const today = dayKey(new Date());
  const earliest = shiftDay(today, -daysBack);
  const canGoBack = day > earliest;
  const canGoOn = day < today;
  return (
    <View style={styles.row}>
      <Arrow
        icon="chevron-back"
        label="Day before"
        disabled={!canGoBack}
        onPress={() => onChange(shiftDay(day, -1))}
        testID={testIDPrefix ? `${testIDPrefix}-prev` : undefined}
      />
      <Text variant="headline" style={styles.day} accessibilityRole="header">
        {relativeDay(day)}
      </Text>
      <Arrow
        icon="chevron-forward"
        label="Day after"
        disabled={!canGoOn}
        onPress={() => onChange(shiftDay(day, 1))}
        testID={testIDPrefix ? `${testIDPrefix}-next` : undefined}
      />
    </View>
  );
}

function Arrow({
  icon,
  label,
  disabled,
  onPress,
  testID,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.arrow,
        pressed && { backgroundColor: Colors.tintPressed },
        disabled && { opacity: 0.4 },
      ]}>
      <Ionicons name={icon} size={20} color={Colors.text} />
    </Pressable>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  day: {
    flex: 1,
    textAlign: 'center',
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
}));
