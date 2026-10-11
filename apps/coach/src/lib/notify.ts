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
let channelReady = false;

// Android needs the reminders' channel before a reminder can be set. Making it asks the person nothing.
async function ensureChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Session reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

// Whether reminders can show: 'granted'; 'ask' when the phone can still ask the person; 'blocked' when
// only the phone's settings can turn them on.
export async function permissionState(): Promise<'granted' | 'ask' | 'blocked'> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain ? 'ask' : 'blocked';
}

// The phone's own question. Only ever from a button the person pressed (Turn on in the reminder card on
// Home, or a reminder time in Settings): asked cold, many say no, and after two refusals Android stops asking.
export async function askPermission() {
  await ensureChannel();
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
  await ensureChannel();
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

// The reminder tap already acted on. The phone keeps the last tap until it is cleared, and every
// screen is drawn again after a theme change or a new sign-in, so it would open that session again.
let handled: string | null = null;

// Tapping a reminder opens that session, once.
export function useOpenFromReminder() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = response.notification.request.identifier;
    if (key === handled) return;
    handled = key;
    Notifications.clearLastNotificationResponse();
    const id = response.notification.request.content.data?.sessionId;
    if (typeof id === 'string') router.push({ pathname: '/sessions/[id]', params: { id } });
  }, [response]);
}
