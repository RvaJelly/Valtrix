import Constants from 'expo-constants';
import { router } from 'expo-router';

import { SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text } from '@/components/ui';

// The community rules and the app version.
export default function HelpSettings() {
  return (
    <SettingsPage>
      <Group>
        <ListRow
          title="Community rules"
          subtitle="What’s allowed in stories and reels"
          leading={<IconTile icon="people-outline" />}
          onPress={() => router.push('/rules')}
          last
        />
      </Group>
      <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Voltrix Coach {Constants.expoConfig?.version ?? ''}
      </Text>
    </SettingsPage>
  );
}
