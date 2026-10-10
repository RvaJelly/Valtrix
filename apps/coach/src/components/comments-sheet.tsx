import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Skeleton,
  Text,
  type IconName,
} from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { newId } from '@/lib/chat';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { authorName, blockPerson, REPORT_REASONS, timeAgo, type ReportReason } from '@/lib/posts';
import {
  addComment,
  COMMENT_MAX,
  COMMENTS_PER_PAGE,
  deleteComment,
  loadComments,
  reportComment,
  type PostComment,
} from '@/lib/social';

type Props = {
  // The reel whose comments are open, or null when the sheet is closed.
  reel: { id: string; author_id: string } | null;
  onClose: () => void;
  // The reel's comment count went up or down (a comment was added, deleted, reported or blocked).
  onCountChange: (postId: string, delta: number) => void;
  // Room to leave for the phone's own bar at the bottom (home indicator or Back/Home buttons).
  // 0 above a tab bar, which already keeps clear of it.
  bottomInset: number;
  // Someone was blocked from a comment: their reels should go too.
  onBlocked: (personId: string) => void;
  // In Voltrix, a trainer's name opens their profile.
  isTrainer?: (personId: string) => boolean;
  onOpenAuthor?: (personId: string) => void;
};

type Page = { postId: string; comments: PostComment[]; more: boolean };

