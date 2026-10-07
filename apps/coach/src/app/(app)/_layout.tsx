import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.black },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.black },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="clients/new" options={{ title: 'New client', presentation: 'modal' }} />
      <Stack.Screen name="clients/[id]" options={{ title: 'Client' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
    </Stack>
  );
}
