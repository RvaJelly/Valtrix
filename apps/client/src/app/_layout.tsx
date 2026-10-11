import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';

import { AppLock } from '@/components/app-lock';
import { ToastProvider } from '@/components/toast';
import { FONT_FILES } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { TermsProvider, useTerms } from '@/lib/terms';
import { hideWebSplash } from '@/lib/web-splash';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, recovering } = useAuth();
  const { ready } = useSettings();
  const terms = useTerms();
  // A font that fails to load, or takes more than 3 seconds, falls back to the system font, so it
  // never keeps the app from starting. On the web the fonts load from public/index.html instead.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const [fontsLate, setFontsLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontsLate(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const loading = authLoading || !ready || !terms.ready || !(fontsLoaded || fontError || fontsLate);

  useEffect(() => {
    if (fontError) console.warn('Fonts failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    hideWebSplash();
  }, [loading]);

  if (loading) return null;

  // The Terms come first, before signing in and before the app (a new version asks again).
  const gated = terms.gated;
  // Clients and trainers can both use Voltrix; trainers use the same login as in Voltrix Coach.
  const signedIn = !!session && !recovering;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={gated}>
        <Stack.Screen name="terms" />
      </Stack.Protected>
      <Stack.Protected guard={!gated && !session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!gated && !!session && recovering}>
        <Stack.Screen name="new-password" />
      </Stack.Protected>
      <Stack.Protected guard={!gated && signedIn}>
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
          <TermsProvider app="client">
            <RootNavigator />
          </TermsProvider>
        </ToastProvider>
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
