import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { FoodSheet } from '@/components/food-sheet';
import {
  dayKey,
  FoodError,
  hasNutrition,
  isDayKey,
  isMeal,
  lookupBarcode,
  mealForNow,
  mealLabel,
  type Food,
} from '@/lib/food';
import { useGoBack } from '@/lib/nav';
import { addToDiary, findMyFood } from '@/lib/nutrition';

// Scan a barcode (or type its number) and add the food to the diary. Barcodes the
// person saved themselves are found first; unknown ones go to "Enter it yourself".
export default function ScanFood() {
  const goBack = useGoBack();
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  const meal = isMeal(params.meal) ? params.meal : mealForNow();
  const day = isDayKey(params.day) ? params.day : dayKey(new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);

  async function lookUp(code: string) {
    setBusy(true);
    setMessage(null);
    try {
      const found = (await findMyFood(code).catch(() => null)) ?? (await lookupBarcode(code));
      if (found && hasNutrition(found)) {
        // Stays busy while the food is open, so the camera doesn't scan behind it.
        setFood(found);
        return;
      }
      router.replace({
        pathname: '/nutrition/custom',
        params: { meal, day, barcode: code, name: found?.name ?? '', brand: found?.brand ?? '' },
      });
    } catch (e) {
      setMessage(e instanceof FoodError ? e.message : "Couldn't look that up right now. Try again.");
      setBusy(false);
    }
  }

  function close() {
    goBack('/nutrition');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <BarcodeScanner onCode={lookUp} busy={busy} message={message} onClose={close} />
      <FoodSheet
        mode="add"
        food={food}
        actionLabel={`Add to ${mealLabel(meal)}`}
        onClose={() => {
          setFood(null);
          setBusy(false);
        }}
        onSubmit={async (amount, unit) => {
          if (!food) return;
          await addToDiary(food, amount, unit, meal, day);
          setFood(null);
          router.dismissTo('/nutrition');
        }}
      />
    </>
  );
}
