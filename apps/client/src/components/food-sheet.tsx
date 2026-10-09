import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
  type Macros,
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
      setError(e instanceof Error && e.message ? e.message : 'Could not save that. Try again.');
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
      setError(e instanceof Error && e.message ? e.message : 'Could not remove that. Try again.');
      setBusy(null);
    }
  }

  return (
    <>
      <View style={styles.header}>
        {food.image ? (
          <Image source={{ uri: food.image }} style={styles.image} contentFit="cover" accessibilityLabel="" />
        ) : (
          <View style={[styles.image, styles.noImage]}>
            <Ionicons name="nutrition" size={26} color={Colors.accentText} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={3}>
            {food.name}
          </Text>
          {food.brand ? <Text style={styles.brand}>{food.brand}</Text> : null}
        </View>
      </View>

      <View style={styles.facts}>
        {/* A diary entry knows only the unit it was logged in, so don't show an empty box for the other. */}
        {food.per100 || mode !== 'edit' ? <Fact title={`Per 100 ${baseUnit(food)}`} macros={food.per100} /> : null}
        {serving || mode !== 'edit' ? (
          <Fact title={serving ? servingLabel(food) : 'Per serving'} macros={serving} />
        ) : null}
      </View>

      {units.length ? (
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.label}>{mode === 'info' ? 'Work out an amount' : 'How much?'}</Text>
          {units.length > 1 ? (
            <View style={styles.segmented}>
              {units.map((u) => (
                <Pressable
                  key={u}
                  accessibilityRole="button"
                  accessibilityState={{ selected: u === unit }}
                  onPress={() => switchUnit(u)}
                  style={[styles.segment, u === unit && { backgroundColor: Colors.accent }]}>
                  <Text style={[styles.segmentText, u === unit && { color: Colors.onAccent }]}>{unitName(u)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.amountRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              onPress={() => step(-1)}
              style={({ pressed }) => [styles.stepper, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <Ionicons name="remove" size={24} color={Colors.text} />
            </Pressable>
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
              <Text style={styles.amountUnit}>
                {unit === 'serving' ? (amount === 1 ? 'serving' : 'servings') : unit}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => step(1)}
              style={({ pressed }) => [styles.stepper, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <Ionicons name="add" size={24} color={Colors.text} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {units.length ? (
        <View
          style={styles.total}
          accessible
          accessibilityLabel={totals ? `Adds up to ${formatKcal(totals.kcal)}` : ''}>
          <Text style={styles.totalKcal}>{totals ? formatKcal(totals.kcal) : '–'}</Text>
          <Text style={styles.totalMacros}>
            {totals
              ? `Protein ${formatGrams(totals.protein)} · Carbs ${formatGrams(totals.carbs)} · Fat ${formatGrams(totals.fat)}`
              : 'Enter an amount'}
          </Text>
        </View>
      ) : null}

      {!units.length ? <Text style={styles.note}>No calories are listed for this one yet.</Text> : null}

      <ErrorText>{error}</ErrorText>
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
        <Pressable
          accessibilityRole="button"
          onPress={remove}
          disabled={!!busy}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}>
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
          <Text style={styles.removeText}>{busy === 'remove' ? 'Removing…' : 'Remove from diary'}</Text>
        </Pressable>
      ) : null}
      <Button title={mode === 'info' ? 'Done' : 'Cancel'} variant="ghost" onPress={onClose} disabled={!!busy} />
      {food.source === 'off' ? <Text style={styles.credit}>{FOOD_CREDIT}</Text> : null}
      {food.source === 'mine' ? <Text style={styles.credit}>One of your own foods</Text> : null}
    </>
  );
}

// One food in a list, with its calories.
export function FoodRow({ food, onPress, loading }: { food: Food; onPress: () => void; loading?: boolean }) {
  const serving = perServing(food);
  const detail = food.per100
    ? `${formatKcal(food.per100.kcal)} per 100 ${baseUnit(food)}`
    : serving
      ? `${formatKcal(serving.kcal)} per serving`
      : 'No calories listed';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${food.name}${food.brand ? `, ${food.brand}` : ''}. ${detail}`}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      {food.image ? (
        <Image source={{ uri: food.image }} style={styles.rowImage} contentFit="cover" accessibilityLabel="" />
      ) : (
        <View style={[styles.rowImage, styles.noImage]}>
          <Ionicons
            name={food.source === 'recent' ? 'time-outline' : 'nutrition'}
            size={20}
            color={Colors.accentText}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={2}>
          {food.name}
        </Text>
        <Text style={styles.rowDetail} numberOfLines={1}>
          {[food.brand, detail].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.accentText} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      )}
    </Pressable>
  );
}

function Fact({ title, macros }: { title: string; macros: Macros | null }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.factKcal, !macros && { color: Colors.textSecondary }]}>
        {macros ? formatKcal(macros.kcal) : 'Not listed'}
      </Text>
      {macros ? (
        <Text style={styles.factMacros}>
          Protein {formatGrams(macros.protein)}
          {'\n'}Carbs {formatGrams(macros.carbs)}
          {'\n'}Fat {formatGrams(macros.fat)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  rowImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.small,
    backgroundColor: Colors.background,
  },
  rowName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  rowDetail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  name: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  brand: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  facts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  fact: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  factTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  factKcal: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  factMacros: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
  segmentText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderColor: Colors.accentText,
    paddingHorizontal: Spacing.three - 1,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    outlineWidth: 0,
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    paddingVertical: Spacing.two,
  },
  amountUnit: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  total: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
  },
  totalKcal: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  totalMacros: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  removeText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  credit: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
}));
