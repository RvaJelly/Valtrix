import { supabase } from '@/lib/supabase';

// A trainer the signed-in client is linked to.
export type Trainer = {
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  client_status: 'active' | 'paused';
};

// A trainer's public profile, as every client can see it.
export type PublicTrainer = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  specialties: string[];
  bio: string | null;
  city: string | null;
  years_experience: number | null;
};

// Every trainer on Voltrix with an active plan.
export async function listTrainers() {
  const { data, error } = await supabase.rpc('list_trainers');
  if (error) throw error;
  return (data ?? []) as PublicTrainer[];
}

export function displayName(t: { full_name: string | null; business_name: string | null }) {
  return t.full_name || t.business_name || 'Trainer';
}

// Link the client to any trainer who saved their email, then list their trainers.
export async function loadTrainers() {
  await supabase.rpc('claim_my_invites');
  const { data, error } = await supabase.rpc('my_trainers');
  if (error) throw error;
  return (data ?? []) as Trainer[];
}
