import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Videos for exercises and workouts: demos a trainer records or picks from their
// phone. They live in the private "workout-videos" bucket, in the trainer's own
// folder. The trainer, and clients who have the workout in their plan, get a
// short-lived link to watch one.

const BUCKET = 'workout-videos';
export const MAX_VIDEO_MINUTES = 3;
const MAX_SECONDS = MAX_VIDEO_MINUTES * 60;
// The biggest file the Supabase free plan takes.
const MAX_BYTES = 50 * 1024 * 1024;

// MP4 and MOV play and save on every phone. iPhones can't play WebM (what Chrome
// records on a computer), so those are turned away.
const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

// iPhones shrink a video to a medium size before it uploads, so 3 minutes fits in
// 50 MB. Android phones send the clip as it was filmed, and a full-quality phone
// clip passes 50 MB after about half a minute.
export const VIDEO_HINT =
  Platform.OS === 'android'
    ? 'short clips work best, about 30 seconds'
    : Platform.OS === 'ios'
      ? `up to ${MAX_VIDEO_MINUTES} minutes`
      : `up to ${MAX_VIDEO_MINUTES} minutes and 50 MB`;
// The same, as a sentence for the "Add a video" question on phones.
export const VIDEO_TIP = `${VIDEO_HINT[0].toUpperCase()}${VIDEO_HINT.slice(1)}.`;

export class VideoError extends Error {}

export type PickedVideo = {
  bytes: ArrayBuffer;
  mimeType: string;
  extension: string;
};

function tooBig() {
  return new VideoError(
    Platform.OS === 'android'
      ? 'This video is a bit too big to upload (over 50 MB). Try a shorter clip, about 30 seconds.'
      : 'This video is a bit too big to upload (over 50 MB). Try a shorter clip, or record it again at a lower quality.',
  );
}

function minutesAndSeconds(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function guessType(asset: ImagePicker.ImagePickerAsset) {
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  // Phones record MP4 when nothing says otherwise.
  return asset.mimeType ? null : 'video/mp4';
}

// Opens the camera or the phone's videos. Returns null if the trainer cancelled.
export async function pickWorkoutVideo(from: 'camera' | 'library'): Promise<PickedVideo | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: MAX_SECONDS,
    // Medium keeps a 3 minute iPhone recording well under 50 MB.
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    // A video chosen on an iPhone is made into a medium-size MP4 too (H.264, which
    // every phone plays), instead of the full-size original.
    videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    // iPhones save HEVC videos; ask for ones every phone can play.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new VideoError(
        'Voltrix Coach needs your camera for this. Allow it in your phone settings, then try again.',
      );
    }
  }
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (asset.type && asset.type !== 'video') throw new VideoError('That is a photo. Pick a video instead.');

  // The picker gives the length in milliseconds on phones and in seconds on the web, when it knows it.
  // Some web videos report an endless length, so only trust a real number.
  const known = asset.duration && Number.isFinite(asset.duration) ? asset.duration : null;
  const seconds = known ? (Platform.OS === 'web' ? known : known / 1000) : null;
  if (seconds && seconds > MAX_SECONDS + 0.5) {
    throw new VideoError(
      `This video is ${minutesAndSeconds(seconds)} long. Videos can be up to ${MAX_VIDEO_MINUTES} minutes, so try a shorter clip.`,
    );
  }
  const mimeType = asset.mimeType && asset.mimeType in VIDEO_TYPES ? asset.mimeType : guessType(asset);
  if (!mimeType) throw new VideoError('Please use an MP4 or MOV video, so it plays on every phone.');
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw tooBig();

  const bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw tooBig();
  return { bytes, mimeType, extension: VIDEO_TYPES[mimeType] };
}

// Uploads the video to the trainer's own folder and returns where it is.
export async function uploadWorkoutVideo(userId: string, video: PickedVideo) {
  const name =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `${userId}/${name}.${video.extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, video.bytes, { contentType: video.mimeType });
  if (error) {
    const { status, statusCode } = error as { status?: number; statusCode?: string };
    if (status === 413 || statusCode === '413') throw tooBig();
    throw new VideoError('The video could not be uploaded. Check your connection and try again.');
  }
  return path;
}

// Best effort: a leftover file does no harm.
export async function removeWorkoutVideos(paths: (string | null | undefined)[]) {
  const real = paths.filter((p): p is string => !!p);
  if (!real.length) return;
  await supabase.storage
    .from(BUCKET)
    .remove(real)
    .catch(() => {});
}

// Links last an hour; reuse one for most of that.
const links = new Map<string, { url: string; until: number }>();

export async function videoLink(path: string) {
  const known = links.get(path);
  if (known && known.until > Date.now()) return known.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new VideoError('This video could not be loaded. Try again in a moment.');
  links.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}
