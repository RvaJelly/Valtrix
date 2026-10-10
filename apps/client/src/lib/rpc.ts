import { supabase } from '@/lib/supabase';

// Calls a database function that an older database may not have yet. A missing function
// (PostgREST's PGRST202) answers { missing: true }, so the screen can fall back quietly to what
// it did before; any other problem is thrown as it comes, for plainError or saveError.
export type RpcAnswer<T> = { data: T; missing: false } | { data: null; missing: true };

export async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<RpcAnswer<T>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202') return { data: null, missing: true };
    throw error;
  }
  return { data: data as T, missing: false };
}
