import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { Colors } from '@/constants/theme';
import { useOpenFromReminder } from '@/lib/notify';
import { refreshReminders, setReminderLead } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';

export default function AppLayout() {
  return (
    <>
      <ReminderSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="clients/new" options={{ title: 'New client', presentation: 'modal' }} />
        <Stack.Screen name="clients/[id]" options={{ title: 'Client' }} />
        <Stack.Screen name="sessions/new" options={{ title: 'Book a session', presentation: 'modal' }} />
        <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
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
        <Stack.Screen name="posts/new" options={{ title: 'New post', presentation: 'modal' }} />
        <Stack.Screen name="rules" options={{ title: 'Community rules' }} />
      </Stack>
    </>
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
