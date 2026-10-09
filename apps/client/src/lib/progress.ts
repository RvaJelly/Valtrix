import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { newId } from '@/lib/chat';
import { isoWeekday, startOfWeek } from '@/lib/plan';
import { addDays, dayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/units';

// The client's progress: body weight, body measurements, progress photos and the weekly
// check-in. Weights are kept in kg and lengths in cm. Each trainer the client accepted can
// read them (and reply to check-ins) in Voltrix Coach.

export type BodyWeight = { day: string; weight_kg: number };

export type MeasurementKey = 'waist_cm' | 'hips_cm' | 'chest_cm' | 'arm_cm' | 'thigh_cm';
export type Measurements = { day: string } & Record<MeasurementKey, number | null>;

// The limits in cm are the database's.
export const MEASUREMENTS: readonly { key: MeasurementKey; label: string; min: number; max: number }[] = [
  { key: 'waist_cm', label: 'Waist', min: 20, max: 300 },
  { key: 'hips_cm', label: 'Hips', min: 20, max: 300 },
  { key: 'chest_cm', label: 'Chest', min: 20, max: 300 },
  { key: 'arm_cm', label: 'Arm', min: 10, max: 150 },
  { key: 'thigh_cm', label: 'Thigh', min: 10, max: 200 },
];

export type Pose = 'front' | 'side' | 'back';
export const POSES: readonly { key: Pose; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

export type ProgressPhoto = {
  id: string;
  day: string;
  pose: Pose;
  path: string;
  width: number | null;
  height: number | null;
};

// Always a re-encoded JPEG.
export type PickedPhoto = { uri: string; bytes: Uint8Array; width: number; height: number };

export type CheckInReply = {
  trainer_id: string;
  trainer_name: string;
  trainer_avatar: string | null;
  body: string;
  updated_at: string;
};

export type CheckIn = {
  id: string;
  week_start: string;
  rating: number;
  energy: number;
  sleep: number;
  stress: number;
  wins: string | null;
  struggles: string | null;
  weight_kg: number | null;
  created_at: string;
  updated_at: string;
  replies: CheckInReply[];
};

export type CheckInInput = Pick<
  CheckIn,
  'week_start' | 'rating' | 'energy' | 'sleep' | 'stress' | 'wins' | 'struggles' | 'weight_kg'
>;

export type CheckInQuestion = 'rating' | 'energy' | 'sleep' | 'stress';

// The answers are 1 to 5; for stress, 5 is a lot of stress.
export const CHECK_IN_QUESTIONS: readonly {
  key: CheckInQuestion;
  // On the form.
  label: string;
  // In lists, and in Voltrix Coach.
  short: string;
  words: readonly [string, string, string, string, string];
}[] = [
  {
    key: 'rating',
    label: 'How was your week?',
    short: 'Overall',
    words: ['Rough', 'Not great', 'Okay', 'Good', 'Great'],
  },
  { key: 'energy', label: 'Energy', short: 'Energy', words: ['Very low', 'Low', 'Okay', 'High', 'Very high'] },
  { key: 'sleep', label: 'Sleep', short: 'Sleep', words: ['Very poor', 'Poor', 'Okay', 'Good', 'Great'] },
  { key: 'stress', label: 'Stress', short: 'Stress', words: ['Very low', 'Low', 'Some', 'High', 'Very high'] },
];

export const PHOTO_BUCKET = 'progress-photos';
export const PHOTO_LINK_SECONDS = 600;
export const MAX_PHOTO_FILES = 1000;
// Photos are made smaller before they leave the phone.
const PHOTO_SIZE = 1080;

const POSE_ORDER: Record<Pose, number> = { front: 0, side: 1, back: 2 };

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// The week a check-in made on `date` is about, as its Monday: Monday to Thursday belong to the
// week just ended, Friday to Sunday to this week.
export function checkInWeekKey(date = new Date()): string {
  return dayKey(startOfWeek(isoWeekday(date) <= 4 ? addDays(date, -7) : date));
}

// ---------- Body weight ----------

export async function loadBodyWeights(from: string, to: string): Promise<BodyWeight[]> {
  const { data, error } = await supabase
    .from('body_weights')
    .select('day, weight_kg')
    .gte('day', from)
    .lte('day', to)
    .order('day');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({ day: String(row.day), weight_kg: num(row.weight_kg) ?? 0 }))
    .filter((w) => w.weight_kg > 0);
}

// One weight a day: a second one that day replaces the first.
export async function saveBodyWeight(day: string, weightKg: number): Promise<void> {
  const { error } = await supabase
    .from('body_weights')
    .upsert({ day, weight_kg: Math.round(weightKg * 1000) / 1000 }, { onConflict: 'user_id,day' });
  if (error) throw error;
}

export async function deleteBodyWeight(day: string): Promise<void> {
  const { error } = await supabase.from('body_weights').delete().eq('day', day);
  if (error) throw error;
}

// ---------- Measurements ----------

const MEASUREMENT_COLUMNS = 'day, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm';

export async function loadMeasurements(from: string, to: string): Promise<Measurements[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select(MEASUREMENT_COLUMNS)
    .gte('day', from)
    .lte('day', to)
    .order('day');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    day: String(row.day),
    waist_cm: num(row.waist_cm),
    hips_cm: num(row.hips_cm),
    chest_cm: num(row.chest_cm),
    arm_cm: num(row.arm_cm),
    thigh_cm: num(row.thigh_cm),
  }));
}

