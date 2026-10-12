import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { LEGAL_DOCS } from '@/components/legal/legal-content';
import { LegalDocument } from '@/components/legal/legal-document';

// Settings › Help › Terms of Service or Health and Safety (the same page in both apps). The Community
// Rules have their own address, /rules, and the Privacy page /settings/privacy-policy.
export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const found = LEGAL_DOCS.find((d) => d.id === doc);
  if (!found) return <Redirect href="/settings/help" />;
  return (
    <>
      <Stack.Screen options={{ title: found.title }} />
      <LegalDocument doc={found.id} />
    </>
  );
}
