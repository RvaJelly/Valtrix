import type { HealthForm, HealthQuestion } from '@/lib/health';
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// A client's health form, as their trainer sees it: only while they coach the person (the database
// answers null otherwise), and the trainer's own note of a doctor's OK on the client row.

// The questions of a form version, in order, or null on an older database. Errors are thrown.
export async function loadQuestions(version = 1): Promise<HealthQuestion[] | null> {
  const answer = await callRpc<HealthQuestion[]>('health_questions', { p_version: version });
  if (answer.missing) return null;
  return (answer.data ?? [])
    .map((q) => ({ ...q, position: Number(q.position) }))
    .sort((a, b) => a.position - b.position);
}

// The client's form, or null when they haven't filled it in or the trainer may not read it now.
export async function loadClientForm(clientId: string): Promise<HealthForm | null> {
  const answer = await callRpc<HealthForm | null>('client_health_form', { p_client: clientId });
  if (answer.missing || !answer.data) return null;
  return { ...answer.data, answers: answer.data.answers ?? {} };
}

// The day the client's doctor said training is fine ('YYYY-MM-DD'), or null to clear it.
export async function saveDoctorOk(clientId: string, day: string | null): Promise<void> {
  const { error } = await supabase.from('clients').update({ doctor_ok_on: day }).eq('id', clientId);
  if (error) throw error;
}
