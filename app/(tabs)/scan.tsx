import { useState, useRef } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase, saveTracks } from '@/lib/supabase';
import { searchDiscogs, getRelease, getArtistName } from '@/lib/discogs';
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

  // ─── Vision API: extract text from image ────────────────────────────────────
  async function extractTextFromImage(base64: string): Promise<string> {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );
    const data = await res.json();
    return data.responses?.[0]?.fullTextAnnotation?.text ?? '';
  }

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

  // ─── Process: OCR → Discogs search ──────────────────────────────────────────
  async function processImage(base64: string) {
    try {
      const text = await extractTextFromImage(base64);
      if (!text.trim()) {
        Alert.alert('No text found', 'Try a clearer photo of the record label or sleeve.');
        setAnalyzing(false);
        return;
      }
      // Use first 2 lines of OCR text as search query
      const query = text.split('\n').slice(0, 2).join(' ').trim();
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
        { text: 'View Record', onPress: () => router.push(`/record/${data.id}`) },
        { text: 'Scan Another', onPress: () => { setStep('camera'); setResults([]); setCapturedUri(null); } },
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
        <ActivityIndicator size="large" color="#e94560" />
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
          <Text style={styles.libraryText}>📁 Library</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={takePhoto} disabled={analyzing}>
          {analyzing
            ? <ActivityIndicator color="#fff" />
            : <View style={styles.captureInner} />
          }
        </TouchableOpacity>

        <View style={{ width: 72 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e', padding: 32 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: '#e94560',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: { color: '#fff', marginTop: 16, fontSize: 14, opacity: 0.8 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    backgroundColor: '#1a1a2e',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e94560',
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
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  libraryText: { color: '#aaa', fontSize: 13 },
  permText: { color: '#aaa', textAlign: 'center', marginBottom: 24, fontSize: 15 },
  button: { backgroundColor: '#e94560', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  resultsTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backLink: { color: '#e94560', fontSize: 15 },
  resultsList: { padding: 16, gap: 12 },
  resultItem: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { backgroundColor: '#0f3460' },
  resultInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  resultMeta: { color: '#aaa', fontSize: 12 },
  resultLabel: { color: '#e94560', fontSize: 11, marginTop: 2 },
  noResults: { color: '#aaa', textAlign: 'center', marginTop: 48, fontSize: 15 },
  savingText: { color: '#aaa', marginTop: 16, fontSize: 15 },
});
