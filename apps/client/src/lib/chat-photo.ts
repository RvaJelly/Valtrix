import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// Photos sent in chat: shrunk to 1600 pixels wide, like WhatsApp does, so they send quickly.

export type ChatPhoto = {
  uri: string;
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
};

const MAX_WIDTH = 1600;

export class ChatPhotoError extends Error {}

function toBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Returns null if the person cancelled.
export async function pickChatPhoto(from: 'camera' | 'library'): Promise<ChatPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new ChatPhotoError('Allow the camera in your phone settings, then try again.');
    }
  }
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new ChatPhotoError('Could not read that photo. Try another one.');
  return {
    uri: saved.uri,
    bytes: toBytes(saved.base64),
    mimeType: 'image/jpeg',
    extension: 'jpg',
    width: saved.width,
    height: saved.height,
  };
}
