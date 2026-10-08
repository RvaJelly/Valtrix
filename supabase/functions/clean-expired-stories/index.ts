// Deletes stories more than 24 hours old, with their photos and videos. Feeds
// already hide a story once it expires; this removes it for good. An hourly job
// in the database calls it (see the clean_expired_stories migration).
//
// Anyone may call it, so it is deployed without a login check: it only ever
// removes stories that have already expired, and calling it again just finds
// nothing left to do.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'posts';
// Small batches keep the list of ids short enough for one request.
const BATCH = 100;
// Up to 2,000 stories a run; the next hourly run picks up anything left over.
const MAX_ROUNDS = 20;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return reply({ error: 'Use POST' }, 405);

  // Only stories that had already expired when this run started.
  const cutoff = new Date().toISOString();
  let stories = 0;
  let files = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await supabase
      .from('posts')
      .select('id, media_path')
      .eq('kind', 'story')
      .lt('expires_at', cutoff)
      .order('expires_at')
      .limit(BATCH);
    if (error) return reply({ error: error.message, stories, files }, 500);
    if (!data.length) break;

    // Files first. If removing them fails, the stories stay and the next run tries
    // again. A file that is already gone is simply skipped.
    const removed = await supabase.storage.from(BUCKET).remove(data.map((post) => post.media_path));
    if (removed.error) return reply({ error: removed.error.message, stories, files }, 500);
    files += removed.data?.length ?? 0;

    // Likes and reports on these stories go with them (on delete cascade).
    const deleted = await supabase
      .from('posts')
      .delete({ count: 'exact' })
      .in(
        'id',
        data.map((post) => post.id),
      )
      .eq('kind', 'story')
      .lt('expires_at', cutoff);
    if (deleted.error) return reply({ error: deleted.error.message, stories, files }, 500);
    stories += deleted.count ?? 0;

    if (data.length < BATCH) break;
  }

  return reply({ stories, files });
});
