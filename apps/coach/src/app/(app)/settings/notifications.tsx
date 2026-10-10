import { ReminderPicker, SettingsPage } from '@/components/settings-parts';

// When session reminders come. A choice saves by itself.
export default function NotificationSettings() {
  return (
    <SettingsPage>
      <ReminderPicker />
    </SettingsPage>
  );
}
