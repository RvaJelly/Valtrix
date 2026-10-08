import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { displayName, listTrainers, loadTrainers, type PublicTrainer } from '@/lib/trainers';

// A trainer's public profile.
export default function TrainerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [trainer, setTrainer] = useState<PublicTrainer | null | undefined>(undefined);
  // The chat with this trainer, when they are the signed-in client's trainer.
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listTrainers(), loadTrainers()])
      .then(([all, mine]) => {
        setTrainer(all.find((t) => t.id === id) ?? null);
        setChatId(mine.find((t) => t.trainer_id === id)?.client_id ?? null);
      })
      .catch(() => setTrainer(null));
  }, [id]);

  if (trainer === undefined) return <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.six }} />;
  if (trainer === null) {
    return (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>This trainer could not be found.</Body>
      </View>
    );
  }

  const isMe = trainer.id === session?.user.id;
  const isMine = !!chatId;
  const name = displayName(trainer);
  const firstName = trainer.full_name?.split(' ')[0] ?? name;
  const facts = [
    trainer.city,
    trainer.years_experience != null
      ? `${trainer.years_experience} ${trainer.years_experience === 1 ? 'year' : 'years'} experience`
      : null,
  ].filter(Boolean);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name }} />
      <View style={styles.hero}>
        <Avatar url={trainer.avatar_url} name={name} size={132} />
        <Text style={styles.name}>{name}</Text>
        {trainer.full_name && trainer.business_name ? (
          <Body secondary style={{ textAlign: 'center' }}>
            {trainer.business_name}
          </Body>
        ) : null}
        {facts.length ? (
          <Body secondary style={{ textAlign: 'center', fontSize: 14 }}>
            {facts.join(' · ')}
          </Body>
        ) : null}
        {isMine ? (
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.onAccent} />
            <Text style={styles.badgeText}>Your trainer</Text>
          </View>
        ) : null}
      </View>

      {chatId && !isMe ? (
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Message"
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: chatId, name, avatar: trainer.avatar_url ?? '' },
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Call"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/call',
                  params: { chat: chatId, video: '0', name, avatar: trainer.avatar_url ?? '' },
                })
              }
            />
          </View>
        </View>
      ) : null}

      {trainer.specialties.length ? (
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.section}>Specialises in</Text>
          <View style={styles.wrap}>
            {trainer.specialties.map((s) => (
              <View key={s} style={styles.chip}>
                <Text style={styles.chipText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {trainer.bio ? (
        <View style={{ gap: Spacing.two }}>
          <Text style={styles.section}>About {firstName}</Text>
          <Card>
            <Body>{trainer.bio}</Body>
          </Card>
        </View>
      ) : null}

      {isMe ? (
        <Card style={{ gap: Spacing.two }}>
          <Text style={styles.cardTitle}>This is your profile</Text>
          <Body secondary>
            This is how clients see you on Voltrix. Change it in Voltrix Coach under Settings, Profile.
          </Body>
        </Card>
      ) : null}

      {!isMine && !isMe ? (
        <Card style={{ gap: Spacing.two }}>
          <Text style={styles.cardTitle}>Want to train with {firstName}?</Text>
          <Body secondary>
            Ask {firstName} to add you as a client in Voltrix Coach with {session?.user.email}. You will see your
            sessions here straight away.
          </Body>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
    marginTop: Spacing.one,
  },
  badgeText: {
    color: Colors.onAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
}));
