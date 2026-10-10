import { BlockedList, SettingsPage } from '@/components/settings-parts';
import { Section, Text } from '@/components/ui';

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
    </SettingsPage>
  );
}
