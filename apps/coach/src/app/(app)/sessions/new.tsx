import { router, useLocalSearchParams } from 'expo-router';

import { SessionForm } from '@/components/session-form';
import { refreshReminders } from '@/lib/reminders';
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
        if (error) return error.message;
        refreshReminders();
        router.back();
        return null;
      }}
    />
  );
}
