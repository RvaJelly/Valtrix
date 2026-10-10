import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/chips';
import { DaySwitcher } from '@/components/day-switcher';
import { LineChart } from '@/components/line-chart';
import { Sheet } from '@/components/sheet';
import {
  Body,
  Button,
  Card,
  ErrorText,
  IconButton,
  Notice,
  Section,
  Segmented,
  Skeleton,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { dayMonth } from '@/lib/days';
import { saveError } from '@/lib/errors';
import {
  checkInWeekKey,
  deleteBodyWeight,
  loadBodyWeights,
  loadCheckIns,
  loadLatestPhotos,
  loadMeasurements,
  MEASUREMENTS,
  photoUrls,
  POSES,
  saveBodyWeight,
  saveMeasurements,
  type BodyWeight,
  type CheckIn,
  type MeasurementKey,
  type Measurements,
  type ProgressPhoto,
  type SignedPhoto,
} from '@/lib/progress';
import { serial } from '@/lib/serial';
import { addDays, dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import {
  formatLength,
  formatNumber,
  formatWeight,
  fromCm,
  fromKg,
  parseNumber,
  rangeLabel,
  toCm,
  toKg,
  trim,
  weightInput,
  type LengthUnit,
  type WeightUnit,
} from '@/lib/units';

type Range = 'month' | 'three' | 'year';
const RANGES: { value: Range; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'three', label: '3 months' },
  { value: 'year', label: 'Year' },
];
const RANGE_DAYS: Record<Range, number> = { month: 30, three: 90, year: 365 };

const MEASUREMENT_LABELS = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, m.label])) as Record<
  MeasurementKey,
  string
>;

// "−2.6 kg" or "+1.5 cm": a change, with a real minus sign.
function signed(text: string, value: number) {
  if (Math.abs(value) < 1e-9) return `±${text}`;
  return `${value < 0 ? '−' : '+'}${text}`;
}

