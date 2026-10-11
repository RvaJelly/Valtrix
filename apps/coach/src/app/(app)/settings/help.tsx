import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { BUSINESS } from '@/components/legal/legal-content';
import { legalDoc } from '@/components/legal/legal-document';
import { TermsAcceptedNote } from '@/components/legal/terms-notes';
import { SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text } from '@/components/ui';

// The Terms of Service, the Health and Safety Notice, the Community Rules, the Privacy Policy, how to contact
// Voltrix (once BUSINESS has an email address), which version of the Terms the person accepted, and the
// app version.
export default function HelpSettings() {
  return (
    <SettingsPage>
      <Group>
        <ListRow
          title={legalDoc('terms').title}
          subtitle="What you and Voltrix agree to"
          leading={<IconTile icon="document-text-outline" />}
          onPress={() => router.push({ pathname: '/settings/legal/[doc]', params: { doc: 'terms' } })}
          testID="help-terms"
        />
        <ListRow
          title={legalDoc('health').title}
          subtitle="Training safely, and when to see a doctor"
          leading={<IconTile icon="fitness-outline" />}
          onPress={() => router.push({ pathname: '/settings/legal/[doc]', params: { doc: 'health' } })}
          testID="help-health"
        />
        <ListRow
          title={legalDoc('community').title}
          subtitle="What’s allowed in stories and reels"
          leading={<IconTile icon="people-outline" />}
          onPress={() => router.push('/rules')}
          testID="help-community"
        />
        <ListRow
          title="Privacy Policy"
          subtitle="What Voltrix keeps and who sees it"
          leading={<IconTile icon="shield-checkmark-outline" />}
          onPress={() => router.push('/settings/privacy-policy')}
          testID="help-privacy"
          last
        />
      </Group>
      {BUSINESS.email ? (
        <Group>
          <ListRow
            title="Contact Voltrix"
            subtitle={BUSINESS.email}
            leading={<IconTile icon="mail-outline" />}
            onPress={() => Linking.openURL(`mailto:${BUSINESS.email}`).catch(() => {})}
            testID="help-contact"
            last
          />
        </Group>
      ) : null}
      <TermsAcceptedNote />
      <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Voltrix Coach {Constants.expoConfig?.version ?? ''}
      </Text>
    </SettingsPage>
  );
}
