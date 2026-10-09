import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Reminder } from '@/lib/reminders';

// Show reminders as a banner even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL = 'sessions';

export async function askPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Session reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// Reminders are scheduled on this phone, so they arrive even when the app is closed.
export async function replaceReminders(reminders: Reminder[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.title,
        body: r.body,
        data: { sessionId: r.sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: CHANNEL,
      },
    });
  }
}

// Tapping a reminder opens the sessions in the Plan tab.
export function useOpenFromReminder() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.notification.request.content.data?.sessionId) {
      router.navigate({ pathname: '/plan', params: { view: 'sessions' } });
    }
  }, [response]);
}
