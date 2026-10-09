import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Chips } from '@/components/chips';
import { PhotoViewer } from '@/components/photo-viewer';
import { Sheet } from '@/components/sheet';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { dayMonth, weekdayDayMonth } from '@/lib/days';
import { shiftDay } from '@/lib/food';
import {
  addProgressPhoto,
  deleteProgressPhoto,
  loadFirstPhotos,
  loadPhotos,
  photoUrls,
  pickProgressPhoto,
  POSES,
  type Pose,
  type ProgressPhoto,
  type SignedPhoto,
} from '@/lib/progress';
import { serial } from '@/lib/serial';
import { dayKey } from '@/lib/sessions';

const PAGE = 30;
const POSE_LABELS = Object.fromEntries(POSES.map((p) => [p.key, p.label])) as Record<Pose, string>;

const POSE_INDEX: Record<Pose, number> = { front: 0, side: 1, back: 2 };

// Newest day first, then front, side, back.
function newestFirst(a: ProgressPhoto, b: ProgressPhoto) {
  if (a.day !== b.day) return a.day < b.day ? 1 : -1;
  return POSE_INDEX[a.pose] - POSE_INDEX[b.pose];
}

// The messages the photo helpers throw are written for people; anything else gets a plain one.
const FRIENDLY = /^(Allow the camera|Could not read|You have|The photo couldn|That didn)/;

function photoError(e: unknown, fallback: string) {
  return e instanceof Error && FRIENDLY.test(e.message) ? e.message : fallback;
}

// A full page may have cut its oldest day short, so that day waits for the next page.
function splitPage(page: ProgressPhoto[]) {
  if (page.length < PAGE) return { shown: page, before: null };
  const oldest = page.at(-1)!.day;
  const shown = page.filter((p) => p.day !== oldest);
  return { shown, before: shiftDay(oldest, 1) };
}

type Target = { day: string; pose: Pose; replacing: ProgressPhoto | null };

