import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { Colors, Fonts, Spacing, themed } from '@/constants/theme';
import { displayName, distanceLabel, yearsLabel, type PublicTrainer } from '@/lib/trainers';

// A trainer as a round photo with their name and main specialty. Opens their profile.
export function TrainerCircle({
  trainer,
  size = 72,
  width = 96,
  distanceKm,
  years,
}: {
  trainer: PublicTrainer;
  size?: number;
  width?: number;
  // How far away they are, when the client sorted by distance.
  distanceKm?: number;
  // Years as a trainer, when the client sorted by experience.
  years?: number;
}) {
  const name = displayName(trainer);
  const hasDistance = distanceKm != null;
  const extra = hasDistance
    ? { icon: 'location' as const, text: distanceLabel(distanceKm) }
    : years != null
      ? { icon: 'ribbon' as const, text: yearsLabel(years) }
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={extra ? `${name}, ${extra.text}` : name}
      onPress={() =>
        router.push({
          pathname: '/trainers/[id]',
          params: hasDistance ? { id: trainer.id, km: String(distanceKm) } : { id: trainer.id },
        })
      }
      style={({ pressed }) => [styles.item, { width }, pressed && { opacity: 0.7 }]}>
      <Avatar url={trainer.avatar_url} name={name} size={size} />
      <Text variant="footnote" style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      <Text variant="footnote" tone="secondary" style={styles.specialty} numberOfLines={1}>
        {trainer.specialties[0] || trainer.business_name || ' '}
      </Text>
      {extra ? (
        <View style={styles.extra}>
          <Ionicons name={`${extra.icon}-outline`} size={12} color={Colors.textSecondary} />
          <Text variant="footnote" tone="secondary" style={styles.extraText} numberOfLines={1}>
            {extra.text}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() => ({
  item: {
    alignItems: 'center',
    gap: 2,
  },
  // Full names on up to two lines, never cut to "Ryan van A…".
  name: {
    fontFamily: Fonts.textMedium,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  specialty: {
    textAlign: 'center',
  },
  extra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  extraText: {
    fontFamily: Fonts.textMedium,
  },
}));
