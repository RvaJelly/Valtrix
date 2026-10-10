import { router } from 'expo-router';

import { BlockedList, SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Section, Text } from '@/components/ui';

// What clients see of the trainer, and the people the trainer blocked.
export default function PrivacySettings() {
  return (
    <SettingsPage>
      <Section title="Clients see">
        <Text variant="callout" tone="secondary">
          Your profile, and how far away you are.
        </Text>
      </Section>
      <Section title="Blocked people">
        <BlockedList />
      </Section>
      <Group>
        <ListRow
          title="How Voltrix uses your information"
          titleLines={2}
          leading={<IconTile icon="shield-checkmark-outline" />}
          onPress={() => router.push('/settings/privacy-policy')}
          testID="privacy-policy-row"
          last
        />
      </Group>
    </SettingsPage>
  );
}
