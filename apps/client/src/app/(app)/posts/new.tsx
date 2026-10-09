import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { CommunityRules } from '@/components/community-rules';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { MediaError, pickMedia, REEL_LENGTH_HINT, type PickedMedia } from '@/lib/media';
import { acceptRules, createPost, hasAcceptedRules } from '@/lib/posts';

const CAPTION_MAX = 2200;

// Share a story (a photo or video that lasts 24 hours) or a reel (a short video).
export default function NewPost() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === 'reel' ? 'reel' : 'story';
  const { session } = useAuth();
  const [rules, setRules] = useState<'checking' | 'ask' | 'agreed'>('checking');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<'picking' | 'sharing' | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (router.canGoBack()) router.back();
      else router.replace(kind === 'reel' ? '/reels' : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share it. Try again.');
      setBusy(null);
    }
  }

  const title = kind === 'reel' ? 'New reel' : 'New story';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {rules === 'checking' ? <ActivityIndicator color={Colors.accentText} /> : null}

        {rules === 'ask' ? (
          <Card style={{ gap: Spacing.four }}>
            <Text style={styles.heading}>Voltrix community rules</Text>
            <Body secondary>
              Everyone on Voltrix can see what you share. Before your first post, please agree to keep it:
            </Body>
            <CommunityRules />
            <Button title="I agree" onPress={agree} />
          </Card>
        ) : null}

        {rules === 'agreed' && !media ? (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Ionicons name={kind === 'reel' ? 'film' : 'add-circle'} size={30} color={Colors.accentText} />
              </View>
              <Body secondary style={{ textAlign: 'center' }}>
                {kind === 'reel'
                  ? `${REEL_LENGTH_HINT} Everyone on Voltrix can watch them.`
                  : 'Your story shows on everyone’s Home for 24 hours, then disappears.'}
              </Body>
            </View>
            {Platform.OS !== 'web' ? (
              <Button
                title={kind === 'reel' ? 'Record a video' : 'Take a photo or video'}
                onPress={() => pick('camera')}
                disabled={!!busy}
              />
            ) : null}
            <Button
              title={Platform.OS === 'web' ? 'Choose a file' : 'Choose from your phone'}
              variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
              onPress={() => pick('library')}
              loading={busy === 'picking'}
            />
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        {rules === 'agreed' && media ? (
          <View style={{ gap: Spacing.three }}>
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
                placeholder="Say something about your video"
                value={caption}
                onChangeText={setCaption}
                maxLength={CAPTION_MAX}
                multiline
                style={{ minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' }}
              />
            ) : null}
            <ErrorText>{error}</ErrorText>
            <Button
              title={kind === 'reel' ? 'Share reel' : 'Share to your story'}
              onPress={share}
              loading={busy === 'sharing'}
            />
            <Button title="Choose another" variant="ghost" onPress={() => setMedia(null)} disabled={!!busy} />
            {busy === 'sharing' && media.type === 'video' ? (
              <Body secondary style={{ textAlign: 'center', fontSize: 14 }}>
                Uploading your video. Keep Voltrix open until it&apos;s done.
              </Body>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
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
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  heading: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  intro: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  preview: {
    alignSelf: 'center',
    width: '70%',
    maxWidth: 320,
    aspectRatio: 9 / 16,
    borderRadius: Radius.large,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
}));
