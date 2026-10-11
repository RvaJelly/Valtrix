import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { permissionState, replaceReminders } from '@/lib/notify';
import { formatTime, loadSessions, trainerName, type Session } from '@/lib/sessions';

export type Reminder = {
  sessionId: string;
  at: Date;
  title: string;
  body: string;
};

// How long before a session the client is reminded. 0 means no reminders.
export const REMINDER_OPTIONS: Record<string, string> = {
  '0': 'Off',
  '10': '10 min',
  '15': '15 min',
  '30': '30 min',
  '60': '1 hour',
  '120': '2 hours',
  '1440': '1 day',
};

export const DEFAULT_REMINDER = 30;

// Reminders are set for booked sessions up to this many days ahead,
// and refreshed each time the app is opened.
const DAYS_AHEAD = 14;

let lead = DEFAULT_REMINDER;

export function leadLabel(minutes: number) {
  if (minutes >= 1440) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
  if (minutes >= 60) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} min`;
}

export function buildReminders(sessions: Session[], minutes: number, now = new Date()): Reminder[] {
  return sessions
    .filter((s) => s.status === 'scheduled')
    .map((s) => {
      const start = new Date(s.starts_at);
      return {
        sessionId: s.id,
        at: new Date(start.getTime() - minutes * 60_000),
        title: `Training with ${trainerName(s)} in ${leadLabel(minutes)}`,
        body: [`Session at ${formatTime(start)}`, s.online ? 'Online video call' : s.location]
          .filter(Boolean)
          .join(' · '),
      };
    })
    .filter((r) => r.at > now);
}

// Set the reminder time and reschedule. Never asks for permission: signing in isn't the moment.
export async function setReminderLead(minutes: number) {
  lead = minutes;
  // A new sign-in starts without the last person's card; the refresh works out this person's.
  setOffer(false);
  await refreshReminders();
}

// The reminder card on Home: shown once a session is booked, reminders are on and this phone can still ask.
// Its Turn on is what shows the phone's question. Once answered or put away, it isn't offered again on
// this phone; Settings > Notifications still turns them on.
const OFFERED_KEY = 'voltrix.reminderOffered';
let offer = false;
// Put away during this run (the stored flag can take a moment to be written).
let closed = false;
const offerListeners = new Set<() => void>();

function setOffer(next: boolean) {
  if (offer === next) return;
  offer = next;
  offerListeners.forEach((listener) => listener());
}

function subscribeOffer(listener: () => void) {
  offerListeners.add(listener);
  return () => {
    offerListeners.delete(listener);
  };
}

// The reminder time to offer, or null when there's nothing to offer.
export function useReminderOffer(): number | null {
  return useSyncExternalStore(
    subscribeOffer,
    () => (offer ? lead : null),
    () => null,
  );
}

export async function closeReminderOffer() {
  closed = true;
  setOffer(false);
  await AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => {});
}

async function shouldOffer(sessions: Session[], now: Date) {
  if (closed) return false;
  if (!sessions.some((s) => s.status === 'scheduled' && new Date(s.starts_at) > now)) return false;
  if ((await permissionState()) !== 'ask') return false;
  return !(await AsyncStorage.getItem(OFFERED_KEY).catch(() => null));
}

// One refresh at a time: two at once (like a booking saved as the app comes back to the
// front) could set the same reminder twice. A call during a refresh runs it once more
// afterwards, with the newest bookings and reminder time.
let running: Promise<void> | null = null;
let again = false;

// Call after any booking changes so reminders match the calendar.
export function refreshReminders(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await refreshOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function refreshOnce() {
  try {
    if (lead === 0) {
      setOffer(false);
      return await replaceReminders([]);
    }
    const now = new Date();
    const sessions = await loadSessions(now, new Date(now.getTime() + DAYS_AHEAD * 86_400_000));
    await replaceReminders(buildReminders(sessions, lead, now));
    setOffer(await shouldOffer(sessions, now));
  } catch {
    // Reminders are a convenience; never break the app over them.
  }
}
