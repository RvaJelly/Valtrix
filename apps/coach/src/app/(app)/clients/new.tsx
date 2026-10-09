import { ClientForm } from '@/components/client-form';
import { clientWithEmail, fullName } from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/nav';
import { saveError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

export default function NewClient() {
  return (
    <ClientForm
      submitLabel="Add client"
      onSubmit={async (input) => {
        const same = await clientWithEmail(input.email);
        if (
          same &&
          !(await confirm(
            `You already have ${fullName(same)}`,
            `${fullName(same)} has the email ${same.email} too. If this is the same person, there's no need to add them again. Add anyway?`,
            'Add anyway',
          ))
        ) {
          return null;
        }
        // trainer_id defaults to the signed-in trainer in the database.
        const { error } = await supabase.from('clients').insert(input);
        if (error) return saveError(error);
        goBack('/clients');
        return null;
      }}
    />
  );
}
