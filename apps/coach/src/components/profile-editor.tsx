import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';
import type { Profile } from '@/lib/auth';
import { findMe, townAt, type Coords } from '@/lib/location';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { MAX_SPECIALTIES, SPECIALTIES } from '@/lib/specialties';
import { supabase } from '@/lib/supabase';

type Props = { profile: Profile; onSaved: () => Promise<void> };

const LOCATION_DENIED =
  Platform.OS === 'web'
    ? "Your browser didn't share your location. Allow location for this site, then try again."
    : "Voltrix Coach can't see your location. Allow it in your phone's settings, then try again.";

// The trainer's profile, as clients see it in the Voltrix app.
export function ProfileEditor({ profile, onSaved }: Props) {
  const [name, setName] = useState(profile.full_name ?? '');
  const [business, setBusiness] = useState(profile.business_name ?? '');
  const [specialties, setSpecialties] = useState<string[]>(profile.specialties ?? []);
  const [city, setCity] = useState(profile.city ?? '');
  const [years, setYears] = useState(profile.years_experience == null ? '' : String(profile.years_experience));
  const [bio, setBio] = useState(profile.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [location, setLocation] = useState<Coords | null>(
    profile.latitude != null && profile.longitude != null
      ? { latitude: Number(profile.latitude), longitude: Number(profile.longitude) }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function changePhoto() {
    setError(null);
    setPhotoBusy(true);
    try {
      const url = await pickProfilePhoto(profile.id);
      if (url) {
        const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
        if (error) throw error;
        await removeProfilePhoto(profile.avatar_url);
        await onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be saved.');
    }
    setPhotoBusy(false);
  }

  async function removePhoto() {
    setError(null);
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
    if (error) return setError(error.message);
    await removeProfilePhoto(profile.avatar_url);
    await onSaved();
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
    if (error) return setLocationError(error.message);
    setLocation(found.coords);
    if (town) setCity(town);
    await onSaved();
  }

  async function removeLocation() {
    setLocationError(null);
    const { error } = await supabase.from('profiles').update({ latitude: null, longitude: null }).eq('id', profile.id);
    if (error) return setLocationError(error.message);
    setLocation(null);
    await onSaved();
  }

  function toggle(specialty: string) {
    setSaved(false);
    if (specialties.includes(specialty)) setSpecialties(specialties.filter((s) => s !== specialty));
    else if (specialties.length < MAX_SPECIALTIES) setSpecialties([...specialties, specialty]);
    else setError(`Pick up to ${MAX_SPECIALTIES} specialties.`);
  }

  async function save() {
    setError(null);
    setSaved(false);
    if (!business.trim()) return setError('Enter a name for your business.');
    const yearsNumber = years.trim() ? Number(years.trim()) : null;
    if (yearsNumber !== null && (!Number.isInteger(yearsNumber) || yearsNumber < 0 || yearsNumber > 60)) {
      return setError('Years of experience should be a number from 0 to 60.');
    }
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
      })
      .eq('id', profile.id);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    await onSaved();
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.photoRow}>
        <Avatar url={profile.avatar_url} name={profile.full_name ?? profile.business_name} size={88} />
        <View style={{ flex: 1, gap: Spacing.two }}>
          <Button
            title={profile.avatar_url ? 'Change photo' : 'Add a photo'}
            variant="secondary"
            onPress={changePhoto}
            loading={photoBusy}
          />
          {profile.avatar_url ? (
            <Pressable accessibilityRole="button" onPress={removePhoto} hitSlop={8}>
              <Text style={styles.remove}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Body secondary style={styles.small}>
        Clients see your photo, specialties and info in the Voltrix app.
      </Body>
      <TextField label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField label="Business name" value={business} onChangeText={setBusiness} autoCapitalize="words" />

      <Text style={styles.label}>
        What you specialise in ({specialties.length}/{MAX_SPECIALTIES})
      </Text>
      <View style={styles.wrap}>
        {SPECIALTIES.map((s) => {
          const selected = specialties.includes(s);
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => toggle(s)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && { color: Colors.background }]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Locked while finding the location, which may fill it in, so nothing typed meanwhile is lost. */}
      <TextField
        label="City"
        value={city}
        onChangeText={setCity}
        editable={!locating}
        autoCapitalize="words"
        placeholder="For example: Cape Town"
        style={locating ? { opacity: 0.5 } : null}
      />

      <Text style={styles.label}>Location</Text>
      <View style={styles.locationRow}>
        <View style={styles.locationIcon}>
          <Ionicons name={location ? 'location' : 'location-outline'} size={20} color={Colors.textSecondary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.locationTitle}>{location ? 'Location set' : 'Not set'}</Text>
          <Body secondary style={styles.small}>
            {location
              ? 'Clients near you can find you. They only see how far away you are.'
              : 'Let clients near you find you. They only see how far away you are, never your address.'}
          </Body>
        </View>
      </View>
      <Button
        title={location ? 'Update my location' : 'Use my location'}
        variant="secondary"
        onPress={saveMyLocation}
        loading={locating}
      />
      {location ? (
        // Waits for an update in progress, which would otherwise save the location again.
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: locating }}
          disabled={locating}
          onPress={removeLocation}
          hitSlop={8}
          style={locating ? { opacity: 0.5 } : null}>
          <Text style={styles.remove}>Remove location</Text>
        </Pressable>
      ) : null}
      <ErrorText>{locationError}</ErrorText>

      <TextField
        label="Years of experience"
        value={years}
        onChangeText={setYears}
        keyboardType="number-pad"
        placeholder="Optional"
      />
      <TextField
        label="About you"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={1000}
        placeholder="Your story, qualifications and how you like to train clients"
        style={{ minHeight: 110, paddingTop: Spacing.three, textAlignVertical: 'top' }}
      />
      <ErrorText>{error}</ErrorText>
      {saved ? <Body style={{ color: Colors.success }}>Saved</Body> : null}
      <Button title="Save profile" onPress={save} loading={busy} />
    </Card>
  );
}

const styles = themed(() => ({
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  remove: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  small: {
    fontSize: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  locationTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  chipSelected: {
    backgroundColor: Colors.text,
  },
  chipText: {
    color: Colors.text,
    fontFamily: Fonts.textMedium,
    fontSize: 15,
    lineHeight: 21,
  },
}));
