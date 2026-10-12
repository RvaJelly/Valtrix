import { useState } from 'react';
import { View } from 'react-native';

import { ErrorText, Group, IconTile, ListRow, TextLink } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { removeMyChatPhotos } from '@/lib/chat';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { removeAllMyFiles } from '@/lib/files';
import { supabase } from '@/lib/supabase';

// Deletes the trainer's account once they confirm: their files first (chat photos, profile photo, stories
// and reels, workout videos, progress photos), then everything in the database, then signs out. Offered in
// Settings and, for trainers who can't reach Settings (the Terms screen, the set-up step, the paywall), under
// Sign out there.
function useDeleteAccount() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    const sure = await confirm(
      'Delete your account?',
      'This permanently deletes your account, your clients, calendar, workouts and exercises, your chats and the photos you sent, your stories and reels, and your profile and progress photos. It cannot be undone.',
      'Delete account',
    );
    if (!sure) return;
    setError(null);
    setBusy(true);
    await removeMyChatPhotos().catch(() => {});
    if (userId) await removeAllMyFiles(userId).catch(() => {});
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) return setError(plainError(error));
    await signOut();
  }

  return { remove, busy, error };
}

// The Settings row.
export function DeleteAccount() {
  const { remove, busy, error } = useDeleteAccount();
  return (
    <View style={{ gap: Spacing.two }}>
      <ErrorText>{error}</ErrorText>
      <Group>
        <ListRow
          title={busy ? 'Deleting…' : 'Delete account'}
          titleTone="danger"
          leading={<IconTile icon="trash-outline" color={Colors.danger} />}
          chevron={false}
          onPress={busy ? undefined : remove}
          last
        />
      </Group>
    </View>
  );
}

// The screens before the app (the Terms screen, the set-up step, the paywall): a quiet red link under Sign
// out, both under the page's own content and never in its footer. The same in Voltrix.
export function DeleteAccountLink() {
  const { remove, busy, error } = useDeleteAccount();
  return (
    <View style={{ gap: Spacing.two }}>
      <TextLink label={busy ? 'Deleting…' : 'Delete account'} tone="danger" onPress={remove} testID="delete-account" />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