// The client's progress photos: today's front, side and back, first and latest side by side,
// and every earlier day.
export default function ProgressPhotos() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const today = dayKey(new Date());
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [firsts, setFirsts] = useState<ProgressPhoto[]>([]);
  // Where the next "Show older" page starts; null when there is nothing older.
  const [before, setBefore] = useState<string | null>(null);
  const [links, setLinks] = useState<Map<string, SignedPhoto>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [compare, setCompare] = useState<Pose>('front');
  // The slot a photo is being picked for, and the one being uploaded.
  const [target, setTarget] = useState<Target | null>(null);
  // A choice made in the sheet, waiting for it to close (iPhone).
  const [picking, setPicking] = useState<{ slot: Target; from: 'camera' | 'library' } | null>(null);
  const [uploading, setUploading] = useState<{ day: string; pose: Pose } | null>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () =>
      serial(async (current) => {
        const [page, first] = await Promise.all([
          loadPhotos(PAGE).catch(() => null),
          loadFirstPhotos().catch(() => null),
        ]);
        const signed = page ? await photoUrls([...page, ...(first ?? [])].map((p) => p.path)).catch(() => null) : null;
        if (!current()) return;
        if (page) {
          const { shown, before: next } = splitPage(page);
          setPhotos(shown);
          setBefore(next);
        }
        if (first) setFirsts(first);
        if (signed) setLinks((old) => new Map([...old, ...signed]));
        setError(page ? null : 'Could not load your photos. Check your internet connection.');
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatEvents((event) => {
    if (event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function showOlder() {
    if (!before || loadingOlder) return;
    setLoadingOlder(true);
    setProblem(null);
    try {
      const page = await loadPhotos(PAGE, before);
      const signed = await photoUrls(page.map((p) => p.path)).catch(() => null);
      const { shown, before: next } = splitPage(page);
      setPhotos((old) => {
        const seen = new Set((old ?? []).map((p) => p.id));
        return [...(old ?? []), ...shown.filter((p) => !seen.has(p.id))];
      });
      setBefore(next);
      if (signed) setLinks((old) => new Map([...old, ...signed]));
    } catch {
      setProblem('Could not load more. Check your internet connection.');
    }
    setLoadingOlder(false);
  }

  function choose(from: 'camera' | 'library') {
    const slot = target;
    setTarget(null);
    if (!slot) return;
    // On an iPhone the picker can't open while the sheet is still sliding away, so it waits
    // for the sheet. A browser only opens its file chooser straight from the tap.
    if (Platform.OS === 'ios') setPicking({ slot, from });
    else addPhoto(slot, from);
  }

  async function addPhoto(slot: Target, from: 'camera' | 'library') {
    if (!userId) return;
    setProblem(null);
    try {
      const picked = await pickProgressPhoto(from);
      if (!picked) return;
      setUploading({ day: slot.day, pose: slot.pose });
      const saved = await addProgressPhoto(userId, slot.day, slot.pose, picked, slot.replacing);
      const signed = await photoUrls([saved.path]).catch(() => null);
      if (signed) setLinks((old) => new Map([...old, ...signed]));
      setPhotos((old) =>
        [...(old ?? []).filter((p) => !(p.day === saved.day && p.pose === saved.pose)), saved].sort(newestFirst),
      );
      setFirsts((old) => {
        const first = old.find((p) => p.pose === saved.pose);
        if (first && first.day < saved.day) return old;
        return [...old.filter((p) => p.pose !== saved.pose), saved];
      });
    } catch (e) {
      setProblem(photoError(e, "The photo couldn't be added. Try another one."));
    } finally {
      setUploading(null);
    }
  }

  function replace(photo: ProgressPhoto) {
    setViewing(null);
    // A second window can't open while the first is still closing on an iPhone.
    setTimeout(
      () => setTarget({ day: photo.day, pose: photo.pose, replacing: photo }),
      Platform.OS === 'ios' ? 450 : 0,
    );
  }

  async function remove(photo: ProgressPhoto) {
    const sure = await confirm(
      'Delete this photo?',
      `Your ${POSE_LABELS[photo.pose].toLowerCase()} photo from ${dayMonth(photo.day)} will be deleted.`,
      'Delete',
    );
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteProgressPhoto(photo);
      setViewing(null);
      setPhotos((old) => (old ?? []).filter((p) => p.id !== photo.id));
      // The first photo of that pose may have been this one.
      if (firsts.some((p) => p.id === photo.id)) {
        loadFirstPhotos().then(setFirsts, () => setFirsts((old) => old.filter((p) => p.id !== photo.id)));
      }
    } catch {
      setViewing(null);
      setProblem("That didn't delete. Check your connection and try again.");
    }
    setBusy(false);
  }

  const todays = POSES.map((pose) => ({
    pose,
    photo: photos?.find((p) => p.day === today && p.pose === pose.key) ?? null,
  }));

  // Earlier days, newest first.
  const days: { day: string; photos: ProgressPhoto[] }[] = [];
  for (const photo of photos ?? []) {
    if (photo.day === today) continue;
    const last = days.at(-1);
    if (last && last.day === photo.day) last.photos.push(photo);
    else days.push({ day: photo.day, photos: [photo] });
  }

  const posePhotos = (photos ?? []).filter((p) => p.pose === compare);
  const latest = posePhotos[0] ?? null;
  const first = firsts.find((p) => p.pose === compare) ?? posePhotos.at(-1) ?? null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      {error ? (
        <View style={{ gap: Spacing.two }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={refresh} loading={refreshing} />
        </View>
      ) : null}

      <Text style={styles.section}>Today</Text>
      <View style={styles.row}>
        {todays.map(({ pose, photo }) => {
          const link = photo ? links.get(photo.path) : undefined;
          const loading = uploading?.day === today && uploading.pose === pose.key;
          return (
            <Pressable
              key={pose.key}
              testID={`photo-slot-${pose.key}`}
              accessibilityRole="button"
              accessibilityLabel={
                photo ? `${pose.label} photo, ${dayMonth(photo.day)}` : `Add ${pose.label.toLowerCase()} photo`
              }
              disabled={!photos || loading}
              onPress={() => (photo ? setViewing(photo) : setTarget({ day: today, pose: pose.key, replacing: null }))}
              style={styles.slotWrap}>
              <View style={[styles.slot, !photo && styles.emptySlot]}>
                {loading ? (
                  <ActivityIndicator color={Colors.accentText} />
                ) : photo && link ? (
                  <Image source={{ uri: link.url, cacheKey: photo.path }} style={styles.fill} contentFit="cover" />
                ) : photo ? (
                  <Ionicons name="image-outline" size={28} color={Colors.textSecondary} />
                ) : (
                  <Ionicons name="add" size={32} color={Colors.accentText} />
                )}
              </View>
              <Text style={styles.slotLabel}>{pose.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorText>{problem}</ErrorText>

      {photos === null ? (
        !error ? (
          <ActivityIndicator color={Colors.accentText} />
        ) : null
      ) : (
        <>
          <Text style={styles.section}>Compare</Text>
          <Card style={{ gap: Spacing.three }}>
            <Chips options={POSE_LABELS} value={compare} onChange={(p) => p && setCompare(p)} />
            {latest && first && first.id !== latest.id ? (
              <View style={styles.row}>
                {[first, latest].map((photo, i) => (
                  <Thumb
                    key={photo.id}
                    photo={photo}
                    link={links.get(photo.path)}
                    label={`${i === 0 ? 'First' : 'Latest'} · ${dayMonth(photo.day)}`}
                    onPress={() => setViewing(photo)}
                  />
                ))}
              </View>
            ) : (
              <Body secondary style={styles.small}>
                {latest
                  ? `Add another ${POSE_LABELS[compare].toLowerCase()} photo on a later day to see the change.`
                  : `No ${POSE_LABELS[compare].toLowerCase()} photos yet.`}
              </Body>
            )}
          </Card>

          {days.length ? (
            <>
              <Text style={styles.section}>Earlier</Text>
              {days.map(({ day, photos: dayPhotos }) => (
                <View key={day} style={{ gap: Spacing.one }}>
                  <Text style={styles.day}>{weekdayDayMonth(day)}</Text>
                  <View style={styles.row}>
                    {dayPhotos.map((photo) => (
                      <Thumb
                        key={photo.id}
                        photo={photo}
                        link={links.get(photo.path)}
                        label={POSE_LABELS[photo.pose]}
                        onPress={() => setViewing(photo)}
                      />
                    ))}
                    {/* Keeps the thumbnails the same size on a day with fewer than 3. */}
                    {Array.from({ length: 3 - dayPhotos.length }, (_, i) => (
                      <View key={i} style={styles.slotWrap} />
                    ))}
                  </View>
                </View>
              ))}
              {before ? (
                <Button title="Show older" variant="secondary" onPress={showOlder} loading={loadingOlder} />
              ) : null}
            </>
          ) : null}
        </>
      )}

      <Body secondary style={styles.small}>
        Only you and your trainers can see these.
      </Body>

      <Sheet
        visible={!!target}
        onClose={() => setTarget(null)}
        onClosed={() => {
          if (!picking) return;
          setPicking(null);
          addPhoto(picking.slot, picking.from);
        }}
        title={target ? `${POSE_LABELS[target.pose]} photo` : undefined}>
        {Platform.OS !== 'web' ? <Button title="Take photo" onPress={() => choose('camera')} /> : null}
        <Button
          title="Choose from library"
          variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
          onPress={() => choose('library')}
        />
      </Sheet>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} onReplace={replace} onDelete={remove} busy={busy} />
    </ScrollView>
  );
}

function Thumb({
  photo,
  link,
  label,
  onPress,
}: {
  photo: ProgressPhoto;
  link: SignedPhoto | undefined;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${POSE_LABELS[photo.pose]} photo, ${dayMonth(photo.day)}`}
      onPress={onPress}
      style={styles.slotWrap}>
      <View style={styles.slot}>
        {link ? (
          <Image source={{ uri: link.url, cacheKey: photo.path }} style={styles.fill} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={28} color={Colors.textSecondary} />
        )}
      </View>
      <Text style={styles.slotLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  slotWrap: {
    flex: 1,
    gap: Spacing.one,
  },
  slot: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.medium,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  emptySlot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  slotLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  day: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
}));
