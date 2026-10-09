import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

// Saves a workout video to the phone's gallery: download it, then add it to the
// photos and videos. Asks only to add videos, not to see the person's photos.
export async function saveVideo(url: string, fileName: string): Promise<'saved' | 'denied'> {
  const permission = await requestPermissionsAsync(true, ['video']);
  if (!permission.granted) return 'denied';
  const file = await File.downloadFileAsync(url, new File(Paths.cache, fileName), { idempotent: true });
  try {
    await Asset.create(file.uri);
  } finally {
    // The gallery has its own copy now.
    try {
      file.delete();
    } catch {
      // The phone clears its cache by itself.
    }
  }
  return 'saved';
}
