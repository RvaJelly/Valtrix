import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { Colors } from '@/constants/theme';
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
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          // Screen readers say "Back", not "(tabs), back" (the tabs group's name). The (tabs)
          // screen's title below is set to 'Back' for the same reason.
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
        <Stack.Screen name="trainers/index" options={{ title: 'Trainers' }} />
        <Stack.Screen name="trainers/[id]" options={{ title: 'Trainer' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="workouts/[id]" options={{ title: 'Workout' }} />
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
