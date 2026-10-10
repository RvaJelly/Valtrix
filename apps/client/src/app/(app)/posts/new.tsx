import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityRules } from '@/components/community-rules';
import { Button, ErrorText, Text, TextField } from '@/components/ui';
import { BRAND, Colors, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { MediaError, pickMedia, REEL_LENGTH_HINT, type PickedMedia } from '@/lib/media';
import { useGoBack } from '@/lib/nav';
import { acceptRules, createPost, hasAcceptedRules } from '@/lib/posts';

const CAPTION_MAX = 2200;

// Share a story (a photo or video that lasts 24 hours) or a reel (a short video).
export default function NewPost() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === 'reel' ? 'reel' : 'story';
  const { session } = useAuth();
  const goBack = useGoBack();
  const [rules, setRules] = useState<'checking' | 'ask' | 'agreed'>('checking');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<'picking' | 'sharing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    hasAcceptedRules().then((ok) => setRules(ok ? 'agreed' : 'ask'));
  }, []);

  async function agree() {
    await acceptRules();
    setRules('agreed');
  }

  async function pick(from: 'camera' | 'library') {
    setError(null);
    setBusy('picking');
    try {
      const picked = await pickMedia(kind, from);
      if (picked) setMedia(picked);
    } catch (e) {
      setError(e instanceof MediaError ? e.message : 'Could not open that. Try another one.');
    }
    setBusy(null);
  }

  async function share() {
    if (!media || !session) return;
    setError(null);
    setBusy('sharing');
    try {
      await createPost(session.user.id, kind, media, kind === 'reel' ? caption : null);
      goBack(kind === 'reel' ? '/reels' : '/');
    } catch (e) {
      setError(plainError(e, 'Could not share it. Try again.'));
      setBusy(null);
    }
  }

  const title = kind === 'reel' ? 'New reel' : 'New story';

  // The one main button, held at the bottom of the screen.
  const footer =
    rules === 'ask' ? (
      <Button title="I agree" onPress={agree} />
    ) : rules === 'agreed' && media ? (
      <>
        <ErrorText>{error}</ErrorText>
        <Button
          title={kind === 'reel' ? 'Share reel' : 'Share to your story'}
          onPress={share}
          loading={busy === 'sharing'}
        />
        <Button title="Choose another" variant="ghost" onPress={() => setMedia(null)} disabled={!!busy} />
      </>
    ) : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {rules === 'ask' ? (
          <View style={{ gap: Spacing.tight }}>
            <Text variant="title" accessibilityRole="header">
              Community rules
            </Text>
            <Text variant="callout" tone="secondary">
              Everyone on Voltrix can see what you share. Before your first post, please agree to keep it:
            </Text>
            <View style={{ marginTop: Spacing.two }}>
              <CommunityRules />
            </View>
          </View>
        ) : null}

        {rules === 'agreed' && !media ? (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Ionicons
                  name={kind === 'reel' ? 'film-outline' : 'add-circle-outline'}
                  size={28}
                  color={Colors.text}
                />
              </View>
              <Text variant="callout" tone="secondary" style={{ textAlign: 'center', maxWidth: 320 }}>
                {kind === 'reel'
                  ? `${REEL_LENGTH_HINT} Everyone on Voltrix can watch them.`
                  : 'Your story shows on everyone’s Home for 24 hours, then disappears.'}
              </Text>
            </View>
            {Platform.OS !== 'web' ? (
              <Button
                title={kind === 'reel' ? 'Record a video' : 'Take a photo or video'}
                icon="camera-outline"
                onPress={() => pick('camera')}
                disabled={!!busy}
              />
            ) : null}
            <Button
              title={Platform.OS === 'web' ? 'Choose a file' : 'Choose from your phone'}
              icon="images-outline"
              variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
              onPress={() => pick('library')}
              loading={busy === 'picking'}
            />
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        {rules === 'agreed' && media ? (
          <View style={{ gap: Spacing.four }}>
            <View style={styles.preview}>
              {media.type === 'image' ? (
                <Image
                  source={{ uri: media.uri }}
                  style={styles.fill}
                  contentFit="cover"
                  accessibilityLabel="Your photo"
                />
              ) : (
                <PreviewVideo uri={media.uri} />
              )}
            </View>
            {kind === 'reel' ? (
              <TextField
                label="Caption"
                optional
                placeholder="Say something about your video"
                value={caption}
                onChangeText={setCaption}
                maxLength={CAPTION_MAX}
                multiline
                style={{ minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' }}
              />
            ) : null}
            {busy === 'sharing' && media.type === 'video' ? (
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Uploading your video. Keep Voltrix open until it&apos;s done.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
  },
  intro: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  preview: {
    alignSelf: 'center',
    width: '70%',
    maxWidth: 320,
    aspectRatio: 9 / 16,
    borderRadius: Radius.large,
    overflow: 'hidden',
    backgroundColor: BRAND.iron,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  footer: {
    paddingTop: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerInner: {
    width: '100%',
    maxWidth: Layout.maxClient - Spacing.gutter * 2,
    alignSelf: 'center',
    gap: Spacing.two,
  },
}));
