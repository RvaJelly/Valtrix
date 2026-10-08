import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { Profile } from '@/lib/auth';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { MAX_SPECIALTIES, SPECIALTIES } from '@/lib/specialties';
import { supabase } from '@/lib/supabase';

type Props = { profile: Profile; onSaved: () => Promise<void> };

// The trainer's profile, as clients see it in the Valtrix app.
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
        Clients see your photo, specialties and info in the Valtrix app.
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
              <Text style={[styles.chipText, selected && { color: Colors.onAccent }]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextField label="City" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="For example: Cape Town" />
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
      {saved ? <Body style={{ color: Colors.accent }}>Saved</Body> : null}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
}));
