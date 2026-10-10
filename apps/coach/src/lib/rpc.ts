import { supabase } from '@/lib/supabase';

// A database function's answer, or `missing` when the database doesn't have that function yet (an
// older database: the app carries on without the part that needs it).
export type RpcAnswer<T> = { data: T; missing: false } | { data: null; missing: true };

// Calls a database function. PGRST202 (no such function) answers { missing: true }; any other
// error is thrown as it comes, for plainError or addError to put into words.
export async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<RpcAnswer<T>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202') return { data: null, missing: true };
    throw error;
  }
  return { data: data as T, missing: false };
}

export const NOT_YET = 'That isn’t ready yet. Try again later.';

// The same for a function the screen can't do without: missing reads as an error too.
export async function rpcOrThrow<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const answer = await callRpc<T>(name, args);
  if (answer.missing) throw new Error(NOT_YET);
  return answer.data;
}