// The comments on a reel, in a sheet that slides up over it like Instagram and TikTok.
// Newest first, with a box at the bottom to add one.
//
// Render it last inside a full-screen screen: it covers that screen instead of opening a
// Modal. On Android a Modal is a window of its own. The apps draw edge to edge, so the
// system doesn't make that window smaller for the keyboard, and the keyboard events the
// sheet needs come from the main window, so the comment box could end up behind the
// keyboard. Inside the screen the keyboard is reported like on any other screen, and the
// sheet moves up above it.
export function CommentsSheet({
  reel,
  onClose,
  onCountChange,
  bottomInset,
  onBlocked,
  isTrainer,
  onOpenAuthor,
}: Props) {
  const { session, profile } = useAuth();
  const me = session?.user.id ?? '';
  const { height, width } = useWindowDimensions();
  // On a wide window the sheet is a 560 wide panel in the middle, like every other sheet.
  const wide = width > 600;
  const postId = reel?.id ?? null;
  const [slide] = useState(() => new Animated.Value(0));

  const [page, setPage] = useState<Page | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  // On the web the box is one row that grows with what is typed (up to 110).
  const [webHeight, setWebHeight] = useState(44);
  const [chosen, setChosen] = useState<PostComment | null>(null);
  const [step, setStep] = useState<'menu' | 'report' | 'thanks'>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // While the keyboard is up it covers the phone's bottom bar, so the box needs no room for it.
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Slide up from the bottom each time it opens.
  useEffect(() => {
    if (!postId) return;
    slide.setValue(0);
    const animation = Animated.timing(slide, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [postId, slide]);

  // Android's Back button closes the comment's options first, then the sheet.
  const goBack = useEffectEvent(() => {
    if (chosen) setChosen(null);
    else onClose();
  });
  useEffect(() => {
    if (!postId || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [postId]);

  // Start fresh each time the sheet opens for a reel.
  if (postId !== shownFor) {
    setShownFor(postId);
    setText('');
    setChosen(null);
    setError(null);
  }

  useEffect(() => {
    if (!postId) return;
    let stale = false;
    loadComments(postId).then(
      (list) => {
        if (stale) return;
        setFailedFor(null);
        setPage((current) => {
          // Keep comments still being posted from this phone.
          const unsent = current?.postId === postId ? current.comments.filter((c) => c.pending) : [];
          return {
            postId,
            comments: [...unsent, ...list.filter((c) => !unsent.some((u) => u.id === c.id))],
            more: list.length === COMMENTS_PER_PAGE,
          };
        });
      },
      () => {
        if (!stale) setFailedFor(postId);
      },
    );
    return () => {
      stale = true;
    };
  }, [postId, attempt]);

  const shown = page && page.postId === postId ? page : null;
  const comments = shown?.comments ?? [];

  function edit(change: (list: PostComment[]) => PostComment[]) {
    setPage((current) =>
      current && current.postId === postId ? { ...current, comments: change(current.comments) } : current,
    );
  }

  function retryLoad() {
    setFailedFor(null);
    setAttempt((a) => a + 1);
  }

  async function loadOlder() {
    const oldest = comments.filter((c) => !c.pending).at(-1);
    if (!postId || !shown?.more || loadingMore || !oldest) return;
    setLoadingMore(true);
    try {
      const older = await loadComments(postId, oldest.created_at);
      setPage((current) =>
        current && current.postId === postId
          ? {
              postId,
              comments: [...current.comments, ...older.filter((o) => !current.comments.some((c) => c.id === o.id))],
              more: older.length === COMMENTS_PER_PAGE,
            }
          : current,
      );
    } catch {
      // Scrolling to the end again tries again.
    }
    setLoadingMore(false);
  }

  async function deliver(comment: PostComment) {
    try {
      await addComment(comment.id, comment.post_id, comment.body);
      edit((list) => list.map((c) => (c.id === comment.id ? { ...c, pending: undefined } : c)));
      onCountChange(comment.post_id, 1);
    } catch {
      edit((list) => list.map((c) => (c.id === comment.id ? { ...c, pending: 'failed' } : c)));
    }
  }

  function send() {
    const body = text.trim();
    if (!body || !postId || !me) return;
    const comment: PostComment = {
      id: newId(),
      post_id: postId,
      author_id: me,
      author_name: profile?.full_name ?? null,
      author_avatar: profile?.avatar_url ?? null,
      body,
      created_at: new Date().toISOString(),
      is_mine: true,
      can_delete: true,
      pending: 'sending',
    };
    setPage((current) =>
      current && current.postId === postId
        ? { ...current, comments: [comment, ...current.comments] }
        : { postId, comments: [comment], more: false },
    );
    setText('');
    deliver(comment);
  }

  function retry(comment: PostComment) {
    edit((list) => list.map((c) => (c.id === comment.id ? { ...c, pending: 'sending' } : c)));
    deliver(comment);
  }

  // On a computer, Enter posts and Shift+Enter starts a new line.
  function onKey(e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean }>) {
    const { key, shiftKey, isComposing } = e.nativeEvent;
    if (key !== 'Enter' || shiftKey || isComposing) return;
    e.preventDefault();
    send();
  }

  function choose(comment: PostComment) {
    if (comment.pending === 'sending') return;
    setChosen(comment);
    setStep('menu');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(plainError(e, 'Something went wrong. Try again.'));
    }
    setBusy(false);
  }

  async function remove(comment: PostComment) {
    if (comment.pending === 'failed') {
      edit((list) => list.filter((c) => c.id !== comment.id));
      setChosen(null);
      return;
    }
    if (!(await confirm('Delete comment?', 'It will be removed for everyone.', 'Delete'))) return;
    await run(async () => {
      await deleteComment(comment.id);
      edit((list) => list.filter((c) => c.id !== comment.id));
      onCountChange(comment.post_id, -1);
      setChosen(null);
    });
  }

  async function report(comment: PostComment, reason: ReportReason) {
    await run(async () => {
      await reportComment(comment.id, reason);
      edit((list) => list.filter((c) => c.id !== comment.id));
      onCountChange(comment.post_id, -1);
      setStep('thanks');
    });
  }

  async function block(comment: PostComment) {
    const name = authorName(comment);
    const sure = await confirm(
      `Block ${name}?`,
      `You won't see each other's stories, reels or comments. ${name} won't be told. You can unblock them in Settings.`,
      'Block',
    );
    if (!sure) return;
    await run(async () => {
      await blockPerson(comment.author_id);
      const gone = comments.filter((c) => c.author_id === comment.author_id && !c.pending).length;
      edit((list) => list.filter((c) => c.author_id !== comment.author_id));
      if (gone) onCountChange(comment.post_id, -gone);
      setChosen(null);
      onBlocked(comment.author_id);
    });
  }

  const remaining = COMMENT_MAX - text.length;
  const canSend = !!text.trim();
  const sheetHeight = Math.round(height * (wide ? 0.8 : 0.72));
  // Slides up by its own height on a phone; a short rise and a fade on a wide window.
  const travel = wide ? 24 : sheetHeight;
  const chosenName = chosen ? authorName(chosen) : '';

  if (!reel) return null;

  return (
    <View style={styles.cover} role="dialog" aria-modal accessibilityViewIsModal>
      <KeyboardAvoidingView
        style={[styles.wrap, wide && styles.wrapWide]}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close comments" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            wide && styles.sheetWide,
            {
              height: sheetHeight,
              transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }],
            },
            wide && { opacity: slide },
          ]}>
          <View style={styles.header}>
            {wide ? null : <View style={styles.grabber} />}
            {/* The title and the close button share one 44 pt row, so they line up on their centres. */}
            <View style={styles.titleRow}>
              <Text variant="title" accessibilityRole="header">
                Comments
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={6}
                style={({ pressed }) => [styles.close, pressed && { backgroundColor: Colors.tint }]}
                accessibilityRole="button"
                accessibilityLabel="Close comments">
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {!shown && failedFor !== postId ? (
            <View accessible accessibilityLabel="Loading comments" style={{ flex: 1, paddingVertical: Spacing.two }}>
              <CommentSkeleton />
              <CommentSkeleton short />
              <CommentSkeleton />
            </View>
          ) : !shown ? (
            <View style={styles.empty}>
              <Text variant="headline" style={{ textAlign: 'center' }}>
                Could not load the comments
              </Text>
              <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                Check your internet and try again.
              </Text>
              <Button title="Try again" variant="secondary" size="medium" onPress={retryLoad} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingVertical: Spacing.two }}
              keyboardShouldPersistTaps="handled"
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingMore ? <CommentSkeleton short /> : null}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <EmptyState
                    icon="chatbubbles-outline"
                    title="No comments yet"
                    message="Be the first to say something nice."
                  />
                </View>
              }
              renderItem={({ item }) => (
                <CommentRow
                  comment={item}
                  onOptions={() => choose(item)}
                  onRetry={() => retry(item)}
                  onAuthor={
                    onOpenAuthor && !item.is_mine && isTrainer?.(item.author_id)
                      ? () => onOpenAuthor(item.author_id)
                      : undefined
                  }
                />
              )}
            />
          )}

          <View
            style={[styles.composer, { paddingBottom: keyboardUp ? Spacing.two : Math.max(bottomInset, Spacing.two) }]}>
            {remaining <= 50 ? (
              <Text
                variant="footnote"
                tone={remaining <= 0 ? 'danger' : 'secondary'}
                style={[Tabular, { textAlign: 'right' }]}>
                {remaining} {remaining === 1 ? 'letter' : 'letters'} left
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Add a comment…"
                placeholderTextColor={Colors.textSecondary}
                selectionColor={Colors.accent}
                maxLength={COMMENT_MAX}
                multiline
                {...WEB_ONE_ROW}
                onContentSizeChange={
                  Platform.OS === 'web'
                    ? (e) => setWebHeight(Math.min(110, Math.max(44, e.nativeEvent.contentSize.height)))
                    : undefined
                }
                style={[styles.input, Platform.OS === 'web' && { height: text ? webHeight : 44 }]}
                accessibilityLabel="Add a comment"
                onKeyPress={Platform.OS === 'web' ? onKey : undefined}
              />
              {/* Orange only once there is something to post. */}
              <Pressable
                onPress={send}
                disabled={!canSend}
                style={styles.sendTarget}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                accessibilityState={{ disabled: !canSend }}>
                <View style={[styles.send, { backgroundColor: canSend ? Colors.accent : Colors.tint }]}>
                  <Ionicons name="arrow-up" size={20} color={canSend ? Colors.onAccent : Colors.textTertiary} />
                </View>
              </Pressable>
            </View>
          </View>

          {chosen ? (
            <View style={styles.overlay}>
              <Pressable style={{ flex: 1 }} onPress={() => setChosen(null)} accessibilityLabel="Close options" />
              <View style={[styles.panel, { paddingBottom: Math.max(bottomInset, Spacing.three) }]}>
                <View style={styles.grabber} />
                {step === 'menu' ? (
                  <Group>
                    {chosen.can_delete ? (
                      <Option
                        icon="trash-outline"
                        label="Delete comment"
                        danger
                        onPress={() => remove(chosen)}
                        disabled={busy}
                        last={chosen.is_mine}
                      />
                    ) : null}
                    {!chosen.is_mine ? (
                      <>
                        <Option
                          icon="flag-outline"
                          label="Report comment"
                          danger
                          onPress={() => setStep('report')}
                          disabled={busy}
                        />
                        <Option
                          icon="hand-left-outline"
                          label={`Block ${chosenName}`}
                          danger
                          onPress={() => block(chosen)}
                          disabled={busy}
                          last
                        />
                      </>
                    ) : null}
                  </Group>
                ) : null}
                {step === 'report' ? (
                  <>
                    <View style={{ gap: Spacing.one }}>
                      <Text variant="title" accessibilityRole="header">
                        Why are you reporting this comment?
                      </Text>
                      <Text variant="callout" tone="secondary">
                        Your report is private. {chosenName} won&apos;t know it was you.
                      </Text>
                    </View>
                    <Group>
                      {REASONS.map((reason, i) => (
                        <Option
                          key={reason}
                          label={REPORT_REASONS[reason]}
                          onPress={() => report(chosen, reason)}
                          disabled={busy}
                          last={i === REASONS.length - 1}
                        />
                      ))}
                    </Group>
                  </>
                ) : null}
                {step === 'thanks' ? (
                  <View style={{ gap: Spacing.tight, alignItems: 'center', paddingTop: Spacing.two }}>
                    <Ionicons name="checkmark-circle" size={44} color={Colors.success} />
                    <Text variant="headline" accessibilityRole="header" style={{ textAlign: 'center' }}>
                      Thanks for letting us know
                    </Text>
                    <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                      We won&apos;t show you this comment again. Comments that several people report are hidden.
                    </Text>
                  </View>
                ) : null}
                <ErrorText>{error}</ErrorText>
                {step === 'thanks' ? (
                  <Button title="Done" variant="secondary" onPress={() => setChosen(null)} />
                ) : (
                  <Button title="Cancel" variant="ghost" onPress={() => setChosen(null)} disabled={busy} />
                )}
              </View>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const REASONS = Object.keys(REPORT_REASONS) as ReportReason[];

// On the web a multiline box is a <textarea>, which the browser makes two rows high unless told.
const WEB_ONE_ROW = Platform.OS === 'web' ? { rows: 1 } : {};

// A comment's shape while the list loads.
function CommentSkeleton({ short }: { short?: boolean }) {
  return (
    <View style={styles.row}>
      <Skeleton width={36} height={36} radius={18} />
      <View style={{ flex: 1, gap: Spacing.two, paddingTop: 4 }}>
        <Skeleton width="30%" height={10} radius={5} />
        <Skeleton width={short ? '50%' : '85%'} height={12} radius={6} />
      </View>
    </View>
  );
}

function CommentRow({
  comment,
  onOptions,
  onRetry,
  onAuthor,
}: {
  comment: PostComment;
  onOptions: () => void;
  onRetry: () => void;
  // Set when the writer is a trainer: their name opens their profile.
  onAuthor?: () => void;
}) {
  const name = authorName(comment);
  const when =
    comment.pending === 'sending'
      ? 'Posting…'
      : comment.pending === 'failed'
        ? 'Not posted'
        : timeAgo(comment.created_at);
  return (
    <View style={[styles.row, comment.pending === 'sending' && { opacity: 0.6 }]}>
      <Pressable
        onPress={onAuthor}
        disabled={!onAuthor}
        accessibilityRole={onAuthor ? 'button' : undefined}
        accessibilityLabel={onAuthor ? `See ${name}'s profile` : undefined}
        style={styles.avatarTarget}>
        <View style={styles.avatarRing}>
          <Avatar url={comment.author_avatar} name={name} size={36} />
        </View>
      </Pressable>
      <Pressable
        style={{ flex: 1, gap: 2 }}
        onPress={comment.pending === 'failed' ? onRetry : undefined}
        onLongPress={onOptions}
        delayLongPress={350}>
        <View style={styles.line}>
          <Text
            variant="footnote"
            style={{ flexShrink: 1, fontFamily: Fonts.textSemi, color: Colors.text }}
            numberOfLines={1}
            onPress={onAuthor}
            suppressHighlighting>
            {name}
          </Text>
          {onAuthor ? <Ionicons name="chevron-forward" size={12} color={Colors.textTertiary} /> : null}
          <Text variant="footnote" tone={comment.pending === 'failed' ? 'danger' : 'tertiary'}>
            {when}
          </Text>
        </View>
        <Text variant="callout">{comment.body}</Text>
        {comment.pending === 'failed' ? (
          <Text variant="footnote" tone="danger">
            Tap to try again.
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onOptions}
        hitSlop={4}
        style={({ pressed }) => [styles.more, pressed && { backgroundColor: Colors.tint }]}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${name}'s comment`}>
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textTertiary} />
      </Pressable>
    </View>
  );
}

function Option({
  icon,
  label,
  danger,
  onPress,
  disabled,
  last,
}: {
  icon?: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <ListRow
      title={label}
      titleTone={danger ? 'danger' : undefined}
      leading={icon ? <IconTile icon={icon} color={danger ? Colors.danger : undefined} /> : undefined}
      chevron={false}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={() => {
        if (!disabled) onPress();
      }}
      compact
      last={last}
    />
  );
}

const styles = themed(() => ({
  cover: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wrapWide: {
    justifyContent: 'center',
    padding: Spacing.four,
  },
  backdrop: {
    backgroundColor: Colors.scrim,
  },
  sheet: {
    flexShrink: 1,
    // A strip of the reel stays above the sheet (and the keyboard) to tap and close it.
    marginTop: 40,
    overflow: 'hidden',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceHigh,
    boxShadow: Colors.shadowFloating,
    ...(Colors.scheme === 'dark'
      ? { borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: Colors.borderStrong }
      : null),
  },
  sheetWide: {
    width: 560,
    maxWidth: '100%',
    alignSelf: 'center',
    marginTop: 0,
    borderRadius: Radius.xl,
    borderBottomWidth: Colors.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
  },
  header: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  titleRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.tight,
    backgroundColor: Colors.borderStrong,
  },
  close: {
    position: 'absolute',
    right: Spacing.two,
    top: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.tight,
    paddingLeft: Spacing.gutter,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.tight,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // 44 square around the 36 photo without moving it.
  avatarTarget: {
    margin: -4,
    padding: 4,
  },
  // On dark sheets an initials circle is nearly the sheet's colour, so a hairline keeps its edge.
  avatarRing: {
    borderRadius: 19,
    borderWidth: Colors.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
    borderColor: Colors.borderStrong,
  },
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surfaceHigh,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    paddingHorizontal: Spacing.three,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: Colors.tint,
    color: Colors.text,
    ...Type.body,
    lineHeight: 22,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  sendTarget: {
    width: 44,
    height: 44,
    marginRight: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: Colors.scrim,
  },
  panel: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceHigh,
    boxShadow: Colors.shadowFloating,
  },
}));
