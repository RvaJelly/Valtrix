import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

// Behind the back arrow: a bar in the page colour, so a long form (the Terms, sign-up with larger text)
// scrolls under it cleanly instead of under the arrow. Sign-in, sign-up and Forgot password.
function HeaderBar() {
  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerBackground: HeaderBar,
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
