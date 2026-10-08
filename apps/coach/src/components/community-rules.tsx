import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Colors, Spacing, themed } from '@/constants/theme';

const RULES = [
  'Be kind and respectful. No bullying, harassment or hate.',
  'No nudity or sexual content.',
  'No violence, threats or dangerous challenges.',
  'Only post photos and videos you made or are allowed to share, and ask before showing someone else.',
  'No spam or scams.',
];

// The rules everyone agrees to before their first story or reel.
export function CommunityRules() {
  return (
    <View style={{ gap: Spacing.three }}>
      {RULES.map((rule) => (
        <View key={rule} style={styles.rule}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.accentText} />
          <Text style={styles.text}>{rule}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        Posts that break these rules are removed, and people who keep breaking them lose access to Voltrix. Report
        anything that doesn&apos;t belong, and block anyone you don&apos;t want to see.
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
}));
