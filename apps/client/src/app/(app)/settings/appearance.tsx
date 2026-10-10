import { AppearancePickers, SettingsPage } from '@/components/settings-parts';

// Light, dark or automatic, and the colour of the main button. Changes save by themselves.
export default function AppearanceSettings() {
  return (
    <SettingsPage>
      <AppearancePickers />
    </SettingsPage>
  );
}
