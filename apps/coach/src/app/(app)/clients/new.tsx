import { router } from 'expo-router';

import { ClientForm } from '@/components/client-form';
import { supabase } from '@/lib/supabase';

export default function NewClient() {
  return (
    <ClientForm
      submitLabel="Add client"
      onSubmit={async (input) => {
        // trainer_id defaults to the signed-in trainer in the database.
        const { error } = await supabase.from('clients').insert(input);
        if (error) return error.message;
        router.back();
        return null;
      }}
    />
  );
}
