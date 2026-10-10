import { useRef, useState } from 'react';
import { Platform, Pressable, View, type TextInput } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SettingsPage } from '@/components/settings-parts';
import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, IconTile, ListRow, Section, Text, TextField, Toggle } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';
import type { Profile } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { findMe, townAt, type Coords } from '@/lib/location';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { MAX_SPECIALTIES, SPECIALTIES } from '@/lib/specialties';
import { supabase } from '@/lib/supabase';

type Props = { profile: Profile; onSaved: () => Promise<void> };

const LOCATION_DENIED =
  Platform.OS === 'web'
    ? "Your browser didn't share your location. Allow location for this site, then try again."
    : "Voltrix Coach can't see your location. Allow it in your phone's settings, then try again.";

// The trainer's profile, as clients see it in the Voltrix app: the photo and location save at once,
// the rest with the Save button that stays at the bottom.
export function ProfileEditor({ profile, onSaved }: Props) {
  const [name, setName] = useState(profile.full_name ?? '');
  const [business, setBusiness] = useState(profile.business_name ?? '');
  const [specialties, setSpecialties] = useState<string[]>(profile.specialties ?? []);
  const [city, setCity] = useState(profile.city ?? '');
  const [years, setYears] = useState(profile.years_experience == null ? '' : String(profile.years_experience));
  const [bio, setBio] = useState(profile.bio ?? '');
  const [accepting, setAccepting] = useState(profile.accepting_clients ?? true);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<'change' | 'remove' | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ business?: string; years?: string; specialties?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [location, setLocation] = useState<Coords | null>(
    profile.latitude != null && profile.longitude != null
      ? { latitude: Number(profile.latitude), longitude: Number(profile.longitude) }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const businessRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const yearsRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);

  async function changePhoto() {
    setPhotoError(null);
    setPhotoBusy('change');
    try {
      const url = await pickProfilePhoto(profile.id);
      if (url) {
        const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
        if (error) throw error;
        await removeProfilePhoto(profile.avatar_url);
        await onSaved();
        toast('Photo saved');
      }
    } catch (e) {
      setPhotoError(plainError(e, 'The photo could not be saved.'));
    }
    setPhotoBusy(null);
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoBusy('remove');
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
    if (error) {
      setPhotoBusy(null);
      return setPhotoError(plainError(error));
    }
    await removeProfilePhoto(profile.avatar_url);
    await onSaved();
    setPhotoBusy(null);
  }

  // Saves a rough location straight away, and fills in the town if it is empty.
  async function saveMyLocation() {
    setLocationError(null);
    setLocating(true);
    const found = await findMe();
    if ('problem' in found) {
      setLocating(false);
      return setLocationError(
        found.problem === 'denied' ? LOCATION_DENIED : "We couldn't find your location. Try again in a moment.",
      );
    }
    const town = city.trim() ? null : await townAt(found.coords);
    const { error } = await supabase
      .from('profiles')
      .update({ ...found.coords, ...(town ? { city: town } : {}) })
      .eq('id', profile.id);
    setLocating(false);
    if (error) return setLocationError(plainError(error));
    setLocation(found.coords);
    if (town) setCity(town);
    toast('Location saved');
    await onSaved();
  }

  async function removeLocation() {
    setLocationError(null);
    const { error } = await supabase.from('profiles').update({ latitude: null, longitude: null }).eq('id', profile.id);
    if (error) return setLocationError(plainError(error));
    setLocation(null);
    await onSaved();
  }

  function toggle(specialty: string) {
    if (specialties.includes(specialty)) {
      haptic.select();
      setSpecialties(specialties.filter((s) => s !== specialty));
      setErrors((e) => ({ ...e, specialties: undefined }));
    } else if (specialties.length < MAX_SPECIALTIES) {
      haptic.select();
      setSpecialties([...specialties, specialty]);
    } else {
      setErrors((e) => ({ ...e, specialties: `You can pick up to ${MAX_SPECIALTIES}. Tap one to remove it first.` }));
    }
  }

  async function save() {
    setError(null);
    const yearsNumber = years.trim() ? Number(years.trim()) : null;
    const found = {
      business: business.trim() ? undefined : 'Enter the name clients will know your business by.',
      years:
        yearsNumber !== null && (!Number.isInteger(yearsNumber) || yearsNumber < 0 || yearsNumber > 60)
          ? 'Enter a whole number of years, from 0 to 60.'
          : undefined,
    };
    setErrors(found);
    if (found.business || found.years) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name.trim() || null,
        business_name: business.trim(),
        specialties,
        city: city.trim() || null,
        years_experience: yearsNumber,
        bio: bio.trim() || null,
        accepting_clients: accepting,
      })
      .eq('id', profile.id);
    setBusy(false);
    if (error) return setError(plainError(error));
    toast('Profile saved');
    await onSaved();
  }

  return (
    <SettingsPage
      footer={
        <StickyFooter>
          <ErrorText>{error}</ErrorText>
          <Button title="Save profile" onPress={save} loading={busy} />
        </StickyFooter>
      }>
      <View style={styles.photo}>
        <Avatar url={profile.avatar_url} name={profile.full_name ?? profile.business_name} size={96} />
        <View style={styles.photoButtons}>
          <Button
            title={profile.avatar_url ? 'Change photo' : 'Add a photo'}
            variant="secondary"
            size="medium"
            onPress={changePhoto}
            loading={photoBusy === 'change'}
          />
          {profile.avatar_url ? (
            <Button
              title="Remove"
              variant="ghost"
              size="medium"
              accessibilityLabel="Remove photo"
              onPress={removePhoto}
              loading={photoBusy === 'remove'}
            />
          ) : null}
        </View>
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          Clients see your profile in the Voltrix app.
        </Text>
        <ErrorText>{photoError}</ErrorText>
      </View>

      <View style={styles.fields}>
        <TextField
          label="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => businessRef.current?.focus()}
        />
        <TextField
          ref={businessRef}
          label="Business name"
          value={business}
          onChangeText={(text) => {
            setBusiness(text);
            if (errors.business) setErrors((e) => ({ ...e, business: undefined }));
          }}
          autoCapitalize="words"
          autoComplete="organization"
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => cityRef.current?.focus()}
          error={errors.business}
        />
        {/* Locked while finding the location, which may fill it in, so nothing typed meanwhile is lost. */}
        <TextField
          ref={cityRef}
          label="City"
          optional
          value={city}
          onChangeText={setCity}
          editable={!locating}
          autoCapitalize="words"
          placeholder="For example: Cape Town"
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => yearsRef.current?.focus()}
          style={locating ? { opacity: 0.5 } : null}
        />
        <TextField
          ref={yearsRef}
          label="Years of experience"
          optional
          value={years}
          onChangeText={(text) => {
            setYears(text);
            if (errors.years) setErrors((e) => ({ ...e, years: undefined }));
          }}
          keyboardType="number-pad"
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => bioRef.current?.focus()}
          error={errors.years}
        />
        <TextField
          ref={bioRef}
          label="About you"
          optional
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={1000}
          placeholder="Your story, qualifications and how you train"
          style={styles.bio}
        />
      </View>

      <Section title={`Specialties · ${specialties.length} of ${MAX_SPECIALTIES}`}>
        <View style={styles.chips}>
          {SPECIALTIES.map((s) => {
            const selected = specialties.includes(s);
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggle(s)}
                style={styles.chipTarget}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.chip,
                      pressed && { backgroundColor: Colors.tintPressed },
                      selected && styles.chipOn,
                    ]}>
                    <Text variant="callout" style={[styles.chipText, selected && { color: Colors.background }]}>
                      {s}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <ErrorText>{errors.specialties ?? null}</ErrorText>
      </Section>

      <Section title="New clients">
        <Group>
          <ListRow
            title="Taking new clients"
            trailing={
              <Toggle
                accessibilityLabel="Taking new clients"
                value={accepting}
                onValueChange={setAccepting}
                testID="profile-accepting"
              />
            }
            last
          />
        </Group>
        <Text variant="footnote" tone="secondary">
          Off: you stay in the Trainers list, but people can’t ask to train with you.
        </Text>
      </Section>

      <Section title="Location">
        <Group>
          <ListRow
            title={location ? 'Location set' : 'Not set'}
            subtitle={location ? 'Clients only see how far away you are' : 'Let clients near you find you'}
            leading={<IconTile icon={location ? 'location' : 'location-outline'} />}
            last
          />
        </Group>
        <View style={styles.locationButtons}>
          <Button
            title={location ? 'Update my location' : 'Use my location'}
            variant="secondary"
            size="medium"
            onPress={saveMyLocation}
            loading={locating}
          />
          {location ? (
            // Waits for an update in progress, which would otherwise save the location again.
            <Button
              title="Remove location"
              variant="ghost"
              size="medium"
              onPress={removeLocation}
              disabled={locating}
            />
          ) : null}
        </View>
        <ErrorText>{locationError}</ErrorText>
      </Section>
    </SettingsPage>
  );
}

const styles = themed(() => ({
  photo: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  photoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  fields: {
    gap: Spacing.gutter,
  },
  bio: {
    minHeight: 110,
    paddingTop: Spacing.tight,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  // Each chip is drawn 36 high inside a 44 high touch target, like the shared chips.
  chipTarget: {
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  chipOn: {
    backgroundColor: Colors.text,
  },
  chipText: {
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  locationButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
}));
