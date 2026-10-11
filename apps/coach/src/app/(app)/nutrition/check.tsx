import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { FoodRow, FoodSheet } from '@/components/food-sheet';
import { Body, Button, ErrorText, Group, IconTile, ListRow, SearchField, SkeletonRows, Text } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { FOOD_CREDIT, FoodError, fullProduct, searchFoods, type Food } from '@/lib/food';

// Look up any food's calories, protein, carbs and fat, by barcode or by name.
export default function CheckFood() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; foods: Food[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);

  async function search() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    try {
      setResults({ query: q, foods: await searchFoods(q) });
    } catch (e) {
      setError(e instanceof FoodError ? e.message : 'Couldn’t search right now. Try again.');
    }
    setSearching(false);
  }

  // Products open from their full product page, which has the serving size.
  async function open(item: Food, index: number) {
    setError(null);
    if (!item.barcode) return setFood(item);
    setOpening(index);
    try {
      setFood(await fullProduct(item));
    } catch (e) {
      setError(e instanceof FoodError ? e.message : 'Couldn’t open that one. Try again.');
    }
    setOpening(null);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <Stack.Screen options={{ title: 'Check a food' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Group>
          <ListRow
            title="Scan a barcode"
            subtitle="Point the camera at the pack"
            leading={<IconTile icon="barcode-outline" />}
            onPress={() => router.push('/nutrition/scan')}
            last
          />
        </Group>

        <Text variant="label" tone="secondary" style={styles.or}>
          or search by name
        </Text>
        <View style={styles.searchRow}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="For example Weet-Bix"
            accessibilityLabel="Search foods"
            autoCapitalize="sentences"
            onSubmitEditing={search}
            style={{ flex: 1 }}
          />
          <Button
            title="Search"
            variant="secondary"
            onPress={search}
            loading={searching}
            disabled={!query.trim()}
            testID="food-search"
          />
        </View>

        <ErrorText>{error}</ErrorText>
        {searching ? <SkeletonRows count={4} /> : null}

        {results && !searching ? (
          results.foods.length ? (
            <View style={{ gap: Spacing.two }}>
              {results.foods.map((f, i) => (
                <FoodRow
                  key={`${f.barcode ?? f.name}-${i}`}
                  food={f}
                  loading={opening === i}
                  onPress={() => open(f, i)}
                />
              ))}
              <Text variant="footnote" tone="secondary" style={styles.credit}>
                {FOOD_CREDIT}. South African products show first.
              </Text>
            </View>
          ) : (
            <Body secondary>Nothing found for “{results.query}”. Try other words or scan the barcode.</Body>
          )
        ) : null}
      </ScrollView>

      <FoodSheet mode="info" food={food} onClose={() => setFood(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  or: {
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  credit: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
}));
