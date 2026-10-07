import { router } from 'expo-router';

import type { Reminder } from '@/lib/reminders';

// Browsers can only show reminders while the app is open in a tab.
let timers: ReturnType<typeof setTimeout>[] = [];
// Browsers cap timers at about 24.8 days.
const MAX_DELAY = 2 ** 31 - 1;

function supported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function askPermission() {
  if (!supported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function replaceReminders(reminders: Reminder[]) {
  timers.forEach(clearTimeout);
  timers = [];
  if (!supported() || Notification.permission !== 'granted') return;
  for (const r of reminders) {
    const delay = r.at.getTime() - Date.now();
    if (delay <= 0 || delay > MAX_DELAY) continue;
    timers.push(
      setTimeout(() => {
        const note = new Notification(r.title, {
          body: r.body,
          tag: r.sessionId,
        });
        note.onclick = () => {
          window.focus();
          router.push({
            pathname: '/sessions/[id]',
            params: { id: r.sessionId },
          });
        };
      }, delay),
    );
  }
}

export function useOpenFromReminder() {}
