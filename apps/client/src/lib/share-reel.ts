import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { mediaUrl, type Reel } from '@/lib/posts';

export type ShareResult = 'shared' | 'copied' | 'cancelled';

// The browser wouldn't copy the link; the sheet shows it so it can be copied by hand.
export class CopyFailedError extends Error {
  url: string;
  constructor(url: string) {
    super("Couldn't copy the link");
    this.url = url;
  }
}

const TYPES: Record<string, { mime: string; uti: string }> = {
  mp4: { mime: 'video/mp4', uti: 'public.mpeg-4' },
  mov: { mime: 'video/quicktime', uti: 'com.apple.quicktime-movie' },
  webm: { mime: 'video/webm', uti: 'org.webmproject.webm' },
};

// Can this browser open the system share sheet? Otherwise the link is copied.
export function canShareLink() {
  return Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
}

// Shares a reel to other apps (WhatsApp, Instagram and so on). On a phone the video is
// saved to the app's cache first so the other app gets the video itself, not a link.
// On the web the browser's share sheet gets the video's link, or the link is copied.
// stillWanted is checked once the video has downloaded: the person may have closed the
// share sheet meanwhile, and the phone's share menu shouldn't pop up out of nowhere.
export async function shareReelToApps(
  reel: Pick<Reel, 'id' | 'media_path' | 'caption'>,
  stillWanted: () => boolean = () => true,
): Promise<ShareResult> {
  const url = mediaUrl(reel.media_path);
  if (Platform.OS === 'web') return shareLinkOnWeb(url, reel.caption);

  const extension = reel.media_path.split('.').pop()?.toLowerCase() ?? 'mp4';
  const type = TYPES[extension] ?? TYPES.mp4;
  if (!(await Sharing.isAvailableAsync())) {
    await Share.share({ message: url, url });
    return 'shared';
  }
  const file = new File(Paths.cache, `voltrix-reel-${reel.id}.${extension}`);
  if (!file.exists) {
    try {
      await File.downloadFileAsync(url, file, { idempotent: true });
    } catch (e) {
      // Android may leave half a file behind; never share that.
      if (file.exists) file.delete();
      throw e;
    }
  }
  if (!stillWanted()) return 'cancelled';
  await Sharing.shareAsync(file.uri, { mimeType: type.mime, UTI: type.uti, dialogTitle: 'Share reel' });
  return 'shared';
}

async function shareLinkOnWeb(url: string, caption: string | null): Promise<ShareResult> {
  if (canShareLink()) {
    try {
      await navigator.share({ title: 'Voltrix reel', text: caption ?? 'Watch this reel on Voltrix', url });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      // Some browsers refuse; copying the link still works.
    }
  }
  // On the web this answers false (rather than failing) when the browser won't copy.
  const copied = await Clipboard.setStringAsync(url).catch(() => false);
  if (!copied) throw new CopyFailedError(url);
  return 'copied';
}
