import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Colors, Spacing, themed } from '@/constants/theme';
import { authorName, type StoryGroup } from '@/lib/posts';

const SIZE = 64;

// The row of story circles at the top of Home, like Instagram. A coloured ring
// means there is a story this phone hasn't shown yet.
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <View style={styles.item}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine ? 'Your story' : 'Add to your story'}
          onPress={mine ? () => open(mine.author_id) : addStory}>
          <Ring active={!!mine}>
            <Avatar url={me.avatar} name={me.name} size={SIZE} />
          </Ring>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
          onPress={addStory}
          hitSlop={6}
          style={styles.plus}>
          <Ionicons name="add" size={16} color={Colors.onAccent} />
        </Pressable>
        <Text style={styles.name} numberOfLines={1}>
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
            <Ring active={unseen} seen={!unseen}>
              <Avatar url={g.author_avatar} name={name} size={SIZE} />
            </Ring>
            <Text style={styles.name} numberOfLines={1}>
              {name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Ring({ active, seen, children }: { active: boolean; seen?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.ring, { borderColor: active ? Colors.accent : seen ? Colors.border : 'transparent' }]}>
      {children}
    </View>
  );
}

const styles = themed(() => ({
  row: {
    gap: Spacing.three,
    paddingRight: Spacing.two,
  },
  item: {
    width: SIZE + 10,
    alignItems: 'center',
    gap: Spacing.one,
  },
  ring: {
    padding: 2,
    borderWidth: 3,
    borderRadius: (SIZE + 10) / 2,
  },
  plus: {
    position: 'absolute',
    right: 0,
    top: SIZE - 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  name: {
    maxWidth: SIZE + 10,
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
}));
