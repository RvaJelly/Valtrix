import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { FoodSheet } from '@/components/food-sheet';
import { Body, Button, ErrorText, segmentOn, Text, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { dayKey, isBarcode, isDayKey, isMeal, mealForNow, mealLabel } from '@/lib/food';
import { addToDiary, saveMyFood, type SavedFood } from '@/lib/nutrition';

type Basis = '100g' | '100ml' | 'serving';

const BASIS: { key: Basis; label: string }[] = [
  { key: '100g', label: '100 g' },
  { key: '100ml', label: '100 ml' },
  { key: 'serving', label: '1 serving' },
];

// "12,5" and "12.5" both work; blank is fine for the optional numbers.
function parse(text: string) {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function numberOnly(text: string) {
  return text.replace(/[^0-9.,]/g, '');
}

// Type in a food from its label. It's saved as the person's own food, so Search
// finds it and the next scan of its barcode does too.
export default function CustomFood() {
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    barcode?: string;
    name?: string;
    brand?: string;
  }>();
  const meal = isMeal(params.meal) ? params.meal : mealForNow();
  const day = isDayKey(params.day) ? params.day : dayKey(new Date());
  const scanned = params.barcode && isBarcode(params.barcode) ? params.barcode : '';
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState(params.brand ?? '');
  const [barcode, setBarcode] = useState(scanned);
  const [basis, setBasis] = useState<Basis>('100g');
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal');
  const [energy, setEnergy] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What this form saved, kept after Cancel so saving again changes it instead of adding a copy.
  const [saved, setSaved] = useState<SavedFood | null>(null);
  const [adding, setAdding] = useState(false);

  const liquid = basis === '100ml';
  const measure = liquid ? 'ml' : 'g';

  async function save() {
    const code = barcode.replace(/\D/g, '');
    const value = parse(energy);
    const macros = [parse(protein), parse(carbs), parse(fat)];
    const size = parse(servingSize);
    if (!name.trim()) return setError('Give the food a name.');
    if (code && !isBarcode(code)) return setError('Barcodes have 8 to 14 numbers. Check it, or leave it empty.');
    if (value === null || Number.isNaN(value) || value < 0) return setError('Enter the calories from the label.');
    const kcal = energyUnit === 'kJ' ? value / 4.184 : value;
    if (basis !== 'serving' && kcal > 950)
      return setError('That is more calories than any food has in 100 g. Check the number.');
    if (kcal > 20000) return setError('That is a lot of calories. Check the number.');
    if (macros.some((m) => m !== null && (Number.isNaN(m) || m < 0 || m > 5000)))
      return setError('Protein, carbs and fat must be numbers, or left empty.');
    if (size !== null && (Number.isNaN(size) || size <= 0 || size > 10000))
      return setError(`Enter the serving size in ${measure}, or leave it empty.`);
    setError(null);
    setBusy(true);
    try {
      const food = await saveMyFood(
        {
          barcode: code || null,
          name: name.trim().slice(0, 200),
          brand: brand.trim().slice(0, 200) || null,
          per: basis === 'serving' ? 'serving' : '100g',
          kcal: Math.round(kcal * 10) / 10,
          protein: macros[0],
          carbs: macros[1],
          fat: macros[2],
          serving_size: size,
          liquid,
        },
        saved,
      );
      setSaved(food);
      setAdding(true);
    } catch (e) {
      setError(plainError(e, 'Could not save your food. Try again.'));
    }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Enter it yourself' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {scanned ? (
          <View style={styles.notice}>
            <Ionicons name="barcode-outline" size={24} color={Colors.textSecondary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.noticeTitle}>
                {params.name ? 'No calories listed for this one yet' : 'We don’t know this barcode yet'}
              </Text>
              <Body secondary style={{ fontSize: 14, lineHeight: 20 }}>
                Add it from the label once. Next time you scan {scanned}, Voltrix will find it.
              </Body>
            </View>
          </View>
        ) : null}

        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="For example: Chicken curry"
          autoCapitalize="sentences"
          maxLength={200}
        />
        <TextField
          label="Brand (optional)"
          value={brand}
          onChangeText={setBrand}
          placeholder="For example: Woolworths"
          maxLength={200}
        />
        <TextField
          label="Barcode (optional)"
          value={barcode}
          onChangeText={(t) => setBarcode(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={14}
          placeholder="The numbers under the barcode"
        />

        <View style={{ gap: Spacing.two }}>
          <Text style={styles.label}>The numbers on the label are for</Text>
          <Segmented options={BASIS} value={basis} onChange={setBasis} />
        </View>

        <View style={styles.energyRow}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Energy"
              value={energy}
              onChangeText={(t) => setEnergy(numberOnly(t))}
              keyboardType="decimal-pad"
              placeholder={energyUnit === 'kJ' ? 'kJ' : 'kcal'}
              maxLength={7}
            />
          </View>
          <View style={{ width: 140 }}>
            <Segmented
              options={[
                { key: 'kcal', label: 'kcal' },
                { key: 'kJ', label: 'kJ' },
              ]}
              value={energyUnit}
              onChange={setEnergyUnit}
            />
          </View>
        </View>
        {energyUnit === 'kJ' && parse(energy) ? (
          <Body secondary style={{ fontSize: 14, marginTop: -Spacing.two }}>
            That’s {Math.round((parse(energy) ?? 0) / 4.184)} kcal.
          </Body>
        ) : null}

        <View style={styles.macroRow}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Protein g"
              value={protein}
              onChangeText={(t) => setProtein(numberOnly(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              maxLength={6}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Carbs g"
              value={carbs}
              onChangeText={(t) => setCarbs(numberOnly(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              maxLength={6}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Fat g"
              value={fat}
              onChangeText={(t) => setFat(numberOnly(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              maxLength={6}
            />
          </View>
        </View>

        <TextField
          label={`One serving in ${measure} (optional)`}
          value={servingSize}
          onChangeText={(t) => setServingSize(numberOnly(t))}
          keyboardType="decimal-pad"
          placeholder={liquid ? 'For example 250' : 'For example 30'}
          maxLength={7}
        />

        <ErrorText>{error}</ErrorText>
        <Button title="Save and add" onPress={save} loading={busy} />
        <Body secondary style={{ fontSize: 14, textAlign: 'center' }}>
          It’s saved to your foods, so you can find it in Search next time.
        </Body>
      </ScrollView>

      <FoodSheet
        mode="add"
        food={adding && saved ? saved.food : null}
        actionLabel={`Add to ${mealLabel(meal)}`}
        onClose={() => setAdding(false)}
        onSubmit={async (amount, unit) => {
          if (!saved) return;
          await addToDiary(saved.food, amount, unit, meal, day);
          setAdding(false);
          router.dismissTo('/nutrition');
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="button"
          accessibilityState={{ selected: o.key === value }}
          onPress={() => onChange(o.key)}
          style={[styles.segment, o.key === value && segmentOn()]}>
          <Text style={[styles.segmentText, o.key !== value && { color: Colors.textSecondary }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  noticeTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    minHeight: 52,
    padding: 3,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  segmentText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
}));
