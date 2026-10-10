import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { PriceField } from '@/components/price-field';
import { SettingsPage } from '@/components/settings-parts';
import { Sheet } from '@/components/sheet';
import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, ListRow, Notice, Section, SkeletonRows, Text, useDelayed } from '@/components/ui';
import { Colors, Tabular } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fullName } from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import { fillPrices, loadTotals, unpricedOf } from '@/lib/earnings';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useLeaveGuard } from '@/lib/leave-guard';
import { CURRENCIES, currencyOf, formatMoney, moneyInput, parseMoney, priceLabel } from '@/lib/money';
import { addDays } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { CALLING_CODES, countryOf } from '@/lib/whatsapp';

type OwnPrice = { id: string; first_name: string; last_name: string | null; session_price_cents: number };

// The trainer's usual price per session, its currency, and the country that sets the code for
// WhatsApp numbers. Clients with their own price are listed under it.
export default function PriceSettings() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const savedPrice = profile?.session_price_cents ?? null;
  const savedCurrency = profile?.currency ?? 'ZAR';
  const savedCountry = profile?.country ?? 'ZA';
  const [price, setPrice] = useState(moneyInput(savedPrice));
  const [currency, setCurrency] = useState(savedCurrency);
  const [country, setCountry] = useState(savedCountry);
  const [picking, setPicking] = useState<'currency' | 'country' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnPrice[] | null>(null);
  // Any session has a price, so changing the currency asks first.
  const [anyPriced, setAnyPriced] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);

  const parsed = parseMoney(price, currency);
  const changed = parsed.cents !== savedPrice || currency !== savedCurrency || country !== savedCountry;
  useLeaveGuard(changed && !saving);

  const load = useCallback(async () => {
    const [clients, priced] = await Promise.all([
      supabase
        .from('clients')
        .select('id, first_name, last_name, session_price_cents')
        .not('session_price_cents', 'is', null)
        .neq('status', 'archived')
        .order('first_name'),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).not('price_cents', 'is', null),
    ]);
    if (clients.error) return setFailed(true);
    setFailed(false);
    setOwn((clients.data ?? []) as OwnPrice[]);
    setAnyPriced(!priced.error && (priced.count ?? 0) > 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function chooseCurrency(code: string) {
    if (code === currency) return setPicking(null);
    if (anyPriced) {
      const next = currencyOf(code).name;
      const ok = await confirm(
        `Change to ${next}?`,
        `Sessions already booked keep their price in ${currencyOf(savedCurrency).name}. New bookings use ${next}.`,
        'Change currency',
      );
      if (!ok) return;
    }
    haptic.select();
    setCurrency(code);
    setPicking(null);
  }

  function chooseCountry(code: string) {
    haptic.select();
    setCountry(code);
    setPicking(null);
  }

  async function save() {
    if (!profile || parsed.error) return;
    setSaving(true);
    setError(null);
    const first = savedPrice == null && parsed.cents != null;
    const { error: failure } = await supabase
      .from('profiles')
      .update({ session_price_cents: parsed.cents, currency, country })
      .eq('id', profile.id);
    if (failure) {
      setSaving(false);
      haptic.warning();
      return setError(plainError(failure, 'Couldn’t save. Try again.'));
    }
    haptic.success();
    await refreshProfile();
    setSaving(false);
    toast('Saved');
    if (first) await offerToFill();
  }

  // The first usual price: sessions from the last 90 days and the ones already booked can take it.
  async function offerToFill() {
    const now = new Date();
    const from = addDays(now, -90);
    const to = addDays(now, 300);
    try {
      const totals = await loadTotals(from, to);
      const count = totals ? unpricedOf(totals) : 0;
      if (!count) return;
      const ok = await confirm(
        'Price your sessions?',
        `${count === 1 ? '1 session from the last 90 days or already booked has' : `${count} sessions from the last 90 days or already booked have`} no price. Give ${count === 1 ? 'it' : 'them'} your usual price, or a client’s own price where they have one?`,
        'Use prices',
      );
      if (!ok) return;
      const priced = await fillPrices(from, to);
      toast(priced === 1 ? '1 session priced' : `${priced} sessions priced`);
    } catch (e) {
      toast(plainError(e, 'Couldn’t price your sessions. Try again from Earnings.'));
    }
  }

  const place = countryOf(country);
  return (
    <SettingsPage
      footer={
        <StickyFooter>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Save"
            onPress={save}
            loading={saving}
            disabled={!changed || !!parsed.error}
            testID="prices-save"
          />
        </StickyFooter>
      }>
      <Section title="Usual price">
        <PriceField
          label="Price per session"
          value={price}
          onChangeText={setPrice}
          currency={currency}
          placeholder="400"
          error={parsed.error}
          testID="prices-price"
        />
        <Group>
          <ListRow
            title="Currency"
            trailing={
              <Text variant="callout" tone="secondary" numberOfLines={1}>
                {currencyOf(currency).name}
              </Text>
            }
            onPress={() => setPicking('currency')}
            accessibilityLabel={`Currency: ${currencyOf(currency).name}`}
            testID="prices-currency"
          />
          <ListRow
            title="Country"
            trailing={
              <Text variant="callout" tone="secondary" numberOfLines={1} style={Tabular}>
                {`${place.name} (+${place.code})`}
              </Text>
            }
            onPress={() => setPicking('country')}
            accessibilityLabel={`Country: ${place.name}, +${place.code}`}
            testID="prices-country"
            last
          />
        </Group>
        <Text variant="footnote" tone="secondary">
          New bookings use this price. Sessions already booked keep theirs. The country sets the code for WhatsApp
          numbers.
        </Text>
      </Section>

      {failed ? (
        <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
          Clients with their own price couldn’t be loaded.
        </Notice>
      ) : !own ? (
        showSkeleton ? (
          <SkeletonRows count={3} avatar />
        ) : null
      ) : own.length ? (
        <Section title="Clients with their own price">
          <Group>
            {own.map((c, i) => {
              const name = fullName(c);
              return (
                <ListRow
                  key={c.id}
                  title={name}
                  leading={<Avatar name={name} size={40} />}
                  trailing={
                    <Text variant="callout" style={Tabular}>
                      {priceLabel(c.session_price_cents, savedCurrency)}
                    </Text>
                  }
                  onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id, sheet: 'price' } })}
                  accessibilityLabel={`${name}, ${priceLabel(c.session_price_cents, savedCurrency)} a session`}
                  last={i === own.length - 1}
                />
              );
            })}
          </Group>
        </Section>
      ) : (
        <Text variant="footnote" tone="secondary">
          Give a client their own price on their page, under More.
        </Text>
      )}

      <Sheet visible={picking === 'currency'} onClose={() => setPicking(null)} title="Currency">
        <Group style={{ backgroundColor: Colors.tint }}>
          {CURRENCIES.map((c, i) => (
            <ListRow
              key={c.code}
              title={c.name}
              subtitle={`${c.code} · ${formatMoney(40000, c.code)}`}
              trailing={c.code === currency ? <Ionicons name="checkmark" size={20} color={Colors.text} /> : null}
              chevron={false}
              accessibilityState={{ selected: c.code === currency }}
              onPress={() => chooseCurrency(c.code)}
              testID={`currency-${c.code}`}
              last={i === CURRENCIES.length - 1}
            />
          ))}
        </Group>
      </Sheet>
      <Sheet visible={picking === 'country'} onClose={() => setPicking(null)} title="Country">
        <View>
          <Group style={{ backgroundColor: Colors.tint }}>
            {CALLING_CODES.map((c, i) => (
              <ListRow
                key={c.country}
                title={c.name}
                subtitle={`+${c.code}`}
                trailing={c.country === country ? <Ionicons name="checkmark" size={20} color={Colors.text} /> : null}
                chevron={false}
                accessibilityState={{ selected: c.country === country }}
                onPress={() => chooseCountry(c.country)}
                testID={`country-${c.country}`}
                last={i === CALLING_CODES.length - 1}
              />
            ))}
          </Group>
        </View>
      </Sheet>
    </SettingsPage>
  );
}
