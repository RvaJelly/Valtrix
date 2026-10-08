import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

// Profile photos are stored square and small, so they load fast in lists.
const SIZE = 512;

function toBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Lets the trainer pick a photo, crops and shrinks it, and uploads it to their
// own folder. Returns the photo's web address, or null if they cancelled.
export async function pickProfilePhoto(userId: string): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];

  // Crop to the middle square when the picker didn't, then shrink.
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (side && asset.width !== asset.height) {
    context.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  context.resize({ width: SIZE, height: SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Could not read the photo.');

  const path = `${userId}/photo-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, toBytes(saved.base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

// Removes an earlier photo from storage. Best effort: a leftover file does no harm.
export async function removeProfilePhoto(url: string | null | undefined) {
  const marker = '/avatars/';
  if (!url?.includes(marker)) return;
  await supabase.storage
    .from('avatars')
    .remove([url.slice(url.indexOf(marker) + marker.length)])
    .catch(() => {});
}
