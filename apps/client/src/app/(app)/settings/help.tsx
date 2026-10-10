import Constants from 'expo-constants';
import { router } from 'expo-router';

import { SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text } from '@/components/ui';

// The community rules, the privacy page and the app version.
export default function HelpSettings() {
  return (
    <SettingsPage>
      <Group>
        <ListRow
          title="Community rules"
          subtitle="How we look after each other"
          leading={<IconTile icon="people-outline" />}
          onPress={() => router.push('/rules')}
        />
        <ListRow
          title="Privacy"
          subtitle="What Voltrix keeps and who sees it"
          leading={<IconTile icon="shield-checkmark-outline" />}
          onPress={() => router.push('/settings/privacy-policy')}
          testID="help-privacy"
          last
        />
      </Group>
      <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Voltrix {Constants.expoConfig?.version ?? ''}
      </Text>
    </SettingsPage>
  );
}
