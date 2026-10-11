import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LegalReader } from '@/components/legal/legal-reader';
import { Text, TextLink } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';

const RULES = [
  'Be kind and respectful. No bullying, harassment or hate.',
  'No nudity or sexual content.',
  'No violence, threats or dangerous challenges.',
  'Only post photos and videos you made or are allowed to share, and ask before showing someone else.',
  'No spam or scams.',
];

// The rules everyone agrees to before their first story or reel: a calm numbered list, and the full
// Community Rules (the ones accepted with the Terms) one tap away, over the new-post screen.
export function CommunityRules() {
  const [reading, setReading] = useState(false);
  return (
    <View style={{ gap: Spacing.four }}>
      <View>
        {RULES.map((rule, i) => (
          <View key={rule} style={[styles.rule, i < RULES.length - 1 && styles.line]}>
            <Text variant="label" tone="tertiary" style={[styles.number, Tabular]}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <Text variant="callout" style={{ flex: 1 }}>
              {rule}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="footnote" tone="secondary">
        Posts that break these rules are removed, and people who keep breaking them lose access to Voltrix. Report
        anything that doesn&apos;t belong, and block anyone you don&apos;t want to see.
      </Text>
      <TextLink label="Read the full Community Rules" onPress={() => setReading(true)} testID="rules-full" />
      <LegalReader doc={reading ? 'community' : null} onClose={() => setReading(false)} />
    </View>
  );
}

const styles = themed(() => ({
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.tight,
    paddingVertical: Spacing.tight,
  },
  line: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  number: {
    width: 24,
    marginTop: 3,
  },
}));
