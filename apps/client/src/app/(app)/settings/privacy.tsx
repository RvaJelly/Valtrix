import { router } from 'expo-router';

import { BlockedList, SettingsPage, useMyTrainers } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Section, Text } from '@/components/ui';

// What trainers see, and the people the client blocked. Someone with no trainer yet reads what one
// will see when they join.
export default function PrivacySettings() {
  const { trainers } = useMyTrainers();
  const none = trainers?.length === 0;
  return (
    <SettingsPage>
      <Section title={none ? 'When you join a trainer' : 'Your trainers see'}>
        <Text variant="callout" tone="secondary">
          {none
            ? 'They will see your food diary, workouts, progress (including photos), check-ins, habits, your health form if you filled it in, your sessions with them and your chats with them.'
            : 'Your food diary, workouts, progress (including photos), check-ins, habits, your health form if you filled it in, your sessions with them and your chats with them.'}
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
