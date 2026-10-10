import { useEffect, useEffectEvent, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Sheet } from '@/components/sheet';
import { Button, EmptyState, Group, ListRow, SkeletonRows, Text } from '@/components/ui';
import { timeAgo } from '@/lib/posts';
import { loadLikers, type Liker } from '@/lib/social';

type Loaded = { postId: string; likers: Liker[] | null };

// "Liked by": who liked one of your own posts, newest first.
export function LikersSheet({
  postId,
  onClose,
  onLoaded,
}: {
  // The post whose likes are shown, or null when the sheet is closed.
  postId: string | null;
  onClose: () => void;
  // How many people liked it, once the list arrives.
  onLoaded?: (postId: string, count: number) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const reportCount = useEffectEvent((id: string, count: number) => onLoaded?.(id, count));
  // Keeps the list on screen while the sheet slides away.
  const [lastId, setLastId] = useState(postId);
  if (postId && postId !== lastId) setLastId(postId);
  const id = postId ?? lastId;

  useEffect(() => {
    if (!postId) return;
    let stale = false;
    loadLikers(postId).then(
      (likers) => {
        if (stale) return;
        setLoaded({ postId, likers });
        reportCount(postId, likers.length);
      },
      () => {
        if (!stale) setLoaded({ postId, likers: null });
      },
    );
    return () => {
      stale = true;
    };
  }, [postId]);

  const shown = loaded?.postId === id ? loaded : null;

  return (
    <Sheet visible={!!postId} onClose={onClose} title="Liked by">
      {!shown ? (
        <SkeletonRows count={3} avatar />
      ) : !shown.likers ? (
        <EmptyState
          compact
          icon="cloud-offline-outline"
          title="Could not load"
          message="Check your internet and try again."
        />
      ) : !shown.likers.length ? (
        <EmptyState
          compact
          icon="heart-outline"
          title="No likes yet"
          message="When people like your story, you'll see them here."
        />
      ) : (
        <Group>
          {shown.likers.map((item, i, all) => (
            <ListRow
              key={item.user_id}
              title={item.name || 'Voltrix member'}
              leading={<Avatar url={item.avatar_url} name={item.name} size={40} />}
              trailing={
                <Text variant="footnote" tone="tertiary">
                  {timeAgo(item.created_at)}
                </Text>
              }
              compact
              last={i === all.length - 1}
            />
          ))}
        </Group>
      )}
      <Button title="Done" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}
