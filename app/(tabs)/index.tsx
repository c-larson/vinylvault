import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { RecordCard } from '@/components/RecordCard';
import type { Record } from '@/types/database';

export default function CollectionScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    value: number;
  } | null>(null);

  const fetchCollection = useCallback(async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      setLoading(false);
      return;
    }

    console.log('Fetching records for user:', user.id);

    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    console.log('Records result:', JSON.stringify({ count: data?.length, error }));

    if (error) {
      console.error('Records fetch error:', error);
    } else if (data) {
      setRecords(data);
      setStats({ total: data.length, value: 0 });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCollection();
    setRefreshing(false);
  }, [fetchCollection]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats banner */}
      {stats && (
        <View style={styles.statsBanner}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Records</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>
              ${stats.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.statLabel}>Est. Value</Text>
          </View>
        </View>
      )}

      {records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💿</Text>
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptySubtitle}>
            Tap Scan to add your first record
          </Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.push('/(tabs)/scan')}
          >
            <Text style={styles.scanButtonText}>Scan a Record</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RecordCard
              record={item}
              onPress={() => router.push(`/record/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#e94560"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e94560',
  },
  statLabel: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#0f3460',
    marginVertical: 4,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 32,
  },
  scanButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
