import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

// Photos and videos for stories and reels.

export type PickedMedia = {
  type: 'image' | 'video';
  // Shown in the preview before posting.
  uri: string;
  bytes: ArrayBuffer | Uint8Array;
  mimeType: string;
  extension: string;
  durationSeconds: number | null;
  width: number;
  height: number;
};

export const MAX_VIDEO_SECONDS = 60;
// The largest file the storage accepts.
const MAX_BYTES = 50 * 1024 * 1024;
// Photos are shrunk to this width, which is what Instagram uses too.
const PHOTO_WIDTH = 1080;

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export class MediaError extends Error {}

function toBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Opens the camera or the phone's photos. Stories can be a photo or a video;
// reels are always a video. Returns null if the person cancelled.
export async function pickMedia(kind: 'story' | 'reel', from: 'camera' | 'library'): Promise<PickedMedia | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: kind === 'reel' ? ['videos'] : ['images', 'videos'],
    videoMaxDuration: MAX_VIDEO_SECONDS,
    quality: 1,
    // iPhones save HEIC photos and HEVC videos; ask for ones every phone can show.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new MediaError('Voltrix needs your camera for this. Allow it in your phone settings, then try again.');
    }
  }
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video/');
  if (kind === 'reel' && !isVideo) throw new MediaError('Reels are videos. Pick a video instead.');
  return isVideo ? prepareVideo(asset) : preparePhoto(asset);
}

async function preparePhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedMedia> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > PHOTO_WIDTH) context.resize({ width: PHOTO_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new MediaError('Could not read the photo. Try another one.');
  return {
    type: 'image',
    uri: saved.uri,
    bytes: toBytes(saved.base64),
    mimeType: 'image/jpeg',
    extension: 'jpg',
    durationSeconds: null,
    width: saved.width,
    height: saved.height,
  };
}

async function prepareVideo(asset: ImagePicker.ImagePickerAsset): Promise<PickedMedia> {
  // The picker gives the length in milliseconds on phones and in seconds on the web, when it knows it.
  const length = asset.duration ? (Platform.OS === 'web' ? asset.duration : asset.duration / 1000) : null;
  const seconds = length ? Math.round(length * 100) / 100 : null;
  if (seconds && seconds > MAX_VIDEO_SECONDS + 0.5) {
    throw new MediaError(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(seconds)}.`);
  }
  const mimeType = asset.mimeType && asset.mimeType in VIDEO_TYPES ? asset.mimeType : guessVideoType(asset);
  if (!mimeType) throw new MediaError('This type of video is not supported. Try an MP4 video.');
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw tooBig();

  const bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw tooBig();
  return {
    type: 'video',
    uri: asset.uri,
    bytes,
    mimeType,
    extension: VIDEO_TYPES[mimeType],
    durationSeconds: seconds ? Math.min(seconds, MAX_VIDEO_SECONDS) : null,
    width: asset.width,
    height: asset.height,
  };
}

function tooBig() {
  return new MediaError('This video is too big to share (over 50 MB). Try a shorter clip.');
}

function guessVideoType(asset: ImagePicker.ImagePickerAsset) {
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  // Phones record MP4 when nothing says otherwise.
  return asset.mimeType ? null : 'video/mp4';
}
