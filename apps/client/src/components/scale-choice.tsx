import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import type { CHECK_IN_QUESTIONS } from '@/lib/progress';

type ScaleChoiceProps = {
  question: (typeof CHECK_IN_QUESTIONS)[number];
  // 1–5, or null before an answer.
  value: number | null;
  onChange: (value: number) => void;
};

// One check-in question: five equal buttons, the number large and its word underneath, so
// every answer fits on a small phone. The chosen one fills with the text colour, like a selected
// chip: a choice is not the screen's main action, so it is never orange.
export function ScaleChoice({ question, value, onChange }: ScaleChoiceProps) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text variant="rowTitle">{question.label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={question.label}>
        {question.words.map((word, i) => {
          const n = i + 1;
          const selected = value === n;
          return (
            <Pressable
              key={word}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${question.short}: ${n}, ${word.toLowerCase()}`}
              testID={`checkin-${question.key}-${n}`}
              onPress={() => {
                if (!selected) haptic.select();
                onChange(n);
              }}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.selected : pressed && { backgroundColor: Colors.tintPressed },
              ]}>
              <Text
                variant="headline"
                style={[Tabular, { textAlign: 'center' }, selected && { color: Colors.background }]}
                maxFontSizeMultiplier={1.3}>
                {n}
              </Text>
              <Text
                variant="footnote"
                tone="secondary"
                style={[styles.word, selected && { color: Colors.background }]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.2}>
                {word}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  option: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: 2,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.tint,
  },
  selected: {
    backgroundColor: Colors.text,
  },
  word: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.textMedium,
    textAlign: 'center',
  },
}));
