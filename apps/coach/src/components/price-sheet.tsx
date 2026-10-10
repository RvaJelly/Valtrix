import { useState } from 'react';
import { View } from 'react-native';

import { PriceField } from '@/components/price-field';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Segmented, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { formatMoney, moneyInput, parseMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';

type Which = 'usual' | 'own';

// A client's price per session: the trainer's usual price, or their own.
export function PriceSheet({
  client,
  visible,
  onClose,
  onSaved,
}: {
  client: { id: string; first_name: string; session_price_cents: number | null };
  visible: boolean;
  onClose: () => void;
  onSaved: (cents: number | null) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`${client.first_name}’s session price`}>
      <PriceForm key={visible ? 'open' : 'closed'} client={client} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function PriceForm({
  client,
  onClose,
  onSaved,
}: {
  client: { id: string; first_name: string; session_price_cents: number | null };
  onClose: () => void;
  onSaved: (cents: number | null) => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const currency = profile?.currency ?? 'ZAR';
  const usual = profile?.session_price_cents ?? null;
  const [which, setWhich] = useState<Which>(client.session_price_cents == null ? 'usual' : 'own');
  const [text, setText] = useState(moneyInput(client.session_price_cents));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseMoney(text, currency);
  // Own price needs a price that reads.
  const blocked = which === 'own' && (parsed.cents == null || !!parsed.error);

  async function save() {
    if (blocked) return;
    const cents = which === 'own' ? parsed.cents : null;
    setSaving(true);
    setError(null);
    const { error: failure } = await supabase
      .from('clients')
      .update({ session_price_cents: cents })
      .eq('id', client.id);
    setSaving(false);
    if (failure) {
      haptic.warning();
      return setError(plainError(failure, 'Couldn’t save. Try again.'));
    }
    haptic.success();
    onSaved(cents);
    onClose();
    toast('Saved');
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Segmented
        options={[
          { value: 'usual', label: usual == null ? 'No usual price' : `Usual (${formatMoney(usual, currency)})` },
          { value: 'own', label: 'Own price' },
        ]}
        value={which}
        onChange={setWhich}
      />
      {which === 'own' ? (
        <PriceField
          label={`${client.first_name}’s price per session`}
          value={text}
          onChangeText={setText}
          currency={currency}
          placeholder={usual == null ? '400' : moneyInput(usual)}
          error={parsed.error}
        />
      ) : null}
      <Text variant="footnote" tone="secondary">
        Used for new bookings. Sessions already booked keep their price.
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={saving} disabled={blocked} testID="price-sheet-save" />
    </View>
  );
}
