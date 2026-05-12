import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, saveTracks } from '@/lib/supabase';
import { searchDiscogs, getRelease, getArtistName } from '@/lib/discogs';
import { identifyRecordFromImage } from '@/lib/gemini';
import type { DiscogsSearchResult } from '@/lib/discogs';

type ScanStep = 'camera' | 'results' | 'saving';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('camera');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<DiscogsSearchResult[]>([]);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Reset to camera view every time the tab is focused
  const resetState = useCallback(() => {
    setStep('camera');
    setResults([]);
    setCapturedUri(null);
    setAnalyzing(false);
  }, []);

  useFocusEffect(resetState);

  // ─── Gemini Vision: identify artist + album from image ──────────────────────
  // (Replaces Google Cloud Vision TEXT_DETECTION — Gemini returns structured
  //  { artist, album } instead of raw OCR text, giving much better search results)

  // ─── Take photo ──────────────────────────────────────────────────────────────
  async function takePhoto() {
    if (!cameraRef.current) return;
    setAnalyzing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) throw new Error('No image data');
      setCapturedUri(photo.uri);
      await processImage(photo.base64);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setAnalyzing(false);
    }
  }

  // ─── Pick from library ───────────────────────────────────────────────────────
  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setCapturedUri(result.assets[0].uri);
    setAnalyzing(true);
    await processImage(result.assets[0].base64);
  }

  // ─── Process: Gemini Vision → Discogs search ────────────────────────────────
  async function processImage(base64: string) {
    try {
      const identification = await identifyRecordFromImage(base64);

      if (!identification || (!identification.artist && !identification.album)) {
        Alert.alert(
          'Could not identify record',
          'Try a clearer photo of the cover or label, or use Search to find it manually.'
        );
        setAnalyzing(false);
        return;
      }

      // Build the best possible query from what Gemini found
      const query = [identification.artist, identification.album]
        .filter(Boolean)
        .join(' ')
        .trim();

      const searchResults = await searchDiscogs(query, { per_page: 8 });
      setResults(searchResults);
      setStep('results');
    } catch (e: any) {
      Alert.alert('Search failed', e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  // ─── Save selected release to collection ────────────────────────────────────
  async function saveRecord(result: DiscogsSearchResult) {
    setStep('saving');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      // Fetch full release details
      const release = await getRelease(result.id);
      const artistName = getArtistName(release);

      // Upload cover image to Supabase Storage (if available)
      let coverUrl: string | null = result.cover_image || null;

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
        cover_image_url: coverUrl,
        discogs_id: String(release.id),
        discogs_lowest_price: release.lowest_price ?? null,
      }).select().single();

      if (error) throw error;

      // Save tracklist with BPM lookup in background
      await saveTracks(data.id, release.tracklist, artistName);

      Alert.alert('Added!', `"${release.title}" added to your vault.`, [
        { text: 'View Record', onPress: () => { resetState(); router.push(`/record/${data.id}`); } },
        { text: 'Scan Another', onPress: resetState },
      ]);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
      setStep('results');
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Camera access is needed to scan records.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'saving') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#DFFF00" />
        <Text style={styles.savingText}>Adding to your vault...</Text>
      </View>
    );
  }

  if (step === 'results') {
    return (
      <View style={styles.container}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Select the right release</Text>
          <TouchableOpacity onPress={() => { setStep('camera'); setResults([]); }}>
            <Text style={styles.backLink}>Back</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.resultsList}>
          {results.length === 0 ? (
            <Text style={styles.noResults}>No results found. Try again with a clearer photo.</Text>
          ) : (
            results.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.resultItem}
                onPress={() => saveRecord(r)}
              >
                {r.thumb ? (
                  <Image source={{ uri: r.thumb }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]} />
                )}
                <View style={styles.resultInfo}>
                  <Text style={styles.resultTitle} numberOfLines={2}>{r.title}</Text>
                  <Text style={styles.resultMeta}>
                    {[r.year, r.country, r.format?.join(', ')].filter(Boolean).join(' · ')}
                  </Text>
                  {r.label?.[0] && (
                    <Text style={styles.resultLabel}>{r.label[0]}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Overlay guide */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point at record label or sleeve</Text>
        </View>
      </CameraView>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.libraryButton} onPress={pickFromLibrary} disabled={analyzing}>
          <Ionicons name="folder-outline" size={24} color="#A0A0A0" />
          <Text style={styles.libraryText}>Upload</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={takePhoto} disabled={analyzing}>
          {analyzing
            ? <ActivityIndicator color="#0D0D12" />
            : <View style={styles.captureInner} />
          }
        </TouchableOpacity>

        <View style={{ width: 72 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D12', padding: 32 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: '#DFFF00',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: { color: '#fff', marginTop: 16, fontSize: 14, opacity: 0.8 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    backgroundColor: '#0D0D12',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DFFF00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  libraryButton: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  libraryText: { color: '#A0A0A0', fontSize: 11, fontWeight: '600' },
  permText: { color: '#aaa', textAlign: 'center', marginBottom: 24, fontSize: 15 },
  button: { backgroundColor: '#DFFF00', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  resultsTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backLink: { color: '#DFFF00', fontSize: 15 },
  resultsList: { padding: 16, gap: 12 },
  resultItem: {
    flexDirection: 'row',
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { backgroundColor: '#2A2A3A' },
  resultInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  resultMeta: { color: '#aaa', fontSize: 12 },
  resultLabel: { color: '#DFFF00', fontSize: 11, marginTop: 2 },
  noResults: { color: '#aaa', textAlign: 'center', marginTop: 48, fontSize: 15 },
  savingText: { color: '#aaa', marginTop: 16, fontSize: 15 },
});
