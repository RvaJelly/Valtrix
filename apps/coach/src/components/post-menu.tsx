import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { authorName, blockPerson, deletePost, REPORT_REASONS, reportPost, type ReportReason } from '@/lib/posts';

type Post = { id: string; author_id: string; author_name: string | null; is_mine: boolean; media_path: string };

type Props = {
  post: Post | null;
  kind: 'story' | 'reel';
  onClose: () => void;
  // The post should disappear from what the person sees: deleted, reported or its author blocked.
  onRemoved: (post: Post, why: 'deleted' | 'reported' | 'blocked') => void;
};

// The "..." menu on a story or reel: delete your own, or report or block someone else.
export function PostMenu({ post, kind, onClose, onRemoved }: Props) {
  const [step, setStep] = useState<'menu' | 'report' | 'thanks'>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const name = post ? authorName(post) : '';

  // Start at the top of the menu each time it opens for a post.
  if ((post?.id ?? null) !== shownFor) {
    setShownFor(post?.id ?? null);
    setStep('menu');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
    setBusy(false);
  }

  async function remove() {
    if (!post) return;
    const sure = await confirm(
      kind === 'story' ? 'Delete this story?' : 'Delete this reel?',
      'It will be removed for everyone.',
      'Delete',
    );
    if (!sure) return;
    await run(async () => {
      await deletePost(post);
      onRemoved(post, 'deleted');
    });
  }

  async function report(reason: ReportReason) {
    if (!post) return;
    await run(async () => {
      await reportPost(post.id, reason);
      setStep('thanks');
    });
  }

  async function block() {
    if (!post) return;
    const sure = await confirm(
      `Block ${name}?`,
      `You won't see each other's stories or reels. ${name} won't be told. You can unblock them in Settings.`,
      'Block',
    );
    if (!sure) return;
    await run(async () => {
      await blockPerson(post.author_id);
      onRemoved(post, 'blocked');
    });
  }

  function finishReport() {
    if (post) onRemoved(post, 'reported');
  }

  return (
    <Modal
      visible={!!post}
      transparent
      animationType="slide"
      onRequestClose={step === 'thanks' ? finishReport : onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={step === 'thanks' ? finishReport : onClose}
        accessibilityLabel="Close"
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {step === 'menu' && post?.is_mine ? (
          <Option icon="trash-outline" label="Delete" danger onPress={remove} disabled={busy} />
        ) : null}
        {step === 'menu' && post && !post.is_mine ? (
          <>
            <Option icon="flag-outline" label="Report" danger onPress={() => setStep('report')} disabled={busy} />
            <Option icon="hand-left-outline" label={`Block ${name}`} danger onPress={block} disabled={busy} />
          </>
        ) : null}
        {step === 'report' ? (
          <>
            <Text style={styles.title}>Why are you reporting this {kind}?</Text>
            <Text style={styles.note}>Your report is private. {name} won&apos;t know it was you.</Text>
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((reason) => (
              <Option key={reason} label={REPORT_REASONS[reason]} onPress={() => report(reason)} disabled={busy} />
            ))}
          </>
        ) : null}
        {step === 'thanks' ? (
          <View style={{ gap: Spacing.three, paddingVertical: Spacing.two }}>
            <Ionicons name="checkmark-circle" size={40} color={Colors.accentText} style={{ alignSelf: 'center' }} />
            <Text style={[styles.title, { textAlign: 'center' }]}>Thanks for letting us know</Text>
            <Text style={[styles.note, { textAlign: 'center' }]}>
              We won&apos;t show you this {kind} again. Posts that several people report are hidden while we check them.
            </Text>
            <Option label="Done" onPress={finishReport} />
          </View>
        ) : null}
        {busy ? <ActivityIndicator color={Colors.textSecondary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {step !== 'thanks' ? <Option label="Cancel" onPress={onClose} /> : null}
      </View>
    </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    gap: Spacing.one,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: Spacing.two,
    backgroundColor: Colors.border,
  },
  title: {
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
