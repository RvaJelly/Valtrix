import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { legalDoc } from '@/components/legal/legal-document';
import { LegalReader } from '@/components/legal/legal-reader';
import { Text, TextLink } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';

// The short version of the Community Rules, word for word (legal-content.ts).
const RULES = legalDoc('community').blocks.find((b) => b.title === 'The short version')?.points ?? [];

// The rules everyone agrees to before their first story or reel: the short version of the Community
// Rules as a calm numbered list, and the full Community Rules (the ones accepted with the Terms) one tap
// away, over the new-post screen.
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
        We have zero tolerance for objectionable content and abusive users. We remove content that breaks these rules,
        and people who break them seriously or repeatedly lose their account.
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
