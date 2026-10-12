import { TermsGate } from '@/components/legal/terms-gate';
import { UpdateApp } from '@/components/legal/update-app';
import { useTerms } from '@/lib/terms';

// The root layout shows only this while the signed-in account hasn't accepted the current Terms, or while
// this build is older than them (the same file in Voltrix and Voltrix Coach).
export default function Terms() {
  const { status } = useTerms();
  return status === 'update' ? <UpdateApp /> : <TermsGate />;
}
