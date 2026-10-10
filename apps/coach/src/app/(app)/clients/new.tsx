import { router, useLocalSearchParams } from 'expo-router';

import { ClientForm } from '@/components/client-form';
import { clientWithEmail, fullName } from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { addError } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

// Add a client. Then their page opens with the WhatsApp invite over it. `first`, `last` and `phone`
// fill the form in (adding again someone whose Voltrix account is gone).
export default function NewClient() {
  const params = useLocalSearchParams<{ first?: string; last?: string; phone?: string }>();
  return (
    <ClientForm
      adding
      submitLabel="Add client"
      initial={{
        first_name: params.first ?? '',
        last_name: params.last ?? null,
        phone: params.phone ?? null,
      }}
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
        const { data, error } = await supabase.from('clients').insert(input).select('id').single();
        if (error) return addError(error);
        haptic.success();
        router.replace({ pathname: '/clients/[id]', params: { id: (data as { id: string }).id, invite: '1' } });
        return null;
      }}
    />
  );
}
