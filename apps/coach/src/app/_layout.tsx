import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { AppLock } from '@/components/app-lock';
import { FONT_FILES } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { hideWebSplash } from '@/lib/web-splash';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, profile, recovering } = useAuth();
  const { ready } = useSettings();
  // A font that fails to load falls back to the system font, so it never keeps the app from starting.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const loading = authLoading || !ready || !(fontsLoaded || fontError);

  useEffect(() => {
    if (fontError) console.warn('Fonts failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    hideWebSplash();
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

// The status bar and the window behind the app follow the theme, so Android never shows a white
// root between screens.
function ThemedStatusBar() {
  const background = Colors.background;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(background).catch(() => {});
  }, [background]);
  return <StatusBar style={Colors.scheme === 'light' ? 'dark' : 'light'} />;
}
