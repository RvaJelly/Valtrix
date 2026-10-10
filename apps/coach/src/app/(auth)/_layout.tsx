import { Stack } from 'expo-router';

import { Colors, Fonts } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerTitle: '',
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: Fonts.textSemi, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
