import { ClientForm } from '@/components/client-form';
import { useGoBack } from '@/lib/nav';
import { addError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

export default function NewClient() {
  const goBack = useGoBack();
  return (
    <ClientForm
      submitLabel="Add client"
      onSubmit={async (input) => {
        // trainer_id defaults to the signed-in trainer in the database.
        const { error } = await supabase.from('clients').insert(input);
        if (error) return addError(error);
        goBack('/clients');
        return null;
      }}
    />
  );
}
