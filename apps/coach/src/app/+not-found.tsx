import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.four }}>
      <Stack.Screen options={{ headerShown: false }} />
      <EmptyState
        icon="compass-outline"
        title="This page doesn’t exist"
        message="The link may be old or mistyped."
        action={<Button title="Go to the start" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}
