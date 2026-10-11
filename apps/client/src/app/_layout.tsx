import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppLock } from '@/components/app-lock';
import { ToastProvider } from '@/components/toast';
import { useDelayed } from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { FONT_FILES } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { hideWebSplash } from '@/lib/web-splash';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, recovering } = useAuth();
  const { ready } = useSettings();
  // A font that fails to load, or takes more than 3 seconds, falls back to the system font, so it
  // never keeps the app from starting. On the web the fonts load from public/index.html instead.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const [fontsLate, setFontsLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontsLate(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const loading = authLoading || !ready || !(fontsLoaded || fontError || fontsLate);

  useEffect(() => {
    if (fontError) console.warn('Fonts failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    hideWebSplash();
  }, [loading]);

  // Under the splash while the app starts; after a sign-in, while the account loads.
  if (loading) return <Starting />;

  // Clients and trainers can both use Voltrix; trainers use the same login as in Voltrix Coach.
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
        <ToastProvider>
          <RootNavigator />
        </ToastProvider>
        <AppLock />
      </SettingsProvider>
    </AuthProvider>
  );
}

// The splash's V on the page colour, so signing in never leaves a blank screen while the account
// loads; after a second a small spinner says it is still working (a slow or failing connection).
function Starting() {
  const slow = useDelayed(1000);
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}
      accessible
      accessibilityLabel="Loading"
      testID="app-starting">
      {/* Where and how big the web page's splash draws its V, so the two meet without a jump. */}
      <View>
        <VMark height={49} />
        {slow ? (
          <ActivityIndicator
            color={Colors.textSecondary}
            style={{ position: 'absolute', top: 81, alignSelf: 'center' }}
          />
        ) : null}
      </View>
    </View>
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
