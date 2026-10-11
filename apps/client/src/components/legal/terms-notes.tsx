import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { LegalReader } from '@/components/legal/legal-reader';
import { Text } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { dayMonth } from '@/lib/format';
import { useTerms } from '@/lib/terms';

// '11 October 2026'.
export function fullDate(d: Date) {
  return `${dayMonth(d)} ${d.getFullYear()}`;
}

// On the sign-up screen: the Terms this device accepted go with the new account, so instead of a
// second set of ticks, one quiet line and a way to read them again. The same file in both apps.
export function TermsAcceptedLine() {
  const { accepted } = useTerms();
  const [open, setOpen] = useState(false);
  if (!accepted) return null;
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' }} testID="terms-accepted-line">
      <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textSecondary} style={{ marginTop: 1 }} />
      <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
        You accepted the Terms on {fullDate(accepted.at)}.{' '}
        <Text
          tone="primary"
          accessibilityRole="link"
          onPress={() => setOpen(true)}
          testID="terms-read-again"
          style={{ fontFamily: Fonts.textMedium, textDecorationLine: 'underline' }}>
          Read them again
        </Text>
      </Text>
      <LegalReader doc={open ? 'terms' : null} onClose={() => setOpen(false)} />
    </View>
  );
}

// In Settings › Help: which version the person accepted, and when.
export function TermsAcceptedNote() {
  const { accepted } = useTerms();
  if (!accepted) return null;
  return (
    <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }} testID="terms-accepted-note">
      You accepted version {accepted.version} on {fullDate(accepted.at)}.
      {accepted.recorded ? '' : ' It’s saved on this device and added to your account the next time you’re online.'}
    </Text>
  );
}
