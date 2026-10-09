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

// One change at a time, so two can't mix their reminders together.
let queue: Promise<void> = Promise.resolve();

// Reminders are scheduled on this phone, so they arrive even when the app is closed.
export function replaceReminders(reminders: Reminder[]) {
  const next = queue.then(() => setReminders(reminders));
  queue = next.catch(() => {});
  return next;
}

async function setReminders(reminders: Reminder[]) {
  // Only session reminders are replaced: a rest-over alert scheduled during a workout stays.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.sessionId) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
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

const REST_CHANNEL = 'rest';
let restChannelReady = false;

// "Rest over" on the lock screen when the phone is locked during a rest. Only when the person
// already allowed notifications: it never asks in the middle of a workout. Returns the id to
// cancel it with, or null.
export async function scheduleRestAlert(at: Date): Promise<string | null> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return null;
    if (Platform.OS === 'android' && !restChannelReady) {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
      });
      restChannelReady = true;
    }
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Rest over', body: 'Time for your next set.', data: { kind: 'rest' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: REST_CHANNEL },
    });
  } catch {
    return null;
  }
}

export async function cancelRestAlert(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already shown or gone.
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
