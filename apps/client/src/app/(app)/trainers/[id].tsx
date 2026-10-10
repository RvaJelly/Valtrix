import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { InviteCard } from '@/components/invite-card';
import { useToast } from '@/components/toast';
import { Body, Button, EmptyState, Notice, Section, Skeleton, StatusPill, Text } from '@/components/ui';
import { BRAND, Colors, Fonts, Layout, Radius, Spacing, themed, withAlpha } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { haptic } from '@/lib/haptics';
import { loadReels, type Reel } from '@/lib/posts';
import { serial, type Current } from '@/lib/serial';
import {
  displayName,
  distanceLabel,
  listTrainers,
  loadInvites,
  loadTrainers,
  yearsLabel,
  type Invite,
  type PublicTrainer,
} from '@/lib/trainers';

// A trainer's public profile.
export default function TrainerProfile() {
  // km is how far away they are, when the client came from the list sorted by distance.
  const { id, km } = useLocalSearchParams<{ id: string; km?: string }>();
  const { session } = useAuth();
  const { chats } = useChat();
  const [trainer, setTrainer] = useState<PublicTrainer | null | undefined>(undefined);
  // The chat with this trainer, when they are the signed-in client's trainer.
  const [chatId, setChatId] = useState<string | null>(null);
  // This trainer's invite, while it waits for a yes or no.
  const [invite, setInvite] = useState<Invite | null>(null);
  // Their latest reels, from the feed. Left out when the feed can't be loaded.
  const [reels, setReels] = useState<Reel[]>([]);
  const toast = useToast();

  const loadOnce = useCallback(
    (current: Current) =>
      Promise.all([listTrainers(), loadTrainers(), loadInvites().catch(() => null)])
        .then(([all, mine, invites]) => {
          // A newer load has shown its answer already, so this one's is older.
          if (!current()) return;
          const link = mine.find((t) => t.trainer_id === id);
          const asked = invites?.find((t) => t.trainer_id === id) ?? null;
          // The list only has trainers on an active plan with a business name. The client's
          // own trainer, or one who invited them, always shows.
          const known = link ?? asked;
          const own: PublicTrainer | null = known
            ? {
                id: known.trainer_id,
                full_name: known.trainer_name,
                business_name: known.business_name,
                avatar_url: known.trainer_avatar,
                specialties: [],
                bio: null,
                city: null,
                years_experience: null,
              }
            : null;
          // A trainer known only from their invite stays while the invites can't be loaded.
          setTrainer((shown) => all.find((t) => t.id === id) ?? own ?? (invites ? null : (shown ?? null)));
          setChatId(link?.client_id ?? null);
          // When the invites couldn't be loaded, the invite on screen stays.
          setInvite((shown) => (invites ? asked : shown));
        })
        // Only the first load shows "not found"; a failed reload keeps what is on screen.
        .catch(() => {
          if (current(false)) setTrainer((shown) => (shown === undefined ? null : shown));
        }),
    [id],
  );
  // One load at a time, so a slow older answer can't bring back an answered invite.
  const load = useMemo(() => serial(loadOnce), [loadOnce]);
  // The invite was answered here: load now, without waiting for a stuck load.
  const answered = useCallback(() => load(true), [load]);

  useEffect(() => {
    load();
  }, [load]);

  // There is no "reels by trainer" list, so a few pages of the feed are looked through.
  useEffect(() => {
    let alive = true;
    (async () => {
      const found: Reel[] = [];
      let before: string | undefined;
      for (let page = 0; page < 3 && found.length < 9; page++) {
        const list = await loadReels(before).catch(() => null);
        if (!list?.length) break;
        found.push(...list.filter((r) => r.author_id === id));
        before = list.at(-1)!.created_at;
      }
      if (alive) setReels(found.slice(0, 9));
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Answered on another phone, or the trainer sent or withdrew the invite. News sent while
  // the connection was down is missed, so load again when it is back.
  useChatEvents((event) => {
    if (event.type === 'link' || event.type === 'reconnected') load();
  });

  if (trainer === undefined) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.cover} />
        <View style={styles.body} accessible accessibilityLabel="Loading">
          <View style={styles.avatarRing}>
            <Skeleton width={96} height={96} radius={48} />
          </View>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={14} radius={7} />
        </View>
      </ScrollView>
    );
  }
  if (trainer === null) {
    return (
      <ScrollView contentContainerStyle={[styles.page, { paddingHorizontal: Spacing.gutter }]}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState
          icon="person-outline"
          title="Trainer not found"
          message="This trainer could not be found. They may have left Voltrix."
          action={
            <Button
              title="See all trainers"
              variant="secondary"
              size="medium"
              onPress={() => router.replace('/trainers')}
            />
          }
        />
      </ScrollView>
    );
  }

  const isMe = trainer.id === session?.user.id;
  const isMine = !!chatId;
  const name = displayName(trainer);
  // The chat has the trainer's photo when the list doesn't.
  const avatar = trainer.avatar_url ?? chats.find((c) => c.chat_id === chatId)?.other_avatar ?? null;
  const firstName = trainer.full_name?.split(' ')[0] ?? name;
  const email = session?.user.email ?? '';
  const facts = [
    trainer.city,
    trainer.years_experience != null ? `${yearsLabel(trainer.years_experience)} experience` : null,
    km && Number.isFinite(Number(km)) ? distanceLabel(Number(km)) : null,
  ].filter(Boolean);

  // A trainer adds clients by email in Voltrix Coach: hand the client's email over to send them.
  async function ask() {
    const message = `Hi ${firstName}, I'd like to train with you. Please add me in Voltrix Coach with ${email}.`;
    if (Platform.OS !== 'web') {
      await Share.share({ message }).catch(() => {});
      return;
    }
    const copied = await Clipboard.setStringAsync(email).catch(() => false);
    if (copied) {
      haptic.success();
      toast(`Email copied. Send it to ${firstName}.`);
    } else toast(`Send ${firstName} your email: ${email}`);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* The name shows once, big, under the photo. */}
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.cover} />
      <View style={styles.body}>
        <View style={{ gap: Spacing.two }}>
          <View style={styles.avatarRing}>
            <Avatar url={avatar} name={name} size={96} />
          </View>
          <Text variant="largeTitle" accessibilityRole="header" style={{ marginTop: Spacing.two }}>
            {name}
          </Text>
          {trainer.full_name && trainer.business_name ? (
            <Text variant="callout" tone="secondary">
              {trainer.business_name}
            </Text>
          ) : null}
          {facts.length ? (
            <Text variant="footnote" tone="secondary">
              {facts.join(' · ')}
            </Text>
          ) : null}
          {isMine ? (
            <View style={{ alignSelf: 'flex-start', marginTop: Spacing.one }}>
              <StatusPill tone="success" label="Your trainer" />
            </View>
          ) : null}
        </View>

        {invite && !isMine ? <InviteCard invite={invite} onAnswered={answered} /> : null}

        {chatId && !isMe ? (
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Message"
                icon="chatbubble-outline"
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: chatId, name, avatar: avatar ?? '' },
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Call"
                icon="call-outline"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/call',
                    params: { chat: chatId, video: '0', name, avatar: avatar ?? '' },
                  })
                }
              />
            </View>
          </View>
        ) : null}

        {!isMine && !isMe && !invite ? (
          <View style={{ gap: Spacing.two }}>
            <Button
              title={`Ask to train with ${firstName}`}
              icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'}
              onPress={ask}
            />
            <Text variant="footnote" tone="secondary">
              {firstName} adds you in Voltrix Coach with your email{email ? `, ${email}` : ''}. Their invite then shows
              up here for you to accept.
            </Text>
          </View>
        ) : null}

        {isMe ? (
          <Notice>This is how clients see you. Change it in Voltrix Coach under Settings, Profile.</Notice>
        ) : null}

        {trainer.specialties.length ? (
          <Section title="Specialises in">
            <View style={styles.wrap}>
              {trainer.specialties.map((sp) => (
                <View key={sp} style={styles.chip}>
                  <Text variant="footnote" style={{ fontFamily: Fonts.textMedium }}>
                    {sp}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {trainer.bio ? (
          <Section title={`About ${firstName}`}>
            <Body>{trainer.bio}</Body>
          </Section>
        ) : null}

        {reels.length ? (
          <Section title="Reels">
            <View style={styles.reels}>
              {reels.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={r.caption ? `Reel: ${r.caption}` : 'Reel'}
                  onPress={() => router.push({ pathname: '/reel/[id]', params: { id: r.id } })}
                  style={({ pressed }) => [styles.reel, pressed && { opacity: 0.8 }]}>
                  <Ionicons name="play" size={22} color={BRAND.white} />
                  {r.caption ? (
                    <Text variant="footnote" numberOfLines={2} style={styles.reelCaption}>
                      {r.caption}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = themed(() => ({
  page: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingBottom: Spacing.hero,
  },
  cover: {
    height: 96,
    backgroundColor: Colors.surface,
  },
  body: {
    marginTop: -48,
    paddingHorizontal: Spacing.gutter,
    gap: Spacing.section,
  },
  // A ring in the page colour lifts the photo off the band.
  avatarRing: {
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 52,
    backgroundColor: Colors.background,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.tight,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  reels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  reel: {
    width: '32.4%',
    aspectRatio: 9 / 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
    borderRadius: Radius.small,
    overflow: 'hidden',
    // Iron Black on the light theme; on dark themes a raised surface, so the tiles still show.
    backgroundColor: Colors.scheme === 'dark' ? Colors.surfaceHigh : BRAND.iron,
  },
  reelCaption: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: Spacing.two,
    color: withAlpha(BRAND.white, 0.85),
  },
}));
