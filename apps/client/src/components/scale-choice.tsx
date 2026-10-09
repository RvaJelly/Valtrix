import { Pressable, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { CHECK_IN_QUESTIONS } from '@/lib/progress';

type ScaleChoiceProps = {
  question: (typeof CHECK_IN_QUESTIONS)[number];
  // 1–5, or null before an answer.
  value: number | null;
  onChange: (value: number) => void;
};

// One check-in question: five equal buttons, the number large and its word underneath, so
// every answer fits on a small phone.
export function ScaleChoice({ question, value, onChange }: ScaleChoiceProps) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.label}>{question.label}</Text>
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
              onPress={() => onChange(n)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.selected,
                pressed && !selected && { backgroundColor: Colors.surfaceRaised },
              ]}>
              <Text style={[styles.number, selected && { color: Colors.onAccent }]}>{n}</Text>
              <Text style={[styles.word, selected && { color: Colors.onAccent }]} numberOfLines={2}>
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
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  option: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  number: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  word: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
}));
