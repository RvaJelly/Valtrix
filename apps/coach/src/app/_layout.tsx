import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppLock } from '@/components/app-lock';
import { Colors } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, profile, recovering } = useAuth();
  const { ready } = useSettings();
  const loading = authLoading || !ready;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  // Client accounts belong in the Voltrix client app.
  const isClient = profile?.role === 'client';
  const signedIn = !!session && !recovering && !isClient;
  const setUp = !!profile?.business_name;
  const hasAccess = coachAccess(profile).kind !== 'none';
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
      <Stack.Protected guard={signedIn && !setUp}>
        <Stack.Screen name="(setup)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && setUp && hasAccess}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && setUp && !hasAccess}>
        <Stack.Screen name="(paywall)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !recovering && isClient}>
        <Stack.Screen name="wrong-app" />
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
