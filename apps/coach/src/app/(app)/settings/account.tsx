import { BiometricRow, PasswordForm, SettingsPage } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Section, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// The email the trainer signs in with, the app lock and a new password.
export default function AccountSettings() {
  const { session } = useAuth();
  return (
    <SettingsPage>
      <Section title="Sign-in">
        <Group>
          <ListRow
            title="Email"
            subtitle={session?.user.email ?? '–'}
            leading={<IconTile icon="mail-outline" />}
            last
          />
        </Group>
        <BiometricRow />
        <Text variant="footnote" tone="secondary">
          Your clients, programs and settings are saved to your account, so a new phone brings everything back.
        </Text>
      </Section>
      <Section title="Password">
        <PasswordForm />
      </Section>
    </SettingsPage>
  );
}
