import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { searchDiscogs, getRelease, getArtistName } from '@/lib/discogs';
import { supabase, saveTracks } from '@/lib/supabase';
import type { DiscogsSearchResult } from '@/lib/discogs';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscogsSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchDiscogs(query, { per_page: 20 });
      setResults(data);
    } catch (e: any) {
      Alert.alert('Search error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addToCollection(result: DiscogsSearchResult) {
    setSaving(result.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const release = await getRelease(result.id);
      const artistName = getArtistName(release);

      const { data, error } = await supabase.from('records').insert({
        user_id: user.id,
        title: release.title,
        artist: artistName,
        year: release.year ?? null,
        label: release.labels?.[0]?.name ?? null,
        catalog_number: release.labels?.[0]?.catno ?? null,
        format: (release.formats?.[0]?.name as any) ?? null,
        genre: release.genres?.[0] ?? null,
        styles: release.styles ?? null,
        country: release.country ?? null,
        cover_image_url: result.cover_image || null,
        discogs_id: String(release.id),
        discogs_lowest_price: release.lowest_price ?? null,
      }).select().single();

      if (error) throw error;

      // Save tracklist with BPM lookup in background
      await saveTracks(data.id, release.tracklist, artistName);

      Alert.alert('Added!', `"${release.title}" added to your vault.`, [
        { text: 'View Record', onPress: () => router.push(`/record/${data.id}`) },
        { text: 'OK' },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Artist, title, or label..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              {query ? 'No results found.' : 'Search Discogs to find records.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.resultItem}>
            {item.thumb ? (
              <Image source={{ uri: item.thumb }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbEmoji}>💿</Text>
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.meta}>
                {[item.year, item.country, item.format?.join(', ')].filter(Boolean).join(' · ')}
              </Text>
              {item.label?.[0] && <Text style={styles.label}>{item.label[0]}</Text>}
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => addToCollection(item)}
              disabled={saving === item.id}
            >
              {saving === item.id
                ? <ActivityIndicator color="#e94560" size="small" />
                : <Text style={styles.addBtnText}>+ Add</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  searchBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  input: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  searchBtn: {
    backgroundColor: '#e94560',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 48, fontSize: 15 },
  resultItem: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0f3460',
    alignItems: 'center',
  },
  thumb: { width: 70, height: 70 },
  thumbPlaceholder: { backgroundColor: '#0f3460', justifyContent: 'center', alignItems: 'center' },
  thumbEmoji: { fontSize: 24 },
  info: { flex: 1, padding: 12 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  meta: { color: '#aaa', fontSize: 12 },
  label: { color: '#e94560', fontSize: 11, marginTop: 2 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#e94560', fontWeight: '700', fontSize: 14 },
});
