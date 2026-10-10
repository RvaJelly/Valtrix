import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { Colors, Fonts, Layout } from '@/constants/theme';
import { ChatProvider } from '@/lib/chat-live';
import { useOpenFromReminder } from '@/lib/notify';
import { refreshReminders, setReminderLead } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';

// A screen opened straight from a link, a notification or a page reload on the web still
// has the tabs under it, so it gets a back arrow and the tab bar is one tap away.
export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  return (
    <ChatProvider>
      <ReminderSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: Fonts.textSemi, fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          // Screen readers say "Back", not "(tabs), back" (the tabs group's name). The (tabs)
          // screen's title below is set to 'Back' for the same reason.
          headerBackTitle: 'Back',
          // On a wide window every pushed screen is a centred column, so nothing stretches across a PC
          // screen. The tabs keep the full width for their sidebar.
          contentStyle: {
            backgroundColor: Colors.background,
            width: '100%',
            maxWidth: Layout.maxCoach,
            alignSelf: 'center',
          },
        }}>
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false, title: 'Back', contentStyle: { backgroundColor: Colors.background } }}
        />
        <Stack.Screen name="clients/new" options={{ title: 'New client', presentation: 'modal' }} />
        <Stack.Screen name="clients/[id]" options={{ title: 'Client' }} />
        <Stack.Screen name="sessions/new" options={{ title: 'Book a session', presentation: 'modal' }} />
        <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings/units" options={{ title: 'Workouts and units' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
        <Stack.Screen name="settings/privacy" options={{ title: 'Privacy and blocked people' }} />
        <Stack.Screen name="settings/account" options={{ title: 'Account and password' }} />
        <Stack.Screen name="settings/help" options={{ title: 'Help' }} />
        <Stack.Screen name="admin" options={{ title: 'All trainers' }} />
        <Stack.Screen name="subscribe" options={{ title: 'Subscription', presentation: 'modal' }} />
        <Stack.Screen name="workouts/new" options={{ title: 'New workout', presentation: 'modal' }} />
        <Stack.Screen name="workouts/[id]" options={{ title: 'Workout' }} />
        <Stack.Screen name="exercises/index" options={{ title: 'Exercise library' }} />
        <Stack.Screen name="exercises/new" options={{ title: 'New exercise', presentation: 'modal' }} />
        <Stack.Screen
          name="stories/[author]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
            contentStyle: { backgroundColor: '#000000' },
          }}
        />
        <Stack.Screen
          name="reel/[id]"
          options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}
        />
        <Stack.Screen name="posts/new" options={{ title: 'New post', presentation: 'modal' }} />
        <Stack.Screen name="rules" options={{ title: 'Community rules' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="call"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
            gestureEnabled: false,
            contentStyle: { backgroundColor: '#0B0F1A' },
          }}
        />
      </Stack>
    </ChatProvider>
  );
}

// Keeps session reminders in step with the calendar and the chosen reminder time.
function ReminderSync() {
  const { settings, ready } = useSettings();
  useOpenFromReminder();

  useEffect(() => {
    if (ready) setReminderLead(settings.reminder);
  }, [ready, settings.reminder]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshReminders();
    });
    return () => sub.remove();
  }, []);

  return null;
}
