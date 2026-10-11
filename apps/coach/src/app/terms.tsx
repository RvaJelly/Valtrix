import { TermsGate } from '@/components/legal/terms-gate';

// The acceptance screen. The root layout shows only this until the Terms are accepted on this device,
// or by the signed-in account (the same file in Voltrix and Voltrix Coach).
export default function Terms() {
  return <TermsGate />;
}
