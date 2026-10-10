import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { authorName, type StoryGroup } from '@/lib/posts';

const SIZE = 56;
// Ring and gap around the photo, so every circle takes the same room.
const OUTER = SIZE + 8;

// The row of story circles at the top of Home, like Instagram. A ring in the text colour means there
// is a story this phone hasn't shown yet; a thin grey one, a story already seen. Not orange: the
// screen's one orange mark belongs to its main action.
export function StoriesRow({
  groups,
  seen,
  me,
}: {
  groups: StoryGroup[];
  seen: Set<string>;
  me: { name: string | null; avatar: string | null };
}) {
  const mine = groups.find((g) => g.is_mine);
  const others = groups.filter((g) => !g.is_mine);
  const addStory = () => router.push({ pathname: '/posts/new', params: { kind: 'story' } });
  const open = (author: string) => router.push({ pathname: '/stories/[author]', params: { author } });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.row}>
      <View style={styles.item}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine ? 'Your story' : 'Add to your story'}
          onPress={mine ? () => open(mine.author_id) : addStory}>
          <Ring state={mine ? 'unseen' : 'none'}>
            <Avatar url={me.avatar} name={me.name} size={SIZE} />
          </Ring>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
          onPress={addStory}
          hitSlop={10}
          style={styles.plus}>
          <Ionicons name="add" size={14} color={Colors.background} />
        </Pressable>
        <Text variant="footnote" style={styles.name} numberOfLines={1}>
          Your story
        </Text>
      </View>
      {others.map((g) => {
        const unseen = g.stories.some((s) => !seen.has(s.id));
        const name = authorName(g);
        return (
          <Pressable
            key={g.author_id}
            accessibilityRole="button"
            accessibilityLabel={`${name}'s story${unseen ? ', new' : ''}`}
            onPress={() => open(g.author_id)}
            style={styles.item}>
            <Ring state={unseen ? 'unseen' : 'seen'}>
              <Avatar url={g.author_avatar} name={name} size={SIZE} />
            </Ring>
            <Text variant="footnote" tone={unseen ? 'primary' : 'secondary'} style={styles.name} numberOfLines={1}>
              {name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Ring({ state, children }: { state: 'unseen' | 'seen' | 'none'; children: ReactNode }) {
  return (
    <View
      style={[
        styles.ring,
        state === 'unseen'
          ? { borderWidth: 2, padding: 2, borderColor: Colors.text }
          : { borderWidth: 1, padding: 3, borderColor: state === 'seen' ? Colors.borderStrong : 'transparent' },
      ]}>
      {children}
    </View>
  );
}

const styles = themed(() => ({
  // The row runs to the screen's edges while its first circle lines up with the page.
  bleed: {
    marginHorizontal: -Spacing.gutter,
    flexGrow: 0,
  },
  row: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.gutter,
  },
  item: {
    width: OUTER + 4,
    alignItems: 'center',
    gap: 6,
  },
  ring: {
    width: OUTER,
    height: OUTER,
    borderRadius: OUTER / 2,
  },
  plus: {
    position: 'absolute',
    right: 0,
    top: OUTER - 22,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.text,
  },
  name: {
    maxWidth: OUTER + 8,
    textAlign: 'center',
  },
}));
