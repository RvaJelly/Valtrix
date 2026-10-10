import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, useWindowDimensions, View, type ColorValue, type ViewStyle } from 'react-native';

import { Logo } from '@/components/logo';
import { Colors, Fonts, Layout, themed, Type } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { useTabsShown } from '@/lib/nav';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Outline icons, filled for the open tab, with a short slanted orange bar (the angle of the V's
// rising stroke) above it, or beside it in the sidebar. The tab bar draws the open tab's icon
// on top of the other one and fades between them, so the bar only shows on the open tab.
function tabIcon(name: IconName, sidebar: boolean) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View style={styles.icon}>
        {focused ? <View style={[styles.indicator, sidebar ? styles.indicatorSide : styles.indicatorTop]} /> : null}
        <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={24} color={color} />
      </View>
    );
  };
}

export default function TabLayout() {
  const { unread } = useChat();
  useTabsShown();
  // On a wide window (a PC browser) the tabs move to a sidebar on the left.
  const sidebar = useWindowDimensions().width >= Layout.wide;
  const icon = (name: IconName) => tabIcon(name, sidebar);
  const bar: ViewStyle = sidebar
    ? {
        width: Layout.sidebar,
        minWidth: Layout.sidebar,
        paddingTop: 96,
        backgroundColor: Colors.background,
        borderRightColor: Colors.border,
      }
    : {
        backgroundColor: Colors.background,
        borderTopColor: Colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        elevation: 0,
        shadowOpacity: 0,
      };
  // The Reels tab shows full-screen video, so the bar goes dark there.
  const darkBar = {
    tabBarStyle: [bar, { backgroundColor: '#000000', borderColor: 'rgba(255,255,255,0.08)' }],
    tabBarActiveTintColor: '#FFFFFF',
    tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
    tabBarActiveBackgroundColor: 'rgba(255,255,255,0.08)',
  };
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: Fonts.textSemi, fontSize: 17 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: bar,
        tabBarBadgeStyle: {
          backgroundColor: Colors.text,
          color: Colors.background,
          fontFamily: Fonts.textSemi,
          fontSize: 11,
        },
        ...(sidebar
          ? {
              tabBarPosition: 'left',
              tabBarLabelPosition: 'beside-icon',
              tabBarBackground: () => (
                <View style={styles.sidebarBrand}>
                  <Logo style={{ width: 120 }} />
                </View>
              ),
              tabBarActiveBackgroundColor: Colors.tint,
              tabBarItemStyle: { marginVertical: 2 },
              tabBarLabelStyle: { fontFamily: Fonts.textMedium, fontSize: 15, lineHeight: 20, marginStart: 12 },
            }
          : { tabBarLabelStyle: Type.tab }),
      }}>
      {/* Home and Nutrition draw their own page headers. */}
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrition', headerShown: false, tabBarIcon: icon('restaurant') }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: icon('chatbubbles'),
          tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: icon('play-circle'),
          headerShown: false,
          sceneStyle: { backgroundColor: '#000000' },
          ...darkBar,
        }}
      />
    </Tabs>
  );
}

const styles = themed(() => ({
  icon: {
    width: 24,
    height: 24,
  },
  indicator: {
    position: 'absolute',
    borderRadius: 1,
    backgroundColor: Colors.accent,
  },
  indicatorTop: {
    width: 16,
    height: 3,
    top: -9,
    left: 4,
    transform: [{ skewX: '-16deg' }],
  },
  indicatorSide: {
    width: 3,
    height: 16,
    top: 4,
    left: -15,
    transform: [{ skewY: '-16deg' }],
  },
  sidebarBrand: {
    paddingTop: 32,
    paddingLeft: 20,
  },
}));
