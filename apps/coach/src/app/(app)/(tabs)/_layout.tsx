import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  AppState,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type ColorValue,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Text } from '@/components/ui';
import { Colors, Fonts, Layout, themed } from '@/constants/theme';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { useTabsShown } from '@/lib/nav';
import { refreshWaitingCount, useWaitingCount } from '@/lib/requests';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Outline icons, filled for the open tab. In the bottom bar a short slanted orange bar (the angle
// of the V's rising stroke) sits inside the bar above the open tab's icon; in the sidebar the
// tinted pill marks the open tab. The tab bar draws the open tab's icon on top of the other one and
// fades between them, so the bar only shows on the open tab.
function tabIcon(name: IconName, sidebar: boolean) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View style={styles.icon}>
        {focused && !sidebar ? <View style={styles.indicator} /> : null}
        <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={24} color={color} />
      </View>
    );
  };
}

// Our own label, so it keeps the app's font, stops growing at 130 % text size (iPhone shows the
// large-content viewer instead, as its own tab bars do) and never loses its descenders.
function tabLabel(sidebar: boolean) {
  return function TabLabel({
    color,
    position,
    children,
  }: {
    focused: boolean;
    color: ColorValue;
    position: 'beside-icon' | 'below-icon';
    children: string;
  }) {
    const beside = position === 'beside-icon';
    return (
      <Text
        variant="tab"
        numberOfLines={1}
        allowFontScaling={Platform.OS !== 'ios'}
        style={[sidebar ? styles.labelSidebar : beside ? styles.labelBeside : null, { color }]}>
        {children}
      </Text>
    );
  };
}

// The bar's content: 4 above the item, then the item (5 + icon 28 + label 15 + 5).
const BAR_CONTENT = 57;

export default function TabLayout() {
  const { unread } = useChat();
  useTabsShown();
  // Requests waiting for an answer, on the Home tab: counted on start, on coming back to the app and
  // a second after news, so it's right while another tab is open.
  const waiting = useWaitingCount();
  const [news, setNews] = useState(0);
  useEffect(() => {
    refreshWaitingCount();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWaitingCount();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(refreshWaitingCount, 1000);
    return () => clearTimeout(timer);
  }, [news]);
  useChatEvents((event) => {
    if (event.type === 'news' || event.type === 'reconnected') setNews((n) => n + 1);
  });
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // On a wide window (a PC browser) the tabs move to a sidebar on the left.
  const sidebar = width >= Layout.wide;
  const icon = (name: IconName) => tabIcon(name, sidebar);
  // Labels grow up to 130 % with the phone's text size (not on iPhone), and the bar grows with them.
  const labelGrow = Platform.OS === 'ios' ? 0 : Math.ceil(15 * (Math.min(fontScale, 1.3) - 1));
  // The web and phones without a home indicator get a little room under the labels.
  const bottom = insets.bottom > 0 ? insets.bottom : 7;
  const bar: ViewStyle = sidebar
    ? {
        width: Layout.sidebar,
        minWidth: Layout.sidebar,
        paddingTop: 96,
        backgroundColor: Colors.background,
        borderRightColor: Colors.border,
      }
    : {
        height: BAR_CONTENT + labelGrow + bottom,
        paddingTop: 4,
        paddingBottom: bottom,
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
        // Every tab draws its own page header.
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: bar,
        tabBarLabel: tabLabel(sidebar),
        tabBarBadgeStyle: {
          backgroundColor: Colors.text,
          color: Colors.background,
          fontFamily: Fonts.textSemi,
          fontSize: 11,
          ...(sidebar ? { top: -4, end: -12 } : null),
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
            }
          : null),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: icon('home'),
          tabBarBadge: waiting ? (waiting > 99 ? '99+' : waiting) : undefined,
          tabBarAccessibilityLabel: waiting
            ? `Home, ${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting`
            : undefined,
        }}
      />
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="programs" options={{ title: 'Programs', tabBarIcon: icon('barbell') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar-clear') }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Chat',
          tabBarIcon: icon('chatbubbles'),
          tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      {/* On a phone Reels opens from the Home shortcuts, so the bar keeps five tabs; the sidebar
          has room for it. */}
      <Tabs.Screen
        name="reels"
        options={{
          href: sidebar ? undefined : null,
          title: 'Reels',
          tabBarIcon: icon('play-circle'),
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
  // 3 under the bar's top hairline and clear of the icon.
  indicator: {
    position: 'absolute',
    width: 16,
    height: 3,
    top: -8,
    left: 4,
    borderRadius: 1,
    // Light themes use the deeper ink, so yellow or teal still reads against white.
    backgroundColor: Colors.accentText,
    transform: [{ skewX: '-16deg' }],
  },
  labelBeside: {
    fontSize: 13,
    lineHeight: 18,
    marginStart: 8,
  },
  labelSidebar: {
    fontFamily: Fonts.textMedium,
    fontSize: 15,
    lineHeight: 20,
    marginStart: 12,
  },
  sidebarBrand: {
    paddingTop: 32,
    paddingLeft: 20,
  },
}));
