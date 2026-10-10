import { useLocalSearchParams } from 'expo-router';

import { SessionForm, type SessionInput } from '@/components/session-form';
import { useGoBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { addError } from '@/lib/save-error';
import { combine, fromDayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

// Book a session. `time`, `duration`, `location` and `online` come from Book again on a session.
export default function NewSession() {
  const goBack = useGoBack();
  const { date, clientId, time, duration, location, online } = useLocalSearchParams<{
    date?: string;
    clientId?: string;
    time?: string;
    duration?: string;
    location?: string;
    online?: string;
  }>();
  const day = fromDayKey(date);
  const initial: Partial<SessionInput> = {
    ...(clientId ? { client_id: clientId } : null),
    ...(time && /^\d{2}:\d{2}$/.test(time) ? { starts_at: combine(day, time).toISOString() } : null),
    ...(duration && Number(duration) > 0 ? { duration_minutes: Number(duration) } : null),
    ...(location ? { location } : null),
    ...(online === '1' ? { online: true } : null),
  };
  return (
    <SessionForm
      day={day}
      initial={Object.keys(initial).length ? initial : undefined}
      submitLabel="Book session"
      onSubmit={async (input) => {
        const { error } = await supabase.from('sessions').insert(input);
        if (error) return addError(error);
        refreshReminders();
        goBack('/calendar');
        return null;
      }}
    />
  );
}
