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
import { coachAccess } from '@/lib/access';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { TermsProvider, useTerms } from '@/lib/terms';
import { hideWebSplash } from '@/lib/web-splash';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading: authLoading, session, profile, recovering } = useAuth();
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
  const loading = authLoading || !ready || terms.status === 'loading' || !(fontsLoaded || fontError || fontsLate);

  useEffect(() => {
    if (fontError) console.warn('Fonts failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    hideWebSplash();
  }, [loading]);

  if (loading) return null;

  // Welcome, sign-in and sign-up come first. A signed-in account that hasn't accepted the current Terms
  // sees them before anything else, and a build older than the Terms asks to be updated.
  const update = terms.status === 'update';
  const gated = update || terms.status === 'accept';
  // Client accounts belong in the Voltrix client app.
  const isClient = profile?.role === 'client';
  const signedIn = !gated && !!session && !recovering && !isClient;
  const setUp = !!profile?.business_name;
  const hasAccess = coachAccess(profile).kind !== 'none';
  // This version needs a newer database than the one it found: wait on the update screen.
  const waiting = signedIn && !!profile?.older_database;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={gated}>
        <Stack.Screen name="terms" />
      </Stack.Protected>
      <Stack.Protected guard={!update && !session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!gated && !!session && recovering}>
        <Stack.Screen name="new-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !waiting && !setUp}>
        <Stack.Screen name="(setup)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !waiting && setUp && hasAccess}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !waiting && setUp && !hasAccess}>
        <Stack.Screen name="(paywall)" />
      </Stack.Protected>
      <Stack.Protected guard={waiting}>
        <Stack.Screen name="update-pending" />
      </Stack.Protected>
      <Stack.Protected guard={!gated && !!session && !recovering && isClient}>
        <Stack.Screen name="wrong-app" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // The Terms sit above the settings: a theme change redraws everything under the settings, and the
  // Terms loading again there would put the app back on its first screen.
  return (
    <AuthProvider>
      <TermsProvider app="coach">
        <SettingsProvider>
          <ThemedStatusBar />
          <ToastProvider>
            <RootNavigator />
          </ToastProvider>
          <AppLock />
        </SettingsProvider>
      </TermsProvider>
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
