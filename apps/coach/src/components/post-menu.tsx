import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, ErrorText, Group, IconTile, ListRow, Text, type IconName } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { authorName, blockPerson, deletePost, REPORT_REASONS, reportPost, type ReportReason } from '@/lib/posts';

type Post = { id: string; author_id: string; author_name: string | null; is_mine: boolean; media_path: string };

type Props = {
  post: Post | null;
  kind: 'story' | 'reel';
  onClose: () => void;
  // The post should disappear from what the person sees: deleted, reported or its author blocked.
  onRemoved: (post: Post, why: 'deleted' | 'reported' | 'blocked') => void;
};

// The "..." menu on a story or reel: delete your own, or report or block someone else. A sheet of
// grouped rows; the actions that remove something are red.
export function PostMenu({ post, kind, onClose, onRemoved }: Props) {
  const [step, setStep] = useState<'menu' | 'report' | 'thanks'>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Keeps the last post on screen while the sheet slides away.
  const [lastPost, setLastPost] = useState(post);
  if (post && post !== lastPost) setLastPost(post);
  const current = post ?? lastPost;
  const name = current ? authorName(current) : '';

  // Start at the top of the menu each time it opens for a post.
  if (post && post.id !== shownFor) {
    setShownFor(post.id);
    setStep('menu');
    setError(null);
  }
  if (!post && shownFor !== null) setShownFor(null);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(plainError(e, 'Something went wrong. Try again.'));
    }
    setBusy(false);
  }

  async function remove() {
    if (!post || busy) return;
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
    if (!post || busy) return;
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

  const reasons = Object.keys(REPORT_REASONS) as ReportReason[];
  return (
    <Sheet
      visible={!!post}
      onClose={step === 'thanks' ? finishReport : onClose}
      title={step === 'report' ? `Why are you reporting this ${kind}?` : undefined}>
      {step === 'menu' && current ? (
        <Group>
          {current.is_mine ? (
            <Option icon="trash-outline" label={busy ? 'Deleting…' : 'Delete'} danger onPress={remove} last />
          ) : (
            <>
              <Option icon="flag-outline" label="Report" danger onPress={() => setStep('report')} />
              <Option icon="hand-left-outline" label={`Block ${name}`} danger onPress={block} last />
            </>
          )}
        </Group>
      ) : null}
      {step === 'report' ? (
        <>
          <Text variant="callout" tone="secondary">
            Your report is private. {name} won&apos;t know it was you.
          </Text>
          <Group>
            {reasons.map((reason, i) => (
              <Option
                key={reason}
                label={REPORT_REASONS[reason]}
                onPress={() => report(reason)}
                last={i === reasons.length - 1}
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
            We won&apos;t show you this {kind} again. Posts that several people report are hidden while we check them.
          </Text>
        </View>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {step === 'thanks' ? (
        <Button title="Done" variant="secondary" onPress={finishReport} />
      ) : (
        <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
      )}
    </Sheet>
  );
}

function Option({
  icon,
  label,
  danger,
  onPress,
  last,
}: {
  icon?: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <ListRow
      title={label}
      titleTone={danger ? 'danger' : undefined}
      leading={icon ? <IconTile icon={icon} color={danger ? Colors.danger : undefined} /> : undefined}
      chevron={false}
      accessibilityLabel={label}
      onPress={onPress}
      compact
      last={last}
    />
  );
}
