import { supabase } from '@/lib/supabase';

// A trainer the signed-in client is linked to.
export type Trainer = {
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  client_status: 'active' | 'paused';
};

// Link the client to any trainer who saved their email, then list their trainers.
export async function loadTrainers() {
  await supabase.rpc('claim_my_invites');
  const { data, error } = await supabase.rpc('my_trainers');
  if (error) throw error;
  return (data ?? []) as Trainer[];
}

export function initials(name: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'V';
}
