import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, ErrorText, Group, IconButton, IconTile, ListRow, Segmented, StatStrip, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import {
  baseUnit,
  FOOD_CREDIT,
  formatGrams,
  formatKcal,
  nutrientsFor,
  perServing,
  servingLabel,
  startingAmount,
  unitsFor,
  type Food,
  type Unit,
} from '@/lib/food';

type Props = {
  // The food to show; null hides the sheet.
  food: Food | null;
  onClose: () => void;
  // add: pick an amount and add it. edit: change the amount or remove it. info: just look.
  mode: 'add' | 'edit' | 'info';
  // The main button, like "Add to Breakfast".
  actionLabel?: string;
  initial?: { amount: number; unit: Unit };
  // Throw to show a problem in the sheet.
  onSubmit?: (amount: number, unit: Unit) => Promise<void>;
  onRemove?: () => Promise<void>;
  // Extra buttons under the main one.
  footer?: ReactNode;
};

type Shown = { food: Food; initial?: Props['initial']; key: string };

// A food's calories per 100 g and per serving, with an amount picker and what it adds up to.
export function FoodSheet({ food, onClose, ...rest }: Props) {
  // The same food can come back as a new object, so it is told apart by what it shows.
  const key = food ? `${food.source}|${food.barcode}|${food.name}|${rest.initial?.amount}|${rest.initial?.unit}` : null;
  // The last food stays on the sheet while it slides away, so it doesn't empty out first.
  // Each opening starts afresh, even for the same food.
  const [last, setLast] = useState<{ key: string | null; opened: number; shown: Shown | null }>({
    key: null,
    opened: 0,
    shown: null,
  });
  if (key !== last.key) {
    const opened = key ? last.opened + 1 : last.opened;
    setLast({
      key,
      opened,
      shown: food && key ? { food, initial: rest.initial, key: `${opened}|${key}` } : last.shown,
    });
  }
  const shown = last.shown;
  return (
    <Sheet visible={!!food} onClose={onClose}>
      {shown ? (
        <FoodDetails key={shown.key} {...rest} food={shown.food} initial={shown.initial} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

const STEP: Record<Unit, number> = { g: 10, ml: 10, serving: 0.5 };

function unitName(unit: Unit) {
  return unit === 'serving' ? 'Servings' : unit === 'ml' ? 'ml' : 'Grams';
}

function FoodDetails({
  food,
  onClose,
  mode,
  actionLabel,
  initial,
  onSubmit,
  onRemove,
  footer,
}: Props & { food: Food }) {
  const units = unitsFor(food);
  const start = initial ?? startingAmount(food);
  const [unit, setUnit] = useState<Unit>(units.includes(start.unit) ? start.unit : (units[0] ?? 'g'));
  const [text, setText] = useState(String(start.amount));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const amount = Number(text.replace(',', '.'));
  const totals = nutrientsFor(food, amount, unit);
  const serving = perServing(food);
  const size = food.serving?.size ?? null;

  function switchUnit(next: Unit) {
    if (next === unit) return;
    // Keep the same food on the plate when switching between grams and servings.
    if (Number.isFinite(amount) && amount > 0 && size) {
      const converted = next === 'serving' ? amount / size : amount * size;
      setText(String(Math.round(converted * (next === 'serving' ? 100 : 1)) / (next === 'serving' ? 100 : 1)));
    } else {
      setText(next === 'serving' ? '1' : '100');
    }
    setUnit(next);
  }

  function step(direction: 1 | -1) {
    const current = Number.isFinite(amount) ? amount : 0;
    const next = Math.max(STEP[unit], Math.round((current + direction * STEP[unit]) * 100) / 100);
    setText(String(next));
  }

  async function submit() {
    if (!onSubmit) return;
    if (!(amount > 0) || amount > (unit === 'serving' ? 100 : 100000)) {
      setError('Enter an amount above 0.');
      return;
    }
    setError(null);
    setBusy('save');
    try {
      await onSubmit(amount, unit);
    } catch (e) {
      setError(plainError(e, 'Could not save that. Try again.'));
      setBusy(null);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setError(null);
    setBusy('remove');
    try {
      await onRemove();
    } catch (e) {
      setError(plainError(e, 'Could not remove that. Try again.'));
      setBusy(null);
    }
  }

  // A diary entry knows only the unit it was logged in, so don't show an empty row for the other.
  const showPer100 = !!food.per100 || mode !== 'edit';
  return (
    <>
      <View style={styles.header}>
        {food.image ? (
          <Image source={{ uri: food.image }} style={styles.image} contentFit="cover" accessibilityLabel="" />
        ) : (
          <IconTile icon="restaurant-outline" style={styles.image} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={3}>
            {food.name}
          </Text>
          {food.brand ? (
            <Text variant="footnote" tone="secondary">
              {food.brand}
            </Text>
          ) : null}
        </View>
      </View>

      {showPer100 ? (
        <View style={{ gap: Spacing.two }}>
          <View style={styles.factsHeader}>
            <Text variant="label" tone="secondary" style={{ flex: 1 }}>
              Per 100 {baseUnit(food)}
            </Text>
            <Text variant="footnote" tone="secondary" style={Tabular}>
              {food.per100 ? formatKcal(food.per100.kcal) : 'Not listed'}
            </Text>
          </View>
          {food.per100 ? (
            <View style={styles.facts}>
              <StatStrip
                items={[
                  { value: formatGrams(food.per100.protein), label: 'Protein' },
                  { value: formatGrams(food.per100.carbs), label: 'Carbs' },
                  { value: formatGrams(food.per100.fat), label: 'Fat' },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {serving || mode !== 'edit' ? (
        <Text variant="footnote" tone="secondary">
          {serving
            ? `${servingLabel(food)}: ${formatKcal(serving.kcal)} · Protein ${formatGrams(serving.protein)} · Carbs ${formatGrams(serving.carbs)} · Fat ${formatGrams(serving.fat)}`
            : 'No serving size listed.'}
        </Text>
      ) : null}

      {units.length ? (
        <View style={{ gap: Spacing.tight }}>
          <Text variant="label" tone="secondary">
            {mode === 'info' ? 'Work out an amount' : 'How much?'}
          </Text>
          {units.length > 1 ? (
            <Segmented
              options={units.map((u) => ({ value: u, label: unitName(u) }))}
              value={unit}
              onChange={switchUnit}
            />
          ) : null}
          <View style={styles.amountRow}>
            <IconButton icon="remove" label="Less" variant="tonal" onPress={() => step(-1)} style={styles.stepper} />
            <View style={[styles.amountBox, focused && styles.amountBoxFocused]}>
              <TextInput
                accessibilityLabel="Amount"
                value={text}
                onChangeText={(t) => setText(t.replace(/[^0-9.,]/g, ''))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="decimal-pad"
                selectTextOnFocus
                maxLength={7}
                selectionColor={Colors.accent}
                style={styles.amountInput}
              />
              <Text variant="callout" tone="secondary">
                {unit === 'serving' ? (amount === 1 ? 'serving' : 'servings') : unit}
              </Text>
            </View>
            <IconButton icon="add" label="More" variant="tonal" onPress={() => step(1)} style={styles.stepper} />
          </View>
        </View>
      ) : null}

      {units.length ? (
        <View
          style={styles.total}
          accessible
          accessibilityLabel={totals ? `Adds up to ${formatKcal(totals.kcal)}` : ''}>
          <Text variant="stat" style={Tabular}>
            {totals ? formatKcal(totals.kcal) : '–'}
          </Text>
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            {totals
              ? `Protein ${formatGrams(totals.protein)} · Carbs ${formatGrams(totals.carbs)} · Fat ${formatGrams(totals.fat)}`
              : 'Enter an amount'}
          </Text>
        </View>
      ) : null}

      {!units.length ? (
        <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
          No calories are listed for this one yet.
        </Text>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <View style={{ gap: Spacing.two }}>
        {onSubmit && units.length ? (
          <Button
            title={actionLabel ?? (mode === 'edit' ? 'Save' : 'Add')}
            onPress={submit}
            loading={busy === 'save'}
            disabled={!!busy}
          />
        ) : null}
        {footer}
        {onRemove ? (
          <Button
            title="Remove from diary"
            icon="trash-outline"
            variant="destructive"
            onPress={remove}
            loading={busy === 'remove'}
            disabled={!!busy}
          />
        ) : null}
        <Button title={mode === 'info' ? 'Done' : 'Cancel'} variant="ghost" onPress={onClose} disabled={!!busy} />
      </View>
      {food.source === 'off' ? (
        <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          {FOOD_CREDIT}
        </Text>
      ) : null}
      {food.source === 'mine' ? (
        <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          One of your own foods
        </Text>
      ) : null}
    </>
  );
}

// One food in a list, with its calories. On its own it is a small card; `grouped` makes it a row
// of a Group (`last` drops its hairline).
export function FoodRow({
  food,
  onPress,
  loading,
  grouped,
  last,
}: {
  food: Food;
  onPress: () => void;
  loading?: boolean;
  grouped?: boolean;
  last?: boolean;
}) {
  const serving = perServing(food);
  const detail = food.per100
    ? `${formatKcal(food.per100.kcal)} per 100 ${baseUnit(food)}`
    : serving
      ? `${formatKcal(serving.kcal)} per serving`
      : 'No calories listed';
  const row = (
    <ListRow
      title={food.name}
      titleLines={2}
      subtitle={[food.brand, detail].filter(Boolean).join(' · ')}
      leading={
        food.image ? (
          <Image source={{ uri: food.image }} style={styles.rowImage} contentFit="cover" accessibilityLabel="" />
        ) : (
          <IconTile icon={food.source === 'recent' ? 'time-outline' : 'restaurant-outline'} />
        )
      }
      trailing={loading ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : null}
      chevron={!loading}
      accessibilityLabel={`${food.name}${food.brand ? `, ${food.brand}` : ''}. ${detail}`}
      onPress={loading ? undefined : onPress}
      last={!grouped || last}
    />
  );
  return grouped ? row : <Group>{row}</Group>;
}

const styles = themed(() => ({
  rowImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.tint,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  factsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  facts: {
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.one,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  stepper: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  amountBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  amountBoxFocused: {
    // The whole box shows focus, in place of the browser's outline around the number only.
    borderWidth: 2,
    borderColor: Colors.text,
    paddingHorizontal: Spacing.three - 1,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    outlineWidth: 0,
    color: Colors.text,
    fontFamily: Fonts.displaySemi,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    paddingVertical: Spacing.two,
  },
  total: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
}));
