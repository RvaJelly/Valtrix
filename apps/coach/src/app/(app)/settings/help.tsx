import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { BUSINESS } from '@/components/legal/legal-content';
import { legalDoc } from '@/components/legal/legal-document';
import { TermsAcceptedNote } from '@/components/legal/terms-notes';
import { SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text } from '@/components/ui';

// The Terms of Service, the Health and Safety Notice, the Community Rules, the Privacy Policy (the line under each
// fits one line at 360 wide; on a narrower phone or with large text it takes two, never cut short), how to contact
// Voltrix (the email address from BUSINESS, or, while Voltrix is in private testing, a plain line saying the details
// will be shown here), which version of the Terms the person accepted, and the app version.
export default function HelpSettings() {
  return (
    <SettingsPage>
      <Group>
        <ListRow
          title={legalDoc('terms').title}
          subtitle="What you and Voltrix agree to"
          leading={<IconTile icon="document-text-outline" />}
          onPress={() => router.push({ pathname: '/settings/legal/[doc]', params: { doc: 'terms' } })}
          subtitleLines={2}
          testID="help-terms"
        />
        <ListRow
          title={legalDoc('health').title}
          subtitle="When to stop and see a doctor"
          leading={<IconTile icon="fitness-outline" />}
          onPress={() => router.push({ pathname: '/settings/legal/[doc]', params: { doc: 'health' } })}
          subtitleLines={2}
          testID="help-health"
        />
        <ListRow
          title={legalDoc('community').title}
          subtitle="What’s allowed in your posts"
          leading={<IconTile icon="people-outline" />}
          onPress={() => router.push('/rules')}
          subtitleLines={2}
          testID="help-community"
        />
        <ListRow
          title="Privacy Policy"
          subtitle="What we keep and who sees it"
          leading={<IconTile icon="shield-checkmark-outline" />}
          onPress={() => router.push('/settings/privacy-policy')}
          subtitleLines={2}
          testID="help-privacy"
          last
        />
      </Group>
      <Group>
        <ListRow
          title="Contact Voltrix"
          subtitle={
            BUSINESS.email ?? 'Voltrix is in private testing. Contact details will be shown here before public launch.'
          }
          subtitleLines={BUSINESS.email ? 1 : 6}
          leading={<IconTile icon="mail-outline" />}
          onPress={BUSINESS.email ? () => Linking.openURL(`mailto:${BUSINESS.email}`).catch(() => {}) : undefined}
          testID="help-contact"
          last
        />
      </Group>
      <TermsAcceptedNote />
      <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Voltrix Coach {Constants.expoConfig?.version ?? ''}
      </Text>
    </SettingsPage>
  );
}
