import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarStyle: { backgroundColor: Colors.background, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.accentText,
        tabBarInactiveTintColor: Colors.textSecondary,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: tabIcon('people') }} />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: tabIcon('play-circle'),
          headerShown: false,
          sceneStyle: { backgroundColor: '#000000' },
        }}
      />
      <Tabs.Screen name="programs" options={{ title: 'Programs', tabBarIcon: tabIcon('barbell') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="messages" options={{ title: 'Chat', tabBarIcon: tabIcon('chatbubbles') }} />
    </Tabs>
  );
}
