import { Tabs } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#DFFF00',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTintColor: '#F8F8F8',
        headerTitleStyle: styles.headerTitle,
        // Prevent tab bar from hiding behind gesture nav bar on Android
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1C1C24',
    borderTopColor: '#2A2A3A',
    borderTopWidth: 1,
    // Extra height + bottom padding keeps the bar above the Pixel gesture nav area
    height: Platform.OS === 'android' ? 80 : 88,
    paddingBottom: Platform.OS === 'android' ? 16 : 28,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#0D0D12',
  },
  headerTitle: {
    color: '#F8F8F8',
    fontWeight: '700',
  },
});
