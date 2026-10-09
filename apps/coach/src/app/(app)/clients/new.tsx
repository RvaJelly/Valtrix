import { ClientForm } from '@/components/client-form';
import { goBack } from '@/lib/nav';
import { saveError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

export default function NewClient() {
  return (
    <ClientForm
      submitLabel="Add client"
      onSubmit={async (input) => {
        // trainer_id defaults to the signed-in trainer in the database.
        const { error } = await supabase.from('clients').insert(input);
        if (error) return saveError(error);
        goBack('/clients');
        return null;
      }}
    />
  );
}
