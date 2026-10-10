import { ReminderPicker, SettingsPage } from '@/components/settings-parts';

// When session reminders come. Changes save by themselves.
export default function NotificationSettings() {
  return (
    <SettingsPage>
      <ReminderPicker />
    </SettingsPage>
  );
}
