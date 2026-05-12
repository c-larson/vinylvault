import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Profile, CollectionStats } from '@/types/database';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<CollectionStats | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, statsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('collection_stats').select('*').eq('user_id', user.id).single(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (statsRes.data) setStats(statsRes.data);
    }
    load();
  }, []);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar placeholder */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.display_name?.[0]?.toUpperCase() ?? profile?.username?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name ?? profile?.username ?? '—'}</Text>
        <Text style={styles.username}>@{profile?.username ?? '—'}</Text>
      </View>

      {/* Collection stats */}
      {stats && (
        <View style={styles.statsCard}>
          <Text style={styles.cardTitle}>Collection Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.total_records}</Text>
              <Text style={styles.statLabel}>Records</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${Number(stats.total_value).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.statLabel}>Est. Value</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.top_genre ?? '—'}</Text>
              <Text style={styles.statLabel}>Top Genre</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.most_common_format ?? '—'}</Text>
              <Text style={styles.statLabel}>Top Format</Text>
            </View>
          </View>
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  content: { padding: 24, alignItems: 'center' },
  avatarWrap: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DFFF00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#0D0D12', fontSize: 36, fontWeight: '800' },
  displayName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  username: { color: '#aaa', fontSize: 14 },
  statsCard: {
    width: '100%',
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A3A',
    marginBottom: 24,
  },
  cardTitle: { color: '#aaa', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 16, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statItem: { width: '45%', alignItems: 'center' },
  statValue: { color: '#DFFF00', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: { color: '#aaa', fontSize: 12 },
  signOutBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFFF00',
    alignItems: 'center',
  },
  signOutText: { color: '#DFFF00', fontSize: 16, fontWeight: '600' },
});
