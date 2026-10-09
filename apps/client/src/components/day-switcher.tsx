import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
      <Text style={styles.day} accessibilityRole="header">
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
      style={({ pressed }) => [styles.arrow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={24} color={disabled ? Colors.border : Colors.text} />
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
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  arrow: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
}));
