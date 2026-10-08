import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Colors, Spacing, themed } from '@/constants/theme';
import { displayName, distanceLabel, type PublicTrainer } from '@/lib/trainers';

// A trainer as a round photo with their name and main specialty. Opens their profile.
export function TrainerCircle({
  trainer,
  size = 76,
  width = 96,
  distanceKm,
}: {
  trainer: PublicTrainer;
  size?: number;
  width?: number;
  // How far away they are, when the client sorted by distance.
  distanceKm?: number;
}) {
  const name = displayName(trainer);
  const hasDistance = distanceKm != null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasDistance ? `${name}, ${distanceLabel(distanceKm)}` : name}
      onPress={() =>
        router.push({
          pathname: '/trainers/[id]',
          params: hasDistance ? { id: trainer.id, km: String(distanceKm) } : { id: trainer.id },
        })
      }
      style={({ pressed }) => [styles.item, { width }, pressed && { opacity: 0.7 }]}>
      <Avatar url={trainer.avatar_url} name={name} size={size} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.specialty} numberOfLines={2}>
        {trainer.specialties.slice(0, 2).join(' · ') || trainer.business_name || ' '}
      </Text>
      {hasDistance ? (
        <View style={styles.distance}>
          <Ionicons name="location" size={12} color={Colors.accentText} />
          <Text style={styles.distanceText} numberOfLines={1}>
            {distanceLabel(distanceKm)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() => ({
  item: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  specialty: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  distance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  distanceText: {
    color: Colors.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
}));
