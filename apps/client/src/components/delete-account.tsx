import { useState } from 'react';
import { View } from 'react-native';

import { ErrorText, Group, IconTile, ListRow } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { removeMyChatPhotos } from '@/lib/chat';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { removeAllMyFiles } from '@/lib/posts';
import { removeProgressPhotoFiles } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

// Deletes the client's account once they confirm: their progress photos first, then the photos they sent in
// chats, their profile photo, stories and reels, then everything in the database, then signs out. Offered in
// Settings and on the Terms screen (the same file name as in Voltrix Coach, so the shared Terms screen finds it).
export function DeleteAccount() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const sure = await confirm(
      'Delete your account?',
      'This permanently deletes your account, your workouts, progress photos and other progress, habits, stories, reels, photos and the messages you sent. It cannot be undone.',
      'Delete account',
    );
    if (!sure) return;
    setError(null);
    setBusy(true);
    // Progress photos are private files that nothing could find once the account is gone, so
    // they must be removed first.
    try {
      if (userId) await removeProgressPhotoFiles(userId);
    } catch {
      setBusy(false);
      return setError('Your progress photos couldn’t be removed. Check your connection and try again.');
    }
    await removeMyChatPhotos().catch(() => {});
    if (userId) await removeAllMyFiles(userId).catch(() => {});
    const { error } = await supabase.rpc('delete_my_client_account');
    setBusy(false);
    if (error) return setError(plainError(error));
    await signOut();
  }

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
