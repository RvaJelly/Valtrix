import { SettingsPage, UnitPickers } from '@/components/settings-parts';

// Kilograms or pounds, centimetres or inches. A choice saves by itself.
export default function UnitSettings() {
  return (
    <SettingsPage>
      <UnitPickers />
    </SettingsPage>
  );
}
