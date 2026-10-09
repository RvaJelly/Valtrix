import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { FoodSheet } from '@/components/food-sheet';
import { FoodError, lookupBarcode, type Food } from '@/lib/food';

// Scan a barcode (or type its number) to see a food's calories, protein, carbs and fat.
export default function ScanFood() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);

  async function lookUp(code: string) {
    setBusy(true);
    setMessage(null);
    try {
      const found = await lookupBarcode(code);
      if (found) {
        // Stays busy while the food is open, so the camera doesn't scan behind it.
        setFood(found);
        return;
      }
      setMessage(`We couldn't find ${code}. Try searching for it by name.`);
    } catch (e) {
      setMessage(e instanceof FoodError ? e.message : "Couldn't look that up right now. Try again.");
    }
    setBusy(false);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/nutrition/check');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <BarcodeScanner onCode={lookUp} busy={busy} message={message} onClose={close} />
      <FoodSheet
        mode="info"
        food={food}
        onClose={() => {
          setFood(null);
          setBusy(false);
        }}
      />
    </>
  );
}
