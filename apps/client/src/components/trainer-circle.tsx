import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Colors, Spacing, themed } from '@/constants/theme';
import { displayName, type PublicTrainer } from '@/lib/trainers';

// A trainer as a round photo with their name and main specialty. Opens their profile.
export function TrainerCircle({
  trainer,
  size = 76,
  width = 96,
}: {
  trainer: PublicTrainer;
  size?: number;
  width?: number;
}) {
  const name = displayName(trainer);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: trainer.id } })}
      style={({ pressed }) => [styles.item, { width }, pressed && { opacity: 0.7 }]}>
      <Avatar url={trainer.avatar_url} name={name} size={size} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.specialty} numberOfLines={2}>
        {trainer.specialties.slice(0, 2).join(' · ') || trainer.business_name || ' '}
      </Text>
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
}));
