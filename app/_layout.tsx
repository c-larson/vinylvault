import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Keep the splash screen visible while we check auth
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch((err) => {
        console.error('Supabase getSession error:', err);
      })
      .finally(() => {
        setInitialized(true);
        SplashScreen.hideAsync().catch(() => {});
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  // Show a simple loading screen until auth is checked
  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0D12', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#DFFF00" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="record/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Collection',
            headerStyle: { backgroundColor: '#0D0D12' },
            headerTintColor: '#DFFF00',
          }}
        />
      </Stack>
    </>
  );
}
