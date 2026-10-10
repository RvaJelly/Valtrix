import { ScrollView } from 'react-native';

import { CommunityRules } from '@/components/community-rules';
import { Text } from '@/components/ui';
import { Colors, Layout, Spacing } from '@/constants/theme';

export default function Rules() {
  return (
    <ScrollView
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: Layout.maxClient,
        alignSelf: 'center',
        paddingHorizontal: Spacing.gutter,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.hero,
        gap: Spacing.four,
      }}>
      <Text variant="callout" tone="secondary">
        Everyone on Voltrix agrees to these rules for stories and reels.
      </Text>
      <CommunityRules />
    </ScrollView>
  );
}
