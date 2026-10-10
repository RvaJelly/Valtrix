import { BlockedList, SettingsPage, useMyTrainers } from '@/components/settings-parts';
import { Section, Text } from '@/components/ui';

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
            ? 'They will see your food diary, workouts, progress (including photos), check-ins, habits and your chats with them.'
            : 'Your food diary, workouts, progress (including photos), check-ins, habits and your chats with them.'}
        </Text>
      </Section>
      <Section title="Blocked people">
        <BlockedList />
      </Section>
    </SettingsPage>
  );
}
