import { SettingsPage, UnitPickers } from '@/components/settings-parts';

// Kilograms or pounds, centimetres or inches. Changes save by themselves.
export default function UnitSettings() {
  return (
    <SettingsPage>
      <UnitPickers />
    </SettingsPage>
  );
}
