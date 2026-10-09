import { askPermission, replaceReminders } from '@/lib/notify';
import { formatTime, SESSION_COLUMNS, sessionName, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export type Reminder = {
  sessionId: string;
  at: Date;
  title: string;
  body: string;
};

// How long before a session the trainer is reminded. 0 means no reminders.
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
        title: `${sessionName(s)} in ${leadLabel(minutes)}`,
        body: [`Session at ${formatTime(start)}`, s.online ? 'Online video call' : s.location]
          .filter(Boolean)
          .join(' · '),
      };
    })
    .filter((r) => r.at > now);
}

// Set the reminder time and reschedule. Asks for permission the first time.
export async function setReminderLead(minutes: number) {
  lead = minutes;
  if (minutes === 0) return replaceReminders([]);
  if (!(await askPermission())) return;
  await refreshReminders();
}

// Call after any booking changes so reminders match the calendar.
export async function refreshReminders() {
  try {
    if (lead === 0) return await replaceReminders([]);
    const now = new Date();
    const { data, error } = await supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('status', 'scheduled')
      .gte('starts_at', now.toISOString())
      .lt('starts_at', new Date(now.getTime() + DAYS_AHEAD * 86_400_000).toISOString())
      .order('starts_at');
    if (error) return;
    await replaceReminders(buildReminders(data as unknown as Session[], lead, now));
  } catch {
    // Reminders are a convenience; never break the app over them.
  }
}
