import { supabase } from '@/lib/supabase';

// Workout videos your trainers added to the workouts in your plan. They live in a
// private bucket; you get a short-lived link to watch or save one.

const BUCKET = 'workout-videos';

// Links last an hour; reuse one for most of that.
const links = new Map<string, { url: string; until: number }>();

export async function videoLink(path: string) {
  const known = links.get(path);
  if (known && known.until > Date.now()) return known.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error('This video could not be loaded. Try again in a moment.');
  links.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

// A file name people recognise, like "Voltrix - Back Squat.mp4".
export function videoFileName(title: string, path: string) {
  const extension = path.split('.').pop()?.toLowerCase() || 'mp4';
  const clean =
    title
      .replace(/[^\p{L}\p{N} _-]+/gu, '')
      .trim()
      .slice(0, 60) || 'Workout video';
  return `Voltrix - ${clean}.${extension}`;
}
