import { ScrollView } from 'react-native';

import { CommunityRules } from '@/components/community-rules';
import { Body } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export default function Rules() {
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.four }}>
      <Body secondary>Everyone on Valtrix agrees to these rules for stories and reels.</Body>
      <CommunityRules />
    </ScrollView>
  );
}
