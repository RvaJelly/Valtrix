import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppLock } from '@/components/app-lock';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, recovering } = useAuth();
  const { ready } = useSettings();
  const loading = authLoading || !ready;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  // Clients and trainers can both use Valtrix; trainers use the same login as in Valtrix Coach.
  const signedIn = !!session && !recovering;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && recovering}>
        <Stack.Screen name="new-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ThemedStatusBar />
        <RootNavigator />
        <AppLock />
      </SettingsProvider>
    </AuthProvider>
  );
}

function ThemedStatusBar() {
  return <StatusBar style={Colors.scheme === 'light' ? 'dark' : 'light'} />;
}
