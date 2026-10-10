import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
  const { height } = useWindowDimensions();
  const postId = reel?.id ?? null;
  const [slide] = useState(() => new Animated.Value(0));

  const [page, setPage] = useState<Page | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
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
  const sheetHeight = Math.round(height * 0.72);
  const chosenName = chosen ? authorName(chosen) : '';

  if (!reel) return null;

  return (
    <View style={styles.cover} role="dialog" aria-modal accessibilityViewIsModal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <Animated.View style={[styles.backdrop, { opacity: slide }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close comments" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }],
            },
          ]}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title} accessibilityRole="header">
              Comments
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close comments">
              <Ionicons name="close" size={26} color={Colors.text} />
            </Pressable>
          </View>

          {!shown && failedFor !== postId ? (
            <ActivityIndicator color={Colors.textSecondary} style={{ flex: 1 }} />
          ) : !shown ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Could not load the comments. Check your internet.</Text>
              <Pressable onPress={retryLoad} style={styles.retry} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
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
              ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.textSecondary} /> : null}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={40} color={Colors.textSecondary} />
                  <Text style={styles.emptyTitle}>No comments yet</Text>
                  <Text style={styles.emptyText}>Be the first to say something nice.</Text>
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
              <Text style={[styles.left, remaining <= 0 && { color: Colors.danger }]}>
                {remaining} {remaining === 1 ? 'letter' : 'letters'} left
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Add a comment…"
                placeholderTextColor={Colors.textSecondary}
                maxLength={COMMENT_MAX}
                multiline
                style={styles.input}
                accessibilityLabel="Add a comment"
                onKeyPress={Platform.OS === 'web' ? onKey : undefined}
              />
              <Pressable
                onPress={send}
                disabled={!canSend}
                style={[styles.send, !canSend && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="Post comment">
                <Ionicons name="arrow-up" size={22} color={Colors.onAccent} />
              </Pressable>
            </View>
          </View>

          {chosen ? (
            <View style={styles.overlay}>
              <Pressable style={{ flex: 1 }} onPress={() => setChosen(null)} accessibilityLabel="Close options" />
              <View style={[styles.panel, { paddingBottom: Math.max(bottomInset, Spacing.three) }]}>
                {step === 'menu' ? (
                  <>
                    {chosen.can_delete ? (
                      <Option
                        icon="trash-outline"
                        label="Delete comment"
                        danger
                        onPress={() => remove(chosen)}
                        disabled={busy}
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
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                {step === 'report' ? (
                  <>
                    <Text style={styles.panelTitle}>Why are you reporting this comment?</Text>
                    <Text style={styles.note}>Your report is private. {chosenName} won&apos;t know it was you.</Text>
                    {(Object.keys(REPORT_REASONS) as ReportReason[]).map((reason) => (
                      <Option
                        key={reason}
                        label={REPORT_REASONS[reason]}
                        onPress={() => report(chosen, reason)}
                        disabled={busy}
                      />
                    ))}
                  </>
                ) : null}
                {step === 'thanks' ? (
                  <View style={{ gap: Spacing.three, paddingVertical: Spacing.two }}>
                    <Ionicons
                      name="checkmark-circle"
                      size={40}
                      color={Colors.accentText}
                      style={{ alignSelf: 'center' }}
                    />
                    <Text style={[styles.panelTitle, { textAlign: 'center' }]}>Thanks for letting us know</Text>
                    <Text style={[styles.note, { textAlign: 'center' }]}>
                      We won&apos;t show you this comment again. Comments that several people report are hidden.
                    </Text>
                    <Option label="Done" onPress={() => setChosen(null)} />
                  </View>
                ) : null}
                {busy ? <ActivityIndicator color={Colors.textSecondary} /> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {step !== 'thanks' ? <Option label="Cancel" onPress={() => setChosen(null)} /> : null}
              </View>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
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
    <View style={styles.row}>
      <Pressable
        onPress={onAuthor}
        disabled={!onAuthor}
        accessibilityRole={onAuthor ? 'button' : undefined}
        accessibilityLabel={onAuthor ? `See ${name}'s profile` : undefined}
        hitSlop={4}>
        <Avatar url={comment.author_avatar} name={name} size={36} />
      </Pressable>
      <Pressable
        style={{ flex: 1 }}
        onPress={comment.pending === 'failed' ? onRetry : undefined}
        onLongPress={onOptions}
        delayLongPress={350}>
        <View style={styles.line}>
          <Text
            style={[styles.name, onAuthor && { color: Colors.accentText }]}
            numberOfLines={1}
            onPress={onAuthor}
            suppressHighlighting>
            {name}
          </Text>
          <Text style={[styles.when, comment.pending === 'failed' && { color: Colors.danger }]}>{when}</Text>
        </View>
        <Text style={styles.body}>{comment.body}</Text>
        {comment.pending === 'failed' ? <Text style={styles.failed}>Tap to try again.</Text> : null}
      </Pressable>
      <Pressable
        onPress={onOptions}
        hitSlop={6}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${name}'s comment`}>
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textSecondary} />
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
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const color = danger ? Colors.danger : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      {icon ? <Ionicons name={icon} size={22} color={color} /> : null}
      <Text style={[styles.optionText, { color }]}>{label}</Text>
    </Pressable>
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
  backdrop: {
    flex: 1,
    minHeight: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    flexShrink: 1,
    overflow: 'hidden',
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: Spacing.two,
    backgroundColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  close: {
    position: 'absolute',
    right: Spacing.two,
    top: Spacing.two,
    width: 44,
    height: 44,
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
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  retry: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.two,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  when: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  body: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 2,
  },
  failed: {
    color: Colors.danger,
    fontSize: 13,
    marginTop: 2,
  },
  more: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  left: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
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
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  panelTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: Spacing.two,
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 14,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
    paddingHorizontal: Spacing.two,
  },
}));
