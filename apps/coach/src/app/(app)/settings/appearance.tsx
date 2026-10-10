import { AppearancePickers, SettingsPage } from '@/components/settings-parts';

// Navy, light or automatic, and the colour of the main button. A choice saves by itself.
export default function AppearanceSettings() {
  return (
    <SettingsPage>
      <AppearancePickers />
    </SettingsPage>
  );
}
