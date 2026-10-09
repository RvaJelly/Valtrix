import { useLocalSearchParams } from 'expo-router';

import { SessionForm } from '@/components/session-form';
import { goBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { saveError } from '@/lib/save-error';
import { fromDayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function NewSession() {
  const { date, clientId } = useLocalSearchParams<{ date?: string; clientId?: string }>();
  return (
    <SessionForm
      day={fromDayKey(date)}
      initial={clientId ? { client_id: clientId } : undefined}
      submitLabel="Book session"
      onSubmit={async (input) => {
        const { error } = await supabase.from('sessions').insert(input);
        if (error) return saveError(error);
        refreshReminders();
        goBack('/calendar');
        return null;
      }}
    />
  );
}
