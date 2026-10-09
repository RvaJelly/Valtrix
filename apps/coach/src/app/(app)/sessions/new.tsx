import { useLocalSearchParams } from 'expo-router';

import { SessionForm } from '@/components/session-form';
import { useGoBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { addError } from '@/lib/save-error';
import { fromDayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function NewSession() {
  const goBack = useGoBack();
  const { date, clientId } = useLocalSearchParams<{ date?: string; clientId?: string }>();
  return (
    <SessionForm
      day={fromDayKey(date)}
      initial={clientId ? { client_id: clientId } : undefined}
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
