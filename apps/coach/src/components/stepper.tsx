import { View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { Fonts, Spacing, Tabular } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

// A label, then − value + on one line: a program's weeks, or the weeks a workout runs in.
export function Stepper({
  label,
  value,
  spoken,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
  testID,
}: {
  label: string;
  value: string;
  // What a screen reader says for the value, when the shown one is short.
  spoken?: string;
  onLess: () => void;
  onMore: () => void;
  lessDisabled?: boolean;
  moreDisabled?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }} testID={testID}>
      <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={2}>
        {label}
      </Text>
      <IconButton
        icon="remove"
        variant="tonal"
        label={`Less, ${label}`}
        onPress={() => {
          haptic.select();
          onLess();
        }}
        disabled={lessDisabled}
        testID={testID ? `${testID}-less` : undefined}
      />
      <Text
        variant="body"
        accessibilityLabel={`${label}: ${spoken ?? value}`}
        accessibilityLiveRegion="polite"
        style={[Tabular, { minWidth: 92, textAlign: 'center', fontFamily: Fonts.textSemi }]}>
        {value}
      </Text>
      <IconButton
        icon="add"
        variant="tonal"
        label={`More, ${label}`}
        onPress={() => {
          haptic.select();
          onMore();
        }}
        disabled={moreDisabled}
        testID={testID ? `${testID}-more` : undefined}
      />
    </View>
  );
}
