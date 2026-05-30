import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Keep the native splash up until our branded splash takes over
SplashScreen.preventAutoHideAsync();

// How long the logo stays front-and-center before we fade out
const SPLASH_MIN_MS = 2000;

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const wordmark = useRef(new Animated.Value(0)).current;

  // Check the auth session
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setSession(session))
      .catch((err) => console.error('Supabase getSession error:', err))
      .finally(() => setAuthReady(true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Minimum on-screen time so the logo is visible for ~2s on every launch
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // Hand off from the native splash to our branded splash + animate the logo in
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      // Wordmark reveals just after the logo for a staggered feel
      Animated.timing(wordmark, { toValue: 1, duration: 450, delay: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  // Once auth has resolved AND the minimum time has elapsed, fade the splash away
  useEffect(() => {
    if (authReady && minElapsed) {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setSplashVisible(false));
    }
  }, [authReady, minElapsed, overlayOpacity]);

  // Route based on auth state (runs behind the splash)
  useEffect(() => {
    if (!authReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, authReady, segments]);

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

      {splashVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity: overlayOpacity }]}>
          <Animated.Image
            source={require('../assets/images/splash-icon.png')}
            style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
            resizeMode="contain"
          />
          <Animated.Text
            style={[
              styles.wordmark,
              {
                opacity: wordmark,
                transform: [
                  { translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                ],
              },
            ]}
          >
            Decibel Archive
          </Animated.Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    backgroundColor: '#0D0D12',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  logo: {
    width: 220,
    height: 220,
  },
  wordmark: {
    marginTop: 18,
    color: '#DFFF00',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
