import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { authorName, type Reel } from '@/lib/posts';

// A reel sent in a chat, shown in the message bubble. Tapping the bubble opens it.
// `reel` is undefined while it loads and null when it was deleted or can't be seen.
export function ReelCard({ reel, mine }: { reel: Reel | null | undefined; mine: boolean }) {
  if (reel === null) {
    return (
      <View style={styles.gone}>
        <Ionicons name="film-outline" size={22} color={mine ? Colors.onBubble : Colors.textSecondary} />
        <Text style={[styles.goneText, mine && { color: Colors.onBubble }]}>This reel is no longer available</Text>
      </View>
    );
  }
  const name = reel ? authorName(reel) : '';
  return (
    <View style={{ gap: Spacing.one }}>
      <View style={styles.tile}>
        {reel ? (
          <>
            <View style={styles.play}>
              <Ionicons name="play" size={30} color="#FFFFFF" style={{ marginLeft: 3 }} />
            </View>
            <View style={styles.badge}>
              <Ionicons name="film" size={14} color="#FFFFFF" />
              <Text style={styles.badgeText}>Reel</Text>
            </View>
            <View style={styles.author}>
              <Avatar url={reel.author_avatar} name={name} size={26} />
              <Text style={styles.authorName} numberOfLines={1}>
                {name}
              </Text>
            </View>
          </>
        ) : (
          <ActivityIndicator color="#FFFFFF" />
        )}
      </View>
      {reel?.caption ? (
        <Text style={[styles.caption, mine && { color: Colors.onBubble }]} numberOfLines={2}>
          {reel.caption}
        </Text>
      ) : null}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } };

const styles = themed(() => ({
  tile: {
    width: 200,
    height: 250,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14141A',
  },
  play: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  author: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  authorName: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    ...shadow,
  },
  caption: {
    maxWidth: 200,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: Spacing.one,
  },
  gone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  goneText: {
    flexShrink: 1,
    color: Colors.textSecondary,
    fontSize: 15,
    fontStyle: 'italic',
  },
}));
