import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/chips';
import { LineChart } from '@/components/line-chart';
import { PhotoViewer } from '@/components/photo-viewer';
import { Body, Button, ErrorText, Notice, Skeleton, Text, TextField, useDelayed } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type } from '@/constants/theme';
import { useClientData } from '@/lib/client-data';
import type { Client } from '@/lib/clients';
import { dayMonth } from '@/lib/days';
import { plainError } from '@/lib/errors';
import { fromDayKey } from '@/lib/food';
import {
  CHECK_IN_QUESTIONS,
  freshPhotoUrl,
  loadClientBodyWeights,
  loadClientCheckIns,
  loadClientMeasurements,
  loadClientPhotos,
  MEASUREMENTS,
  photoUrls,
  POSES,
  REPLY_MAX,
  replyToCheckIn,
  type BodyWeight,
  type ClientCheckIn,
  type MeasurementKey,
  type Measurements,
  type ProgressPhoto,
  type SignedPhoto,
} from '@/lib/progress';
import { addDays, dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import {
  formatLength,
  formatNumber,
  formatWeight,
  fromCm,
  fromKg,
  type LengthUnit,
  type WeightUnit,
} from '@/lib/units';

type Data = {
  weights: BodyWeight[];
  measurements: Measurements[];
  photos: ProgressPhoto[];
  urls: Map<string, SignedPhoto>;
  checkIns: ClientCheckIn[];
};

const CHECK_INS_SHOWN = 4;
const DAY_MS = 86_400_000;

async function load(clientId: string): Promise<Data> {
  const today = new Date();
  const tomorrow = dayKey(addDays(today, 1));
  const [weights, measurements, photos, checkIns] = await Promise.all([
    loadClientBodyWeights(clientId, dayKey(addDays(today, -180)), tomorrow),
    loadClientMeasurements(clientId, dayKey(addDays(today, -365)), tomorrow),
    loadClientPhotos(clientId, 30),
    loadClientCheckIns(clientId, 8),
  ]);
  // Links already asked for are reused (lib/progress). Without links the photos show as
  // empty frames, and the next reload tries again.
  const urls = await photoUrls(photos.map((p) => p.path)).catch(() => new Map<string, SignedPhoto>());
  return { weights, measurements, photos, urls, checkIns };
}

const KINDS = ['weight', 'measurements', 'photo', 'check_in'] as const;

// "−2.6 kg", "+1.2 kg" (with a real minus sign).
function signed(value: number, text: string) {
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function daysBetween(a: string, b: string) {
  return Math.round((fromDayKey(b).getTime() - fromDayKey(a).getTime()) / DAY_MS);
}

// A client's body weight, measurements, progress photos and weekly check-ins, with the
// trainer's reply to each check-in. Read-only apart from the replies. Shown only for a client
// who accepted the trainer. onUnsavedChange says whether a reply is typed but not sent.
export function ClientProgress({
  client,
  onUnsavedChange,
}: {
  client: Pick<Client, 'id' | 'first_name' | 'user_id'>;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const { settings } = useSettings();
  const { data, failed, again } = useClientData(client.id, load, KINDS);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);

  const empty =
    data && !data.weights.length && !data.measurements.length && !data.photos.length && !data.checkIns.length;

  return (
    <View testID="client-progress" style={styles.part}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        Progress
      </Text>
      {!data && !failed ? <Loading /> : null}
      {!data && failed ? (
        <Notice tone="danger" action={{ label: 'Try again', onPress: again }}>
          Couldn’t load {client.first_name}’s progress. Check your connection and try again.
        </Notice>
      ) : null}
      {empty ? (
        <Body secondary style={styles.small}>
          Nothing logged yet. {client.first_name}’s weight, measurements, photos and check-ins show here.
        </Body>
      ) : null}
      {data?.weights.length ? <BodyWeightCard weights={data.weights} unit={settings.units} /> : null}
      {data?.measurements.length ? <MeasurementsCard measurements={data.measurements} unit={settings.lengths} /> : null}
      {data?.photos.length ? (
        <PhotosCard photos={data.photos} urls={data.urls} name={client.first_name} onOpen={setViewing} />
      ) : null}
      {data?.checkIns.length ? (
        <CheckIns
          checkIns={data.checkIns}
          name={client.first_name}
          unit={settings.units}
          onUnsavedChange={onUnsavedChange}
        />
      ) : null}
      <PhotoViewer photo={viewing} name={client.first_name} onClose={() => setViewing(null)} />
    </View>
  );
}

// Two card-shaped placeholders, after a short wait so fast loads show nothing.
function Loading() {
  const shown = useDelayed();
  if (!shown) return null;
  return (
    <View accessible accessibilityLabel="Loading" style={{ gap: Spacing.tight }}>
      <Skeleton height={260} radius={Radius.large} />
      <Skeleton height={200} radius={Radius.large} />
    </View>
  );
}

function BodyWeightCard({ weights, unit }: { weights: BodyWeight[]; unit: WeightUnit }) {
  const latest = weights[weights.length - 1];
  // The weight closest to 30 days before the latest one, when there is one 25 to 35 days back.
  const before = weights
    .filter((w) => {
      const gap = daysBetween(w.day, latest.day);
      return gap >= 25 && gap <= 35;
    })
    .sort((a, b) => Math.abs(daysBetween(a.day, latest.day) - 30) - Math.abs(daysBetween(b.day, latest.day) - 30))[0];
  // Rounded as shown, so a change too small to show reads "No change", not "+0 kg".
  const change = before
    ? Math.round((fromKg(latest.weight_kg, unit) - fromKg(before.weight_kg, unit)) * 10) / 10
    : null;
  const first = weights[0];
  const label =
    weights.length > 1
      ? `Body weight from ${formatWeight(first.weight_kg, unit)} on ${dayMonth(first.day)} to ${formatWeight(latest.weight_kg, unit)} on ${dayMonth(latest.day)}`
      : `Body weight ${formatWeight(latest.weight_kg, unit)} on ${dayMonth(latest.day)}`;

  return (
    <View style={styles.card}>
      <Text style={styles.subhead}>Body weight</Text>
      <View style={styles.bigRow}>
        <Text style={styles.big}>{formatWeight(latest.weight_kg, unit)}</Text>
        <Text style={styles.meta}>{dayMonth(latest.day)}</Text>
      </View>
      {change !== null ? (
        <Text style={styles.change}>
          {change === 0 ? 'No change' : signed(change, `${formatNumber(Math.abs(change), 1)} ${unit}`)} in 30 days
        </Text>
      ) : null}
      <LineChart
        points={weights.map((w) => ({ day: w.day, value: fromKg(w.weight_kg, unit) }))}
        format={(v) => formatNumber(v, 1)}
        accessibilityLabel={label}
      />
    </View>
  );
}

function MeasurementsCard({ measurements, unit }: { measurements: Measurements[]; unit: LengthUnit }) {
  // Only the measurements the client has logged.
  const logged = MEASUREMENTS.filter((m) => measurements.some((row) => row[m.key] !== null));
  const [picked, setPicked] = useState<MeasurementKey | null>(null);
  const chosen = logged.find((m) => m.key === picked) ?? logged[0];
  if (!chosen) return null;
  const points = measurements
    .filter((row) => row[chosen.key] !== null)
    .map((row) => ({ day: row.day, value: fromCm(row[chosen.key] as number, unit) }));
  const latestDay = measurements[measurements.length - 1].day;
  const options = Object.fromEntries(logged.map((m) => [m.key, m.label])) as Record<MeasurementKey, string>;

  return (
    <View style={styles.card}>
      <Text style={styles.subhead}>Measurements</Text>
      <Text style={styles.meta}>Latest {dayMonth(latestDay)} · change since first logged</Text>
      <View style={styles.table}>
        {logged.map((m) => {
          // Each measurement's own days: one not taken on the latest day shows when it was.
          const rows = measurements.filter((row) => row[m.key] !== null);
          const values = rows.map((row) => row[m.key] as number);
          const last = values[values.length - 1];
          const lastDay = rows[rows.length - 1].day;
          const older = lastDay !== latestDay ? dayMonth(lastDay) : null;
          const diff = values.length > 1 ? fromCm(last, unit) - fromCm(values[0], unit) : null;
          const diffText =
            diff === null ? '–' : diff === 0 ? 'No change' : signed(diff, `${formatNumber(Math.abs(diff), 2)} ${unit}`);
          return (
            <View
              key={m.key}
              style={styles.tableRow}
              accessible
              accessibilityLabel={`${m.label} ${formatLength(last, unit)}${older ? ` on ${older}` : ''}${
                diff !== null ? `, ${diffText} since ${dayMonth(rows[0].day)}` : ''
              }`}>
              <View style={styles.tableNameBox}>
                <Text style={styles.tableName}>{m.label}</Text>
                {older ? <Text style={styles.tableDay}>{older}</Text> : null}
              </View>
              <Text style={styles.tableValue}>{formatLength(last, unit)}</Text>
              <Text style={[styles.tableChange, diff === null && { color: Colors.textSecondary }]}>{diffText}</Text>
            </View>
          );
        })}
      </View>
      {logged.length > 1 ? (
        <Chips
          options={options}
          value={chosen.key}
          onChange={(key) => key && setPicked(key)}
          background={Colors.surface}
        />
      ) : null}
      <LineChart
        points={points}
        format={(v) => formatNumber(v, 1)}
        accessibilityLabel={
          points.length > 1
            ? `${chosen.label} from ${formatNumber(points[0].value, 2)} ${unit} to ${formatNumber(points[points.length - 1].value, 2)} ${unit}`
            : `${chosen.label} ${formatNumber(points[0]?.value ?? 0, 2)} ${unit}`
        }
      />
    </View>
  );
}

function PhotosCard({
  photos,
  urls,
  name,
  onOpen,
}: {
  photos: ProgressPhoto[];
  urls: Map<string, SignedPhoto>;
  name: string;
  onOpen: (photo: ProgressPhoto) => void;
}) {
  const [all, setAll] = useState(false);
  // Newest day first.
  const days = [...new Set(photos.map((p) => p.day))];
  const shown = all ? days : days.slice(0, 1);

  return (
    <View style={styles.card}>
      <Text style={styles.subhead}>Photos</Text>
      {shown.map((day) => (
        <View key={day} style={{ gap: Spacing.two }}>
          <Text style={styles.meta}>{dayMonth(day)}</Text>
          <View style={styles.photoRow}>
            {POSES.map((pose) => {
              const photo = photos.find((p) => p.day === day && p.pose === pose.key);
              const url = photo ? urls.get(photo.path)?.url : undefined;
              return (
                <View key={pose.key} style={styles.photoSlot}>
                  {photo ? (
                    <Pressable
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`${name}'s ${pose.label.toLowerCase()} photo, ${dayMonth(day)}. Open it bigger`}
                      onPress={() => onOpen(photo)}
                      style={({ pressed }) => [styles.photo, pressed && { opacity: 0.8 }]}>
                      <PhotoThumb key={photo.path} photo={photo} initial={url} />
                    </Pressable>
                  ) : (
                    <View style={[styles.photo, styles.noPhoto]} />
                  )}
                  <Text style={styles.poseLabel}>{photo ? pose.label : `No ${pose.label.toLowerCase()}`}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {days.length > 1 ? (
        <Button
          title={all ? 'Show fewer' : 'Show all'}
          variant="ghost"
          onPress={() => setAll((a) => !a)}
          accessibilityLabel={all ? 'Show only the latest photos' : `Show all of ${name}’s photos`}
        />
      ) : null}
    </View>
  );
}

// One thumbnail. Its link is checked when it shows (links only last 10 minutes, and "Show
// all" can come much later than the load) and signed afresh once if the photo doesn't load.
function PhotoThumb({ photo, initial }: { photo: ProgressPhoto; initial?: string }) {
  const [url, setUrl] = useState<string | null>(initial ?? null);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let alive = true;
    freshPhotoUrl(photo.path).then(
      (link) => {
        if (alive) setUrl(link.url);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [photo.path]);

  if (!url) return null;
  return (
    // Memory only: a client's photos never stay on the trainer's phone.
    <Image
      source={{ uri: url }}
      cachePolicy="memory"
      contentFit="cover"
      style={styles.photoImage}
      onError={() => {
        if (retried) return;
        setRetried(true);
        freshPhotoUrl(photo.path, true).then(
          (link) => setUrl(link.url),
          () => {},
        );
      }}
    />
  );
}

// Stress 4–5 and low energy or sleep (1–2) stand out.
function worrying(key: string, value: number) {
  return key === 'stress' ? value >= 4 : key === 'energy' || key === 'sleep' ? value <= 2 : false;
}

type Reply = { body: string; at: string | null };

function CheckIns({
  checkIns,
  name,
  unit,
  onUnsavedChange,
}: {
  checkIns: ClientCheckIn[];
  name: string;
  unit: WeightUnit;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  // What the trainer typed, by check-in. Reloads never touch it.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  // Replies saved from this page, until a reload brings them back.
  const [saved, setSaved] = useState<Record<string, Reply>>({});
  // By check-in, so one reply finishing doesn't free the button of another still on its way.
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // The newest of the saved reply and the one on screen.
  function replyOf(ci: ClientCheckIn): Reply | null {
    const mine = saved[ci.id];
    const loaded = ci.my_reply ? { body: ci.my_reply, at: ci.my_reply_at } : null;
    if (!mine) return loaded;
    if (!loaded?.at || !mine.at) return mine;
    return Date.parse(mine.at) >= Date.parse(loaded.at) ? mine : loaded;
  }

  // A reply typed in an open box that isn't sent yet (an edit that changed nothing doesn't count).
  const unsaved = checkIns.some((ci) => {
    const draft = (drafts[ci.id] ?? '').trim();
    const reply = replyOf(ci);
    return !!draft && (!reply || !!editing[ci.id]) && draft !== reply?.body.trim();
  });
  useEffect(() => {
    onUnsavedChange?.(unsaved);
  }, [unsaved, onUnsavedChange]);
  // Gone from the page (the client left): nothing is waiting any more.
  useEffect(() => () => onUnsavedChange?.(false), [onUnsavedChange]);

  async function send(ci: ClientCheckIn) {
    const body = (drafts[ci.id] ?? '').trim();
    if (!body) return setErrors((e) => ({ ...e, [ci.id]: 'Write a reply first.' }));
    setErrors((e) => ({ ...e, [ci.id]: null }));
    setSending((s) => ({ ...s, [ci.id]: true }));
    try {
      const reply = await replyToCheckIn(ci.id, body);
      setSaved((s) => ({ ...s, [ci.id]: { body: reply.body, at: reply.updated_at } }));
      setEditing((e) => ({ ...e, [ci.id]: false }));
      setDrafts((d) => ({ ...d, [ci.id]: '' }));
    } catch (e) {
      setErrors((errs) => ({
        ...errs,
        [ci.id]: plainError(e, "That didn't save. Check your connection and try again."),
      }));
    }
    setSending((s) => ({ ...s, [ci.id]: false }));
  }

  return (
    <View style={styles.part}>
      <Text style={[styles.subhead, { marginTop: Spacing.one }]}>Check-ins</Text>
      {(all ? checkIns : checkIns.slice(0, CHECK_INS_SHOWN)).map((ci) => {
        const reply = replyOf(ci);
        const open = !reply || editing[ci.id];
        return (
          <View key={ci.id} style={styles.card}>
            <Text style={styles.week}>Week of {dayMonth(ci.week_start)}</Text>
            <Text
              style={styles.answers}
              accessibilityLabel={CHECK_IN_QUESTIONS.map(
                (q) => `${q.short}: ${q.words[ci[q.key] - 1] ?? ci[q.key]}`,
              ).join(', ')}>
              {CHECK_IN_QUESTIONS.map((q, i) => (
                <Text key={q.key}>
                  {i ? ' · ' : ''}
                  <Text style={worrying(q.key, ci[q.key]) ? styles.worry : null}>
                    {q.short}: {q.words[ci[q.key] - 1] ?? ci[q.key]}
                  </Text>
                </Text>
              ))}
            </Text>
            {ci.wins ? <Answer label="Wins" text={ci.wins} /> : null}
            {ci.struggles ? <Answer label="Struggles" text={ci.struggles} /> : null}
            {ci.weight_kg !== null ? <Answer label="Weight" text={formatWeight(ci.weight_kg, unit)} /> : null}

            <View style={styles.reply}>
              {!open && reply ? (
                <>
                  <Text style={styles.replyLabel}>Your reply</Text>
                  <Text style={styles.answerText}>{reply.body}</Text>
                  <Button
                    title="Edit"
                    variant="ghost"
                    onPress={() => {
                      setDrafts((d) => ({ ...d, [ci.id]: reply.body }));
                      setEditing((e) => ({ ...e, [ci.id]: true }));
                    }}
                    accessibilityLabel={`Edit your reply for the week of ${dayMonth(ci.week_start)}`}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label={`Your reply to ${name}`}
                    value={drafts[ci.id] ?? ''}
                    onChangeText={(t) => setDrafts((d) => ({ ...d, [ci.id]: t }))}
                    placeholder="For example: Great week, keep it up!"
                    multiline
                    maxLength={REPLY_MAX}
                    testID={`reply-${ci.id}`}
                    style={styles.replyInput}
                  />
                  <ErrorText>{errors[ci.id]}</ErrorText>
                  <Button
                    title="Send reply"
                    onPress={() => send(ci)}
                    loading={!!sending[ci.id]}
                    disabled={!!sending[ci.id]}
                    testID={`send-reply-${ci.id}`}
                  />
                  {reply ? (
                    <Button
                      title="Cancel"
                      variant="ghost"
                      onPress={() => {
                        setEditing((e) => ({ ...e, [ci.id]: false }));
                        setErrors((errs) => ({ ...errs, [ci.id]: null }));
                      }}
                      disabled={!!sending[ci.id]}
                    />
                  ) : null}
                </>
              )}
            </View>
          </View>
        );
      })}
      {checkIns.length > CHECK_INS_SHOWN ? (
        <Button
          title={all ? 'Show fewer' : 'Show more'}
          variant="secondary"
          onPress={() => setAll((a) => !a)}
          accessibilityLabel={all ? 'Show fewer check-ins' : 'Show more check-ins'}
        />
      ) : null}
    </View>
  );
}

function Answer({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.replyLabel}>{label}</Text>
      <Text style={styles.answerText}>{text}</Text>
    </View>
  );
}

const styles = themed(() => ({
  part: {
    gap: Spacing.tight,
  },
  small: {
    ...Type.footnote,
  },
  card: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  subhead: {
    ...Type.headline,
    color: Colors.text,
  },
  meta: {
    ...Type.footnote,
    color: Colors.textSecondary,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  big: {
    ...Type.stat,
    ...Tabular,
    color: Colors.text,
  },
  change: {
    ...Type.callout,
    ...Tabular,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  table: {
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.tint,
    paddingHorizontal: Spacing.tight,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tableNameBox: {
    flex: 1,
    paddingVertical: Spacing.one,
  },
  tableName: {
    ...Type.callout,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  tableDay: {
    ...Type.footnote,
    color: Colors.textSecondary,
  },
  tableValue: {
    ...Type.callout,
    ...Tabular,
    fontFamily: Fonts.textSemi,
    color: Colors.text,
    minWidth: 76,
    textAlign: 'right',
  },
  tableChange: {
    ...Type.footnote,
    ...Tabular,
    color: Colors.text,
    minWidth: 84,
    textAlign: 'right',
  },
  // Phone-sized thumbnails, also in a wide browser window.
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    maxWidth: 480,
  },
  photoSlot: {
    flex: 1,
    gap: Spacing.one,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: Colors.tint,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  noPhoto: {
    backgroundColor: Colors.tint,
    opacity: 0.6,
  },
  poseLabel: {
    ...Type.footnote,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  week: {
    ...Type.headline,
    color: Colors.text,
  },
  answers: {
    ...Type.callout,
    color: Colors.text,
  },
  worry: {
    color: Colors.danger,
    fontFamily: Fonts.textSemi,
  },
  answerText: {
    ...Type.callout,
    color: Colors.text,
  },
  reply: {
    gap: Spacing.two,
    paddingTop: Spacing.tight,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  replyLabel: {
    ...Type.footnote,
    fontFamily: Fonts.textMedium,
    color: Colors.textSecondary,
  },
  replyInput: {
    minHeight: 88,
    paddingTop: Spacing.tight,
    textAlignVertical: 'top',
  },
}));