// The client's progress: body weight, measurements, photos and the weekly check-in, each with
// what has changed. Their trainers see the same.
export default function Progress() {
  const { settings } = useSettings();
  const [weights, setWeights] = useState<BodyWeight[] | null>(null);
  const [measurements, setMeasurements] = useState<Measurements[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [links, setLinks] = useState<Map<string, SignedPhoto>>(new Map());
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A failed part keeps what is on screen.
  const load = useMemo(
    () =>
      serial(async (current) => {
        const now = new Date();
        const from = dayKey(addDays(now, -365));
        const to = dayKey(addDays(now, 1));
        const [w, m, p, c] = await Promise.all([
          loadBodyWeights(from, to).catch(() => null),
          loadMeasurements(from, to).catch(() => null),
          loadLatestPhotos().catch(() => null),
          loadCheckIns(12).catch(() => null),
        ]);
        const signedLinks = p ? await photoUrls(p.map((x) => x.path)).catch(() => null) : null;
        if (!current()) return;
        if (w) setWeights(w);
        if (m) setMeasurements(m);
        if (p) setPhotos(p);
        if (signedLinks) setLinks(signedLinks);
        if (c) setCheckIns(c);
        setError(w && m && p && c ? null : "Some of your progress didn't load. Check your connection and try again.");
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatEvents((event) => {
    if (event.type === 'progress' || event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const reload = useCallback(() => load(true), [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}>
      {error ? (
        <Notice tone="danger" action={{ label: 'Try again', onPress: refresh, loading: refreshing }}>
          {error}
        </Notice>
      ) : null}

      <Section title="Body weight">
        {weights ? (
          <WeightSection weights={weights} unit={settings.units} onSaved={reload} />
        ) : !error ? (
          <Loading height={280} />
        ) : null}
      </Section>

      <Section title="Measurements">
        {measurements ? (
          <MeasurementsSection measurements={measurements} lengths={settings.lengths} onSaved={reload} />
        ) : !error ? (
          <Loading height={220} />
        ) : null}
      </Section>

      <Section title="Photos">
        {photos ? <PhotosSection photos={photos} links={links} /> : !error ? <Loading height={200} /> : null}
      </Section>

      <Section title="Weekly check-in">
        {checkIns ? <CheckInSection checkIns={checkIns} /> : !error ? <Loading height={120} /> : null}
      </Section>
    </ScrollView>
  );
}

// A card-shaped placeholder, after a short wait so fast loads show nothing.
function Loading({ height }: { height: number }) {
  const shown = useDelayed();
  return shown ? <Skeleton height={height} radius={Radius.large} /> : null;
}

// ---------- Body weight ----------

function WeightSection({ weights, unit, onSaved }: { weights: BodyWeight[]; unit: WeightUnit; onSaved: () => void }) {
  const [range, setRange] = useState<Range>('month');
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const today = new Date();
  const latest = weights.at(-1) ?? null;

  // The change since about a month ago, when there is a weight 25 to 35 days back.
  const target = dayKey(addDays(today, -30));
  const monthAgo = weights
    .filter((w) => w.day >= dayKey(addDays(today, -35)) && w.day <= dayKey(addDays(today, -25)))
    .sort(
      (a, b) => Math.abs(Date.parse(a.day) - Date.parse(target)) - Math.abs(Date.parse(b.day) - Date.parse(target)),
    )[0];
  const change = latest && monthAgo ? fromKg(latest.weight_kg, unit) - fromKg(monthAgo.weight_kg, unit) : null;

  const cutoff = dayKey(addDays(today, -RANGE_DAYS[range]));
  const points = weights.filter((w) => w.day >= cutoff).map((w) => ({ day: w.day, value: fromKg(w.weight_kg, unit) }));
  const first = points[0];
  const last = points.at(-1);

  async function remove(w: BodyWeight) {
    const sure = await confirm('Remove this weight?', `The weight from ${dayMonth(w.day)} will be removed.`, 'Remove');
    if (!sure) return;
    setProblem(null);
    try {
      await deleteBodyWeight(w.day);
      onSaved();
    } catch (e) {
      setProblem(saveError(e, "That didn't remove. Check your connection and try again."));
    }
  }

  return (
    <Card style={{ gap: Spacing.gutter }}>
      {latest ? (
        <View style={{ gap: Spacing.one }}>
          <Text variant="stat" style={Tabular}>
            {formatWeight(latest.weight_kg, unit)}
          </Text>
          <Text variant="footnote" tone="secondary">
            {change !== null ? `${signed(`${formatNumber(Math.abs(change), 1)} ${unit}`, change)} in 30 days · ` : ''}
            {dayMonth(latest.day)}
          </Text>
        </View>
      ) : (
        <Body secondary>Log your weight to see how it changes over time.</Body>
      )}
      <Segmented options={RANGES} value={range} onChange={setRange} />
      <LineChart
        points={points}
        format={(v) => formatNumber(v, 1)}
        accessibilityLabel={
          first && last
            ? `Body weight from ${formatNumber(first.value, 2)} ${unit} to ${formatNumber(last.value, 2)} ${unit}`
            : 'Body weight: nothing logged yet'
        }
      />
      <Button
        title="Log weight"
        icon="add"
        variant="secondary"
        onPress={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}
        testID="log-weight"
      />
      {weights.length ? (
        <View>
          <Text variant="label" tone="secondary" style={{ marginBottom: Spacing.one }}>
            Recent
          </Text>
          {[...weights]
            .reverse()
            .slice(0, 5)
            .map((w, i, list) => (
              <View key={w.day} style={[styles.listRow, i < list.length - 1 && styles.listLine]}>
                <Text variant="callout" tone="secondary" style={styles.listDay}>
                  {dayMonth(w.day)}
                </Text>
                <Text variant="rowTitle" style={[Tabular, { flex: 1 }]}>
                  {formatWeight(w.weight_kg, unit)}
                </Text>
                <IconButton
                  icon="trash-outline"
                  tone="secondary"
                  label={`Remove the weight from ${dayMonth(w.day)}`}
                  onPress={() => remove(w)}
                  style={{ marginRight: -Spacing.tight }}
                />
              </View>
            ))}
        </View>
      ) : null}
      <ErrorText>{problem}</ErrorText>
      <Text variant="footnote" tone="secondary">
        Your trainers can see this.
      </Text>
      <Sheet visible={sheet.open} onClose={() => setSheet((s) => ({ ...s, open: false }))} title="Log weight">
        <WeightForm
          key={sheet.key}
          weights={weights}
          unit={unit}
          onSaved={() => {
            setSheet((s) => ({ ...s, open: false }));
            onSaved();
          }}
        />
      </Sheet>
    </Card>
  );
}

function WeightForm({ weights, unit, onSaved }: { weights: BodyWeight[]; unit: WeightUnit; onSaved: () => void }) {
  const [day, setDay] = useState(() => dayKey(new Date()));
  const existing = weights.find((w) => w.day === day) ?? null;
  const [text, setText] = useState(existing ? weightInput(existing.weight_kg, unit) : '');
  // Typed by the person. A prefilled weight saved as it is keeps its exact kg.
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function changeDay(next: string) {
    setDay(next);
    setProblem(null);
    const found = weights.find((w) => w.day === next);
    if (found) {
      setText(weightInput(found.weight_kg, unit));
      setTyped(false);
    } else if (!typed) {
      setText('');
    }
  }

  async function save() {
    setProblem(null);
    const value = parseNumber(text);
    const kg =
      !typed && existing && text === weightInput(existing.weight_kg, unit)
        ? existing.weight_kg
        : value === null
          ? null
          : toKg(value, unit);
    if (kg === null || kg < 20 || kg > 400) {
      return setProblem(`Enter a weight between ${rangeLabel(fromKg(20, unit), fromKg(400, unit), 1, unit)}.`);
    }
    setBusy(true);
    try {
      await saveBodyWeight(day, kg);
      onSaved();
    } catch (e) {
      setProblem(saveError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <DaySwitcher day={day} onChange={changeDay} daysBack={365} />
      <TextField
        label={`Weight (${unit})`}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setTyped(true);
        }}
        keyboardType="decimal-pad"
        placeholder={unit === 'lb' ? '170' : '75.5'}
        onSubmitEditing={save}
      />
      {existing ? (
        <Text variant="footnote" tone="secondary">
          This replaces the {formatWeight(existing.weight_kg, unit)} logged that day.
        </Text>
      ) : null}
      <ErrorText>{problem}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </>
  );
}

// ---------- Measurements ----------

function MeasurementsSection({
  measurements,
  lengths,
  onSaved,
}: {
  measurements: Measurements[];
  lengths: LengthUnit;
  onSaved: () => void;
}) {
  const [chart, setChart] = useState<MeasurementKey>('waist_cm');
  const [sheet, setSheet] = useState({ open: false, key: 0 });

  const points = measurements
    .filter((m) => m[chart] !== null)
    .map((m) => ({ day: m.day, value: fromCm(m[chart] ?? 0, lengths) }));
  const first = points[0];
  const last = points.at(-1);

  return (
    <Card style={{ gap: Spacing.gutter }}>
      <View style={styles.tiles}>
        {[MEASUREMENTS.slice(0, 3), MEASUREMENTS.slice(3)].map((row) => (
          <View key={row[0].key} style={styles.tileRow}>
            {row.map(({ key, label }) => {
              const values = measurements.filter((m) => m[key] !== null);
              const latest = values.at(-1)?.[key] ?? null;
              const start = values[0]?.[key] ?? null;
              const change =
                latest !== null && start !== null && values.length > 1
                  ? fromCm(latest, lengths) - fromCm(start, lengths)
                  : null;
              return (
                <View key={key} style={styles.tile}>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {label}
                  </Text>
                  <Text variant="rowTitle" style={[Tabular, { fontFamily: Fonts.textSemi }]} numberOfLines={1}>
                    {formatLength(latest, lengths)}
                  </Text>
                  {change !== null ? (
                    <Text variant="footnote" tone="secondary" style={Tabular} numberOfLines={1}>
                      {signed(`${formatNumber(Math.abs(change), 1)} ${lengths}`, change)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {/* The second row's tiles stay the size of those above. */}
            {row.length < 3 ? <View style={styles.tileSpacer} /> : null}
          </View>
        ))}
      </View>
      {measurements.length ? (
        <>
          <Chips
            options={MEASUREMENT_LABELS}
            value={chart}
            onChange={(k) => k && setChart(k)}
            background={Colors.surface}
          />
          <LineChart
            points={points}
            format={(v) => formatNumber(v, 1)}
            accessibilityLabel={
              first && last
                ? `${MEASUREMENT_LABELS[chart]} from ${formatNumber(first.value, 2)} ${lengths} to ${formatNumber(last.value, 2)} ${lengths}`
                : `${MEASUREMENT_LABELS[chart]}: nothing logged yet`
            }
          />
        </>
      ) : (
        <Body secondary>Measure your waist, hips, chest, arms and thighs to see the changes the scale misses.</Body>
      )}
      <Button
        title="Add measurements"
        icon="add"
        variant="secondary"
        onPress={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}
        testID="add-measurements"
      />
      <Text variant="footnote" tone="secondary">
        Your trainers can see this.
      </Text>
      <Sheet visible={sheet.open} onClose={() => setSheet((s) => ({ ...s, open: false }))} title="Add measurements">
        <MeasurementsForm
          key={sheet.key}
          measurements={measurements}
          lengths={lengths}
          onSaved={() => {
            setSheet((s) => ({ ...s, open: false }));
            onSaved();
          }}
        />
      </Sheet>
    </Card>
  );
}

type Texts = Record<MeasurementKey, string>;

function textsFor(row: Measurements | null, lengths: LengthUnit): Texts {
  const texts = {} as Texts;
  for (const { key } of MEASUREMENTS) {
    const value = row?.[key] ?? null;
    texts[key] = value === null ? '' : trim(fromCm(value, lengths));
  }
  return texts;
}

function MeasurementsForm({
  measurements,
  lengths,
  onSaved,
}: {
  measurements: Measurements[];
  lengths: LengthUnit;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(() => dayKey(new Date()));
  const existing = measurements.find((m) => m.day === day) ?? null;
  const [texts, setTexts] = useState<Texts>(() => textsFor(existing, lengths));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The latest of each, as a hint in the empty fields.
  const newest: Measurements = { day, waist_cm: null, hips_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null };
  for (const { key } of MEASUREMENTS) newest[key] = measurements.findLast((m) => m[key] !== null)?.[key] ?? null;
  const latest = textsFor(newest, lengths);

  function changeDay(next: string) {
    setDay(next);
    setProblem(null);
    setTexts(textsFor(measurements.find((m) => m.day === next) ?? null, lengths));
  }

  async function save() {
    setProblem(null);
    const prefilled = textsFor(existing, lengths);
    const row: Measurements = { day, waist_cm: null, hips_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null };
    for (const { key, label, min, max } of MEASUREMENTS) {
      const text = texts[key].trim();
      if (!text) continue;
      // A value left as it was keeps its exact cm.
      const kept = existing?.[key] ?? null;
      const value =
        kept !== null && text === prefilled[key]
          ? kept
          : (() => {
              const typed = parseNumber(text);
              return typed === null ? null : toCm(typed, lengths);
            })();
      if (value === null || value < min || value > max) {
        return setProblem(`${label}: ${rangeLabel(fromCm(min, lengths), fromCm(max, lengths), 1, lengths)}`);
      }
      row[key] = value;
    }
    if (MEASUREMENTS.every(({ key }) => row[key] === null)) return setProblem('Fill in at least one measurement.');
    setBusy(true);
    try {
      await saveMeasurements(row);
      onSaved();
    } catch (e) {
      setProblem(saveError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <DaySwitcher day={day} onChange={changeDay} daysBack={365} />
      {MEASUREMENTS.map(({ key, label }) => (
        <TextField
          key={key}
          label={`${label} (${lengths})`}
          value={texts[key]}
          onChangeText={(t) => setTexts((old) => ({ ...old, [key]: t }))}
          keyboardType="decimal-pad"
          placeholder={latest[key] || '–'}
        />
      ))}
      {existing ? (
        <Text variant="footnote" tone="secondary">
          This replaces the measurements logged that day.
        </Text>
      ) : null}
      <ErrorText>{problem}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </>
  );
}

// ---------- Photos ----------

function PhotosSection({ photos, links }: { photos: ProgressPhoto[]; links: Map<string, SignedPhoto> }) {
  // The newest of each pose.
  const latest = POSES.map((pose) => ({ pose, photo: photos.find((p) => p.pose === pose.key) ?? null }));
  return (
    <Card style={{ gap: Spacing.gutter }}>
      {photos.length ? (
        <>
          <View style={styles.thumbs}>
            {latest.map(({ pose, photo }) => {
              const link = photo ? links.get(photo.path) : undefined;
              return (
                <Pressable
                  key={pose.key}
                  accessibilityRole="button"
                  accessibilityLabel={
                    photo ? `${pose.label} photo, ${dayMonth(photo.day)}` : `Add ${pose.label.toLowerCase()} photo`
                  }
                  onPress={() => router.push('/progress/photos')}
                  style={styles.thumbWrap}>
                  <View style={styles.thumb}>
                    {photo && link ? (
                      <Image
                        source={{ uri: link.url, cacheKey: photo.path }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="body-outline" size={28} color={Colors.textSecondary} />
                    )}
                  </View>
                  <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }} numberOfLines={2}>
                    {pose.label}
                    {photo ? ` · ${dayMonth(photo.day)}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="See all" variant="secondary" onPress={() => router.push('/progress/photos')} />
        </>
      ) : (
        <>
          <Body secondary>Photos from the front, side and back show changes the scale can&apos;t.</Body>
          <Button title="Add progress photos" variant="secondary" onPress={() => router.push('/progress/photos')} />
        </>
      )}
      <Text variant="footnote" tone="secondary">
        Only you and your trainers can see these.
      </Text>
    </Card>
  );
}

// ---------- Weekly check-in ----------

function CheckInSection({ checkIns }: { checkIns: CheckIn[] }) {
  const week = checkInWeekKey();
  const current = checkIns.find((c) => c.week_start === week);
  const replies = checkIns
    .flatMap((c) => c.replies)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 2);
  return (
    <Card style={{ gap: Spacing.gutter }}>
      {current ? (
        <View style={styles.listRow}>
          <Ionicons name="checkmark-circle-outline" size={22} color={Colors.success} />
          <Text variant="callout" style={{ flex: 1 }}>
            Checked in for the week of {dayMonth(week)}
          </Text>
          <Button
            title="Edit"
            variant="ghost"
            size="small"
            accessibilityLabel="Edit this week's check-in"
            onPress={() => router.push('/progress/check-in')}
          />
        </View>
      ) : (
        <>
          <Body>How did your week go?</Body>
          <Button title="Check in" onPress={() => router.push('/progress/check-in')} />
        </>
      )}
      {replies.map((r) => (
        <Text key={`${r.trainer_id}-${r.updated_at}`} variant="callout" numberOfLines={3}>
          <Text style={{ fontFamily: Fonts.textSemi }}>{r.trainer_name}:</Text> {r.body}
        </Text>
      ))}
      {checkIns.length ? (
        <Button
          title="See all check-ins"
          variant="ghost"
          size="small"
          onPress={() => router.push('/progress/check-in')}
          style={{ alignSelf: 'flex-start', marginLeft: -14 }}
        />
      ) : null}
    </Card>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.gutter,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 48,
  },
  listLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  listDay: {
    width: 72,
  },
  tiles: {
    gap: Spacing.two,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Same padding as a tile, so all three in a row get the same width.
  tileSpacer: {
    flex: 1,
    paddingHorizontal: Spacing.tight,
  },
  tile: {
    flex: 1,
    gap: 2,
    paddingHorizontal: Spacing.tight,
    paddingVertical: Spacing.tight,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.tint,
  },
  thumbs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumbWrap: {
    flex: 1,
    gap: Spacing.two,
  },
  thumb: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
}));
