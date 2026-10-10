import { BlockedList, SettingsPage } from '@/components/settings-parts';
import { Section, Text } from '@/components/ui';

// What trainers see, and the people the client blocked.
export default function PrivacySettings() {
  return (
    <SettingsPage>
      <Section title="Your trainers see">
        <Text variant="callout" tone="secondary">
          Your food diary, workouts, progress (including photos), check-ins, habits and your chats with them.
        </Text>
      </Section>
      <Section title="Blocked people">
        <BlockedList />
      </Section>
    </SettingsPage>
  );
}
