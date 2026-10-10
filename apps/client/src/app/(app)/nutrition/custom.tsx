import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodSheet } from '@/components/food-sheet';
import { Button, ErrorText, Notice, Section, Segmented, Text, TextField } from '@/components/ui';
import { Colors, Fonts, Layout, Spacing, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { dayKey, isBarcode, isDayKey, isMeal, mealForNow, mealLabel } from '@/lib/food';
import { addToDiary, saveMyFood, type SavedFood } from '@/lib/nutrition';

type Basis = '100g' | '100ml' | 'serving';

const BASIS: { value: Basis; label: string }[] = [
  { value: '100g', label: '100 g' },
  { value: '100ml', label: '100 ml' },
  { value: 'serving', label: '1 serving' },
];

const ENERGY: { value: 'kcal' | 'kJ'; label: string }[] = [
  { value: 'kcal', label: 'kcal' },
  { value: 'kJ', label: 'kJ' },
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
  const insets = useSafeAreaInsets();

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

  const kj = energyUnit === 'kJ' ? parse(energy) : null;
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Enter it yourself' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {scanned ? (
          <Notice>
            <Text variant="callout" style={{ fontFamily: Fonts.textMedium }}>
              {params.name ? 'No calories listed for this one yet. ' : 'We don’t know this barcode yet. '}
            </Text>
            Add it from the label once. Next time you scan {scanned}, Voltrix finds it.
          </Notice>
        ) : null}

        <Section title="Food">
          <View style={styles.fields}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="For example: Chicken curry"
              autoCapitalize="sentences"
              maxLength={200}
            />
            <TextField
              label="Brand"
              optional
              value={brand}
              onChangeText={setBrand}
              placeholder="For example: Woolworths"
              maxLength={200}
            />
            <TextField
              label="Barcode"
              optional
              value={barcode}
              onChangeText={(t) => setBarcode(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={14}
              placeholder="The numbers under the barcode"
            />
          </View>
        </Section>

        <Section title="From the label">
          <View style={styles.fields}>
            <View style={{ gap: Spacing.two }}>
              <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
                The numbers are for
              </Text>
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
              <Segmented options={ENERGY} value={energyUnit} onChange={setEnergyUnit} style={{ width: 132 }} />
            </View>
            {kj ? (
              <Text variant="footnote" tone="secondary" style={{ marginTop: -Spacing.two }}>
                That’s {Math.round(kj / 4.184)} kcal.
              </Text>
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
              label={`One serving in ${measure}`}
              optional
              value={servingSize}
              onChangeText={(t) => setServingSize(numberOnly(t))}
              keyboardType="decimal-pad"
              placeholder={liquid ? 'For example 250' : 'For example 30'}
              maxLength={7}
            />
          </View>
        </Section>

        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          It’s saved to your foods, so you can find it in Search next time.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.footerInner}>
          <ErrorText>{error}</ErrorText>
          <Button title="Save and add" onPress={save} loading={busy} />
        </View>
      </View>

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

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.section,
    gap: Spacing.section,
  },
  fields: {
    gap: Spacing.three,
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
  footer: {
    paddingTop: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerInner: {
    width: '100%',
    maxWidth: Layout.maxClient - Spacing.gutter * 2,
    alignSelf: 'center',
    gap: Spacing.two,
  },
}));
