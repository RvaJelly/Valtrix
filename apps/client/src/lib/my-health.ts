import type { HealthForm, HealthQuestion } from '@/lib/health';
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// The person's own health form. Health answers are special personal information: only the person
// saves, changes or removes them, and their trainers read them only while they coach the person. The
// questions' words come from the database, so both apps show the same text.

// The questions, in order. Null on an older database (no health form yet).
export async function loadQuestions(version?: number): Promise<HealthQuestion[] | null> {
  const answer = await callRpc<HealthQuestion[] | null>(
    'health_questions',
    version == null ? undefined : { p_version: version },
  );
  if (answer.missing) return null;
  return (answer.data ?? [])
    .map((q) => ({ key: q.key, position: Number(q.position), question: q.question }))
    .sort((a, b) => a.position - b.position);
}

// The person's form, null when they haven't filled it in, undefined on an older database.
export async function loadMyForm(): Promise<HealthForm | null | undefined> {
  const answer = await callRpc<HealthForm | null>('my_health_form');
  if (answer.missing) return undefined;
  return answer.data ?? null;
}

// Saves (and signs again) the form. A refusal comes as the database's sentence ("Answer every question
// with yes or no.", "Type your full name to sign.").
export async function saveMyForm(input: {
  answers: Record<string, boolean>;
  details: string;
  emergencyName: string;
  emergencyPhone: string;
  signedName: string;
}): Promise<HealthForm> {
  const { data, error } = await supabase.rpc('save_health_form', {
    p_answers: input.answers,
    p_details: input.details,
    p_emergency_name: input.emergencyName,
    p_emergency_phone: input.emergencyPhone,
    p_signed_name: input.signedName,
  });
  if (error) throw error;
  return data as HealthForm;
}

// "Remove my answers": the person's own row goes, and their trainers no longer see it.
export async function removeMyForm(userId: string): Promise<void> {
  const { error } = await supabase.from('health_forms').delete().eq('user_id', userId);
  if (error) throw error;
}
