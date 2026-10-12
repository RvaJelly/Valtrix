import { LegalDocument } from '@/components/legal/legal-document';

// The Community Rules in full: from Settings › Help, and from the short list people agree to before
// their first story or reel. The stack header names the page.
export default function Rules() {
  return <LegalDocument doc="community" />;
}
