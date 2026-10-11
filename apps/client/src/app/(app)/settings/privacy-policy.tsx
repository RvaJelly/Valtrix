import { Stack } from 'expo-router';

import { PrivacyPolicy } from '@/components/privacy-policy';

// Settings › Help › Privacy Policy: how Voltrix uses people's information (the same page in both apps).
export default function PrivacyPolicyPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy Policy' }} />
      <PrivacyPolicy />
    </>
  );
}
