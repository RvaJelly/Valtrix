import { supabase } from '@/lib/supabase';

// Removes every photo and video the person uploaded (profile photo, stories and
// reels posted from the Valtrix app), before their account is deleted.
export async function removeAllMyFiles(userId: string) {
  for (const bucket of ['posts', 'avatars']) {
    // A list returns at most 1000 files, so keep going until the folder is empty.
    for (let round = 0; round < 20; round++) {
      const { data } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
      const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
      if (!paths.length) break;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) break;
    }
  }
}