// One set of measurements a day; saving a day again replaces all five.
export async function saveMeasurements(m: Measurements): Promise<void> {
  const row: Record<string, string | number | null> = { day: m.day };
  for (const { key } of MEASUREMENTS) {
    const value = m[key];
    row[key] = value === null ? null : Math.round(value * 100) / 100;
  }
  const { error } = await supabase.from('body_measurements').upsert(row, { onConflict: 'user_id,day' });
  if (error) throw error;
}

// ---------- Photos ----------

function cleanPhoto(row: Record<string, unknown>): ProgressPhoto {
  const pose = row.pose === 'side' || row.pose === 'back' ? row.pose : 'front';
  return {
    id: String(row.id),
    day: String(row.day),
    pose,
    path: String(row.path),
    width: num(row.width),
    height: num(row.height),
  };
}

const PHOTO_COLUMNS = 'id, day, pose, path, width, height';

// Newest day first, then front, side, back. beforeDay pages back.
export async function loadPhotos(limit = 30, beforeDay?: string): Promise<ProgressPhoto[]> {
  let query = supabase.from('progress_photos').select(PHOTO_COLUMNS).order('day', { ascending: false });
  if (beforeDay) query = query.lt('day', beforeDay);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[])
    .map(cleanPhoto)
    .sort((a, b) => (a.day === b.day ? POSE_ORDER[a.pose] - POSE_ORDER[b.pose] : a.day < b.day ? 1 : -1));
}

// The first photo of each pose, to compare with the latest one.
export async function loadFirstPhotos(): Promise<ProgressPhoto[]> {
  const answers = await Promise.all(
    POSES.map(({ key }) =>
      supabase.from('progress_photos').select(PHOTO_COLUMNS).eq('pose', key).order('day').limit(1),
    ),
  );
  const photos: ProgressPhoto[] = [];
  for (const { data, error } of answers) {
    if (error) throw error;
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (row) photos.push(cleanPhoto(row));
  }
  return photos;
}

export type SignedPhoto = { url: string; signedAt: number };

// Links to the private photos last 10 minutes. They are kept while they have a minute left,
// so going back and forth between screens doesn't ask for new ones.
const links = new Map<string, SignedPhoto>();
const LINK_MS = PHOTO_LINK_SECONDS * 1000;

function stillGood(link: SignedPhoto | undefined, margin: number): link is SignedPhoto {
  return !!link && Date.now() - link.signedAt < LINK_MS - margin;
}

export async function photoUrls(paths: string[]): Promise<Map<string, SignedPhoto>> {
  const result = new Map<string, SignedPhoto>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const link = links.get(path);
    if (stillGood(link, 60_000)) result.set(path, link);
    else missing.push(path);
  }
  if (missing.length) {
    const signedAt = Date.now();
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_LINK_SECONDS);
    if (error) throw error;
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) continue;
      const link = { url: item.signedUrl, signedAt };
      links.set(item.path, link);
      result.set(item.path, link);
    }
  }
  return result;
}

// One link for the full-screen viewer, asked for again once the one kept is 9 minutes old.
export async function freshPhotoUrl(path: string): Promise<SignedPhoto> {
  const kept = links.get(path);
  if (stillGood(kept, 60_000)) return kept;
  const signedAt = Date.now();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_LINK_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error('No link');
  const link = { url: data.signedUrl, signedAt };
  links.set(path, link);
  return link;
}

function toBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Picks a photo, then always makes a new JPEG of it (1080 px on the longest side at most), so
// the original file, with the camera's details and location, never leaves the phone. Null if
// the person cancelled.
export async function pickProgressPhoto(from: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Allow the camera in your phone settings, then try again.');
  }
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width >= asset.height && asset.width > PHOTO_SIZE) context.resize({ width: PHOTO_SIZE });
  else if (asset.height > asset.width && asset.height > PHOTO_SIZE) context.resize({ height: PHOTO_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Could not read that photo. Try another one.');
  return { uri: saved.uri, bytes: toBytes(saved.base64), width: saved.width, height: saved.height };
}

const FOLDER_FULL = `You have ${formatNumber(MAX_PHOTO_FILES)} progress photos, the most there's room for. Delete some old ones to add more.`;
const UPLOAD_FAILED = "The photo couldn't be uploaded. Check your connection and try again.";

// Uploads the photo under a new name (files are never overwritten), saves it as that day's
// photo for the pose, then removes the file it replaced.
export async function addProgressPhoto(
  userId: string,
  day: string,
  pose: Pose,
  photo: PickedPhoto,
  replacing?: ProgressPhoto | null,
): Promise<ProgressPhoto> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const path = `${userId}/${day}-${pose}-${newId().slice(0, 8)}.jpg`;
  const upload = await bucket.upload(path, photo.bytes, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) {
    const count = await supabase.rpc('my_progress_photo_file_count');
    if (!count.error && Number(count.data) >= MAX_PHOTO_FILES) throw new Error(FOLDER_FULL);
    throw new Error(UPLOAD_FAILED);
  }

  // The photo this one replaces, also when it was added on another phone.
  let old = replacing && replacing.day === day && replacing.pose === pose ? replacing : null;
  if (!old) {
    const existing = await supabase
      .from('progress_photos')
      .select(PHOTO_COLUMNS)
      .eq('day', day)
      .eq('pose', pose)
      .maybeSingle();
    old = existing.data ? cleanPhoto(existing.data as Record<string, unknown>) : null;
  }

  const { data, error } = await supabase
    .from('progress_photos')
    .upsert({ day, pose, path, width: photo.width, height: photo.height }, { onConflict: 'user_id,day,pose' })
    .select(PHOTO_COLUMNS)
    .single();
  if (error || !data) {
    await bucket.remove([path]).catch(() => {});
    throw new Error("That didn't save. Check your connection and try again.");
  }
  if (old && old.path !== path) await bucket.remove([old.path]).catch(() => {});
  return cleanPhoto(data as Record<string, unknown>);
}

// The photo goes first, then its file (a leftover file is never shown to anyone).
export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
  if (error) throw error;
  links.delete(photo.path);
  await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([photo.path])
    .catch(() => {});
}

// Every file in the person's photo folder, before their account is deleted: once the account
// is gone nobody can find the files again. Throws if any are left.
export async function removeProgressPhotoFiles(userId: string): Promise<void> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  for (let round = 0; round < 5; round++) {
    const { data, error } = await bucket.list(userId, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
    if (!paths.length) return;
    const removed = await bucket.remove(paths);
    if (removed.error) throw removed.error;
  }
  const { data, error } = await bucket.list(userId, { limit: 1 });
  if (error || data?.length) throw error ?? new Error('Some progress photos are left.');
}

// ---------- Weekly check-ins ----------

export async function loadCheckIns(limit = 12): Promise<CheckIn[]> {
  const { data, error } = await supabase.rpc('my_check_ins', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    week_start: String(row.week_start),
    rating: num(row.rating) ?? 3,
    energy: num(row.energy) ?? 3,
    sleep: num(row.sleep) ?? 3,
    stress: num(row.stress) ?? 3,
    wins: typeof row.wins === 'string' ? row.wins : null,
    struggles: typeof row.struggles === 'string' ? row.struggles : null,
    weight_kg: num(row.weight_kg),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    replies: (Array.isArray(row.replies) ? (row.replies as Record<string, unknown>[]) : []).map((r) => ({
      trainer_id: String(r.trainer_id ?? ''),
      trainer_name: String(r.trainer_name ?? 'Your trainer'),
      trainer_avatar: typeof r.trainer_avatar === 'string' ? r.trainer_avatar : null,
      body: String(r.body ?? ''),
      updated_at: String(r.updated_at ?? ''),
    })),
  }));
}

// One check-in a week: sending it again changes it.
export async function saveCheckIn(input: CheckInInput): Promise<void> {
  const { error } = await supabase.from('check_ins').upsert(input, { onConflict: 'user_id,week_start' });
  if (error) throw error;
}

// The newest trainer reply the person has seen, so Home can say when there is a new one.
const seenReplyKey = (userId: string) => `voltrix.seenReply.${userId}`;

export async function loadSeenReply(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(seenReplyKey(userId));
  } catch {
    return null;
  }
}

export async function markRepliesSeen(userId: string, at: string): Promise<void> {
  try {
    const seen = await loadSeenReply(userId);
    if (!seen || Date.parse(at) > Date.parse(seen)) await AsyncStorage.setItem(seenReplyKey(userId), at);
  } catch {
    // Shown as new again next time.
  }
}
