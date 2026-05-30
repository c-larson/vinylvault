import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { getPriceSuggestions } from '@/lib/discogs';
import { Ionicons } from '@expo/vector-icons';
import { ConditionBadge } from '@/components/ConditionBadge';
import type { VinylRecord, RecordTrack, GoldmineCondition } from '@/types/database';

// Goldmine condition multipliers for condition-adjusted valuation
const CONDITION_MULTIPLIERS: Record<GoldmineCondition, number> = {
  'M':   1.5,
  'NM':  1.0,
  'VG+': 0.7,
  'VG':  0.4,
  'G+':  0.2,
  'G':   0.1,
  'F':   0.05,
  'P':   0.01,
};

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<VinylRecord | null>(null);
  const [tracks, setTracks] = useState<RecordTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [playlistCountMap, setPlaylistCountMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchRecord() {
      const [recordResult, tracksResult] = await Promise.all([
        supabase.from('records').select('*').eq('id', id).single(),
        supabase.from('record_tracks').select('*').eq('record_id', id).order('position'),
      ]);
      if (recordResult.data) setRecord(recordResult.data);
      if (recordResult.error) Alert.alert('Error', 'Could not load record.');
      if (tracksResult.data) {
        setTracks(tracksResult.data);
        // Fetch how many playlists each track belongs to
        const { data: ptData } = await supabase
          .from('playlist_tracks')
          .select('track_id')
          .in('track_id', tracksResult.data.map(t => t.id));
        const countMap: Record<string, number> = {};
        (ptData ?? []).forEach(pt => {
          countMap[pt.track_id] = (countMap[pt.track_id] ?? 0) + 1;
        });
        setPlaylistCountMap(countMap);
      }
      setLoading(false);
    }
    fetchRecord();
  }, [id]);

  function getConditionAdjustedValue(): string | null {
    if (!record?.discogs_median_price && !record?.discogs_lowest_price) return null;
    const basePrice = record.discogs_median_price ?? record.discogs_lowest_price!;
    const condition = record.media_condition ?? 'VG+';
    const multiplier = CONDITION_MULTIPLIERS[condition] ?? 0.7;
    return (basePrice * multiplier).toFixed(2);
  }

  async function handleDelete() {
    Alert.alert(
      'Remove record',
      `Remove "${record?.title}" from your vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.from('records').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', error.message);
              setDeleting(false);
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#DFFF00" />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Record not found.</Text>
      </View>
    );
  }

  const adjustedValue = getConditionAdjustedValue();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cover image */}
      {record.cover_image_url ? (
        <Image source={{ uri: record.cover_image_url }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverEmoji}>💿</Text>
        </View>
      )}

      {/* Title & artist */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{record.title}</Text>
        <Text style={styles.artist}>{record.artist}</Text>
      </View>

      {/* Quick metadata row */}
      <View style={styles.metaRow}>
        {record.year && <Text style={styles.metaChip}>{record.year}</Text>}
        {record.format && <Text style={styles.metaChip}>{record.format}</Text>}
        {record.country && <Text style={styles.metaChip}>{record.country}</Text>}
      </View>

      {/* Condition */}
      {(record.media_condition || record.sleeve_condition) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condition</Text>
          <View style={styles.conditionRow}>
            {record.media_condition && (
              <View style={styles.conditionItem}>
                <Text style={styles.conditionLabel}>Media</Text>
                <ConditionBadge condition={record.media_condition} />
              </View>
            )}
            {record.sleeve_condition && (
              <View style={styles.conditionItem}>
                <Text style={styles.conditionLabel}>Sleeve</Text>
                <ConditionBadge condition={record.sleeve_condition} />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Valuation */}
      {(record.discogs_lowest_price || record.purchase_price) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Valuation</Text>
          <View style={styles.valuationGrid}>
            {record.purchase_price != null && (
              <View style={styles.valuationItem}>
                <Text style={styles.valuationLabel}>Paid</Text>
                <Text style={styles.valuationAmount}>${record.purchase_price.toFixed(2)}</Text>
              </View>
            )}
            {record.discogs_lowest_price != null && (
              <View style={styles.valuationItem}>
                <Text style={styles.valuationLabel}>Discogs Low</Text>
                <Text style={styles.valuationAmount}>${record.discogs_lowest_price.toFixed(2)}</Text>
              </View>
            )}
            {adjustedValue && (
              <View style={styles.valuationItem}>
                <Text style={styles.valuationLabel}>Est. Value</Text>
                <Text style={[styles.valuationAmount, styles.highlight]}>${adjustedValue}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailsTable}>
          {record.label && <DetailRow label="Label" value={record.label} />}
          {record.catalog_number && <DetailRow label="Cat #" value={record.catalog_number} />}
          {record.genre && <DetailRow label="Genre" value={record.genre} />}
          {record.styles?.length && <DetailRow label="Style" value={record.styles.join(', ')} />}
          {record.discogs_id && <DetailRow label="Discogs ID" value={record.discogs_id} />}
        </View>
      </View>

      {/* Tracklist */}
      {tracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tracklist</Text>
          <View style={styles.tracklist}>
            {tracks.map((track, i) => (
              <TrackRow
                key={track.id ?? i}
                track={track}
                playlistCount={playlistCountMap[track.id] ?? 0}
                onPlaylistCountChange={(count) =>
                  setPlaylistCountMap(prev => ({ ...prev, [track.id]: count }))
                }
                onBpmSave={async (bpm) => {
                  const { error } = await supabase
                    .from('record_tracks')
                    .update({ bpm })
                    .eq('id', track.id);
                  if (!error) {
                    setTracks((prev) =>
                      prev.map((t) => (t.id === track.id ? { ...t, bpm } : t))
                    );
                  }
                }}
                onKeySave={async (key) => {
                  const { error } = await supabase
                    .from('record_tracks')
                    .update({ key })
                    .eq('id', track.id);
                  if (!error) {
                    setTracks((prev) =>
                      prev.map((t) => (t.id === track.id ? { ...t, key } : t))
                    );
                  }
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Notes */}
      {record.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notes}>{record.notes}</Text>
        </View>
      )}

      {/* Delete */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
        {deleting
          ? <ActivityIndicator color="#DFFF00" />
          : <Text style={styles.deleteBtnText}>Remove from Vault</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── BPM Modal ───────────────────────────────────────────────────────────────
function BpmModal({
  visible,
  currentBpm,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentBpm: number | null;
  onSave: (bpm: number) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'type' | 'tap'>('tap');
  const [bpmInput, setBpmInput] = useState(currentBpm ? String(currentBpm) : '');
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const tapsRef = useRef<number[]>([]);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset tap state whenever modal opens
  useEffect(() => {
    if (visible) {
      setMode('tap');
      setBpmInput(currentBpm ? String(currentBpm) : '');
      setTapBpm(null);
      tapsRef.current = [];
    }
  }, [visible]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current.push(now);

    // Keep only taps within last 3 seconds
    const cutoff = now - 3000;
    tapsRef.current = tapsRef.current.filter((t) => t >= cutoff);

    if (tapsRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapsRef.current.length; i++) {
        intervals.push(tapsRef.current[i] - tapsRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setTapBpm(Math.round(60000 / avg));
    }

    // Auto-reset after 3s of inactivity
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      tapsRef.current = [];
      setTapBpm(null);
    }, 3000);
  }, []);

  async function handleSave() {
    const val = mode === 'tap' ? tapBpm : parseInt(bpmInput, 10);
    if (!val || isNaN(val) || val < 1 || val > 300) {
      Alert.alert('Invalid BPM', 'Enter or tap a BPM between 1 and 300.');
      return;
    }
    setSaving(true);
    await onSave(val);
    setSaving(false);
    onClose();
  }

  const displayBpm = mode === 'tap' ? tapBpm : (parseInt(bpmInput) || null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={bpmStyles.backdrop}>
        <View style={bpmStyles.sheet}>
          {/* Header */}
          <View style={bpmStyles.header}>
            <Text style={bpmStyles.headerTitle}>Set BPM</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={bpmStyles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mode toggle */}
          <View style={bpmStyles.modeRow}>
            <TouchableOpacity
              style={[bpmStyles.modeTab, mode === 'tap' && bpmStyles.modeTabActive]}
              onPress={() => setMode('tap')}
            >
              <Text style={[bpmStyles.modeTabText, mode === 'tap' && bpmStyles.modeTabTextActive]}>
                Tap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bpmStyles.modeTab, mode === 'type' && bpmStyles.modeTabActive]}
              onPress={() => setMode('type')}
            >
              <Text style={[bpmStyles.modeTabText, mode === 'type' && bpmStyles.modeTabTextActive]}>
                Type
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'tap' ? (
            <View style={bpmStyles.tapContent}>
              {/* BPM readout */}
              <Text style={bpmStyles.bpmReadout}>
                {tapBpm ?? '--'}
              </Text>
              <Text style={bpmStyles.bpmUnit}>BPM</Text>
              <Text style={bpmStyles.tapHint}>
                {tapsRef.current.length === 0
                  ? 'Tap the button to the beat'
                  : tapsRef.current.length === 1
                  ? 'Keep tapping...'
                  : `${tapsRef.current.length} taps · resets after 3s pause`}
              </Text>

              {/* Big tap button */}
              <TouchableOpacity style={bpmStyles.tapButton} onPress={handleTap} activeOpacity={0.7}>
                <Text style={bpmStyles.tapButtonText}>TAP</Text>
              </TouchableOpacity>

              {/* Add to Track */}
              <TouchableOpacity
                style={[bpmStyles.saveButton, !tapBpm && bpmStyles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!tapBpm || saving}
              >
                {saving
                  ? <ActivityIndicator color="#0D0D12" />
                  : <Text style={bpmStyles.saveButtonText}>Add to Track</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={bpmStyles.typeContent}>
              <TextInput
                style={bpmStyles.typeInput}
                value={bpmInput}
                onChangeText={setBpmInput}
                keyboardType="number-pad"
                placeholder="e.g. 128"
                placeholderTextColor="#555"
                maxLength={3}
                autoFocus
                textAlign="center"
              />
              <Text style={bpmStyles.typeUnit}>BPM</Text>
              <TouchableOpacity
                style={[bpmStyles.saveButton, !bpmInput && bpmStyles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!bpmInput || saving}
              >
                {saving
                  ? <ActivityIndicator color="#0D0D12" />
                  : <Text style={bpmStyles.saveButtonText}>Add to Track</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Circle of Fifths Key Modal ───────────────────────────────────────────────

const CIRCLE_SIZE = 288;
const CENTER = CIRCLE_SIZE / 2;
const OUTER_R = 116;
const INNER_R = 72;
const BADGE = 38;
const HALF = BADGE / 2;

const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_KEYS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];

const RING_COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71',
  '#1abc9c','#3498db','#9b59b6','#8e44ad',
  '#2980b9','#27ae60','#d35400','#c0392b',
];

// Root note frequencies (Hz) for each key label
const KEY_FREQ: Record<string, number> = {
  'C': 261.63, 'G': 392.00, 'D': 293.66, 'A': 440.00,
  'E': 329.63, 'B': 493.88, 'F#': 369.99, 'Db': 277.18,
  'Ab': 415.30, 'Eb': 311.13, 'Bb': 466.16, 'F': 349.23,
  'Am': 440.00, 'Em': 329.63, 'Bm': 493.88, 'F#m': 369.99,
  'C#m': 277.18, 'G#m': 415.30, 'D#m': 311.13, 'Bbm': 466.16,
  'Fm': 349.23, 'Cm': 261.63, 'Gm': 392.00, 'Dm': 293.66,
};

function circleAngle(i: number) {
  return (i * 30 - 90) * (Math.PI / 180);
}

// Build a piano-like mono 16-bit PCM WAV as a base64 string.
// Uses additive harmonics (5 partials) + a piano ADSR envelope.
function buildWavBase64(freq: number): string {
  const sampleRate = 22050;
  const seconds = 3;
  const n = Math.floor(sampleRate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);

  const attackEnd  = Math.floor(sampleRate * 0.008); // 8 ms sharp attack
  const decayEnd   = Math.floor(sampleRate * 0.35);  // 350 ms decay to sustain level
  const releaseEnd = n;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    // Piano ADSR envelope
    let env: number;
    if (i < attackEnd) {
      env = i / attackEnd;                                          // 0 → 1
    } else if (i < decayEnd) {
      const p = (i - attackEnd) / (decayEnd - attackEnd);
      env = 1.0 - p * 0.65;                                        // 1 → 0.35 (percussive thump)
    } else {
      const p = (i - decayEnd) / (releaseEnd - decayEnd);
      env = 0.35 * Math.pow(1 - p, 1.6);                           // gentle exponential release
    }

    // Additive synthesis: fundamental + 4 harmonics mimicking piano string resonance
    const raw =
      Math.sin(2 * Math.PI * freq       * t) * 0.50 +
      Math.sin(2 * Math.PI * freq * 2   * t) * 0.25 +
      Math.sin(2 * Math.PI * freq * 3   * t) * 0.13 +
      Math.sin(2 * Math.PI * freq * 4   * t) * 0.07 +
      Math.sin(2 * Math.PI * freq * 5   * t) * 0.05;

    v.setInt16(44 + i * 2, Math.round(raw * env * 0.80 * 32767), true);
  }

  // Chunk size must be a multiple of 3 so btoa never emits mid-string padding
  const bytes = new Uint8Array(buf);
  let b64 = '';
  const CHUNK = 768; // 256 × 3
  for (let i = 0; i < bytes.length; i += CHUNK) {
    b64 += btoa(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return b64;
}

// Per-session WAV cache (key → file URI)
const wavCache: Record<string, string> = {};

async function getOrCreateWav(key: string): Promise<string | null> {
  if (wavCache[key]) return wavCache[key];
  const freq = KEY_FREQ[key];
  if (!freq) return null;
  try {
    const b64 = buildWavBase64(freq);
    // Use a safe filename: replace # → s, keep b as-is
    const safe = key.replace(/#/g, 's');
    const uri = `${FileSystem.cacheDirectory}vv_key2_${safe}.wav`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' });
    wavCache[key] = uri;
    return uri;
  } catch (e) {
    console.warn('[KeyModal] WAV write failed:', e);
    return null;
  }
}

function KeyModal({
  visible,
  currentKey,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentKey: string | null;
  onSave: (key: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(currentKey ?? null);
  const [soundOn, setSoundOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const noteGenRef = useRef(0); // guard against async race on fast tap→release

  useEffect(() => {
    if (visible) setSelected(currentKey ?? null);
    if (!visible) stopNote();
  }, [visible]);

  // Unload the current sound without touching the generation counter.
  // Zeroes volume first to avoid click/pop on abrupt cutoff.
  async function unloadCurrent() {
    const s = soundRef.current;
    soundRef.current = null;
    if (!s) return;
    try { await s.setVolumeAsync(0); } catch (_) {}
    try { await s.stopAsync(); } catch (_) {}
    try { await s.unloadAsync(); } catch (_) {}
  }

  async function startNote(key: string) {
    if (!soundOn) return;
    const gen = ++noteGenRef.current;
    try {
      await unloadCurrent(); // stop previous note without bumping gen
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      const uri = await getOrCreateWav(key);
      if (!uri) { console.warn('[KeyModal] no URI for', key); return; }
      if (gen !== noteGenRef.current) return; // finger lifted while building WAV
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 },
      );
      if (gen !== noteGenRef.current) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = sound;
    } catch (e) {
      console.warn('[KeyModal] startNote error:', e);
    }
  }

  async function stopNote() {
    noteGenRef.current++; // cancel any in-flight startNote
    await unloadCurrent();
  }

  async function handleSave() {
    if (!selected) return;
    await stopNote();
    setSaving(true);
    await onSave(selected);
    setSaving(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={keyStyles.backdrop}>
        <View style={keyStyles.sheet}>

          {/* Header */}
          <View style={keyStyles.header}>
            <Text style={keyStyles.headerTitle}>Set Key</Text>
            <View style={keyStyles.headerRight}>
              <TouchableOpacity
                style={keyStyles.soundToggleWrap}
                onPress={() => { if (soundOn) stopNote(); setSoundOn(v => !v); }}
              >
                <View style={[keyStyles.soundToggle, soundOn && keyStyles.soundToggleOn]}>
                  <Ionicons
                    name={soundOn ? 'volume-high-outline' : 'volume-mute-outline'}
                    size={18}
                    color={soundOn ? '#0D0D12' : '#555'}
                  />
                </View>
                <Text style={keyStyles.soundToggleHint}>Hold to preview</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { stopNote(); onClose(); }}>
                <Text style={keyStyles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Selected key readout */}
          <View style={keyStyles.readoutRow}>
            <Text style={keyStyles.readout}>{selected ?? '—'}</Text>
            <Text style={keyStyles.readoutSub}>
              {selected
                ? MINOR_KEYS.includes(selected) ? 'minor' : 'major'
                : 'hold a key to preview'}
            </Text>
          </View>

          {/* Circle of Fifths */}
          <View style={keyStyles.circleWrap}>
            {MAJOR_KEYS.map((key, i) => {
              const a = circleAngle(i);
              return (
                <KeyBadge
                  key={key}
                  keyName={key}
                  x={CENTER + OUTER_R * Math.cos(a) - HALF}
                  y={CENTER + OUTER_R * Math.sin(a) - HALF}
                  isMinor={false}
                  colorIndex={i}
                  isSelected={selected === key}
                  onPressIn={() => { setSelected(key); startNote(key); }}
                  onPressOut={stopNote}
                />
              );
            })}
            {MINOR_KEYS.map((key, i) => {
              const a = circleAngle(i);
              return (
                <KeyBadge
                  key={key}
                  keyName={key}
                  x={CENTER + INNER_R * Math.cos(a) - HALF}
                  y={CENTER + INNER_R * Math.sin(a) - HALF}
                  isMinor={true}
                  colorIndex={i}
                  isSelected={selected === key}
                  onPressIn={() => { setSelected(key); startNote(key); }}
                  onPressOut={stopNote}
                />
              );
            })}
            <View style={keyStyles.centerDot} />
          </View>

          {/* Add to Track */}
          <TouchableOpacity
            style={[keyStyles.saveButton, !selected && keyStyles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!selected || saving}
          >
            {saving
              ? <ActivityIndicator color="#0D0D12" />
              : <Text style={keyStyles.saveButtonText}>Add to Track</Text>
            }
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

// KeyBadge is intentionally defined OUTSIDE KeyModal so React never
// remounts it on re-render (which would sever the active touch and kill onPressOut).
function KeyBadge({
  keyName, x, y, isMinor, colorIndex, isSelected, onPressIn, onPressOut,
}: {
  keyName: string; x: number; y: number; isMinor: boolean;
  colorIndex: number; isSelected: boolean;
  onPressIn: () => void; onPressOut: () => void;
}) {
  return (
    <Pressable
      style={[
        keyStyles.keyBadge,
        isMinor && keyStyles.keyBadgeMinor,
        { left: x, top: y, backgroundColor: isSelected ? RING_COLORS[colorIndex] : (isMinor ? '#141418' : '#1C1C24') },
        isSelected && keyStyles.keyBadgeSelected,
      ]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Text style={[isMinor ? keyStyles.keyTextMinor : keyStyles.keyText, isSelected && keyStyles.keyTextSelected]}>
        {keyName}
      </Text>
    </Pressable>
  );
}

// ─── PlaylistPickerModal ──────────────────────────────────────────────────────
function PlaylistPickerModal({
  visible,
  trackId,
  onClose,
  onCountChange,
}: {
  visible: boolean;
  trackId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const [playlists,    setPlaylists]    = useState<Array<{ id: string; name: string }>>([]);
  const [memberIds,    setMemberIds]    = useState<Set<string>>(new Set());
  const [fetching,     setFetching]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName,      setNewName]      = useState('');
  const creatingRef = useRef(false); // idempotent guard so a single submit creates exactly one setlist

  useEffect(() => {
    if (visible) {
      loadPlaylists();
      setShowNewInput(false);
      setNewName('');
    }
  }, [visible]);

  async function loadPlaylists() {
    setFetching(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFetching(false); return; }
    const [playlistsRes, memberRes] = await Promise.all([
      supabase.from('playlists').select('id, name').eq('user_id', user.id).order('created_at'),
      supabase.from('playlist_tracks').select('playlist_id').eq('track_id', trackId),
    ]);
    setPlaylists(playlistsRes.data ?? []);
    setMemberIds(new Set((memberRes.data ?? []).map(pt => pt.playlist_id)));
    setFetching(false);
  }

  async function togglePlaylist(playlistId: string) {
    const isMember = memberIds.has(playlistId);
    setSaving(true);
    if (isMember) {
      await supabase.from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId);
      const next = new Set(memberIds);
      next.delete(playlistId);
      setMemberIds(next);
      onCountChange(next.size);
    } else {
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: trackId, position: 0 });
      const next = new Set([...memberIds, playlistId]);
      setMemberIds(next);
      onCountChange(next.size);
    }
    setSaving(false);
  }

  async function createAndAdd() {
    // Fires from the keyboard's "done" key (onSubmitEditing) and the Create button.
    // The keyboard key is the reliable one-press path on Android — see note on the input below.
    if (creatingRef.current) return;
    const name = newName.trim();
    if (!name) return;
    creatingRef.current = true;
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;
      const { data: newPl } = await supabase
        .from('playlists').insert({ user_id: user.id, name }).select('id, name').single();
      if (newPl) {
        await supabase
          .from('playlist_tracks').insert({ playlist_id: newPl.id, track_id: trackId, position: 0 });
        const next = new Set([...memberIds, newPl.id]);
        setPlaylists(prev => [...prev, newPl]);
        setMemberIds(next);
        onCountChange(next.size);
      }
    } finally {
      setNewName('');
      setShowNewInput(false);
      setSaving(false);
      creatingRef.current = false;
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={plStyles.backdrop}
        behavior="padding"
      >
        <View style={plStyles.sheet}>
          <View style={plStyles.header}>
            <Text style={plStyles.title}>Add to Setlist</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={plStyles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {fetching ? (
            <ActivityIndicator color="#DFFF00" style={{ padding: 24 }} />
          ) : (
              <ScrollView style={plStyles.list} keyboardShouldPersistTaps="handled">
                {playlists.map(pl => {
                  const isMember = memberIds.has(pl.id);
                  return (
                    <TouchableOpacity
                      key={pl.id}
                      style={plStyles.row}
                      onPress={() => !saving && togglePlaylist(pl.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[plStyles.checkbox, isMember && plStyles.checkboxChecked]}>
                        {isMember && <Ionicons name="checkmark" size={14} color="#0D0D12" />}
                      </View>
                      <Text style={plStyles.rowText}>{pl.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
          )}

          {showNewInput ? (
            <View style={plStyles.newInputWrap}>
              <View style={plStyles.newInputRow}>
                <TextInput
                  style={plStyles.newInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Setlist name…"
                  placeholderTextColor="#555"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createAndAdd}
                />
                <TouchableOpacity
                  style={[plStyles.newConfirm, !newName.trim() && plStyles.newConfirmDisabled]}
                  onPress={createAndAdd}
                  disabled={!newName.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#0D0D12" size="small" />
                    : <Text style={plStyles.newConfirmText}>Create</Text>
                  }
                </TouchableOpacity>
              </View>
              <Text style={plStyles.newHint}>Tap ⏎ on your keyboard to create</Text>
            </View>
          ) : (
            <TouchableOpacity style={plStyles.newRow} onPress={() => setShowNewInput(true)}>
              <Ionicons name="add-circle-outline" size={20} color="#DFFF00" />
              <Text style={plStyles.newRowText}>New setlist…</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={plStyles.doneBtn} onPress={onClose}>
            <Text style={plStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── TrackRow ─────────────────────────────────────────────────────────────────
function TrackRow({
  track,
  onBpmSave,
  onKeySave,
  playlistCount,
  onPlaylistCountChange,
}: {
  track: RecordTrack;
  onBpmSave: (bpm: number) => Promise<void>;
  onKeySave: (key: string) => Promise<void>;
  playlistCount: number;
  onPlaylistCountChange: (count: number) => void;
}) {
  const [bpmModalVisible,      setBpmModalVisible]      = useState(false);
  const [keyModalVisible,      setKeyModalVisible]      = useState(false);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);

  return (
    <View style={styles.trackRow}>
      <Text style={styles.trackPosition}>{track.position}</Text>
      <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
      <View style={styles.trackRight}>
        {track.duration ? (
          <Text style={styles.trackDuration}>{track.duration}</Text>
        ) : null}

        {/* BPM badge — opens BPM modal */}
        <TouchableOpacity onPress={() => setBpmModalVisible(true)}>
          <Text style={styles.bpmBadge}>
            {track.bpm ? `${track.bpm} BPM` : '+ BPM'}
          </Text>
        </TouchableOpacity>

        {/* Key badge — opens Circle of Fifths modal */}
        <TouchableOpacity onPress={() => setKeyModalVisible(true)}>
          <Text style={styles.keyBadge}>
            {track.key ? track.key : '+ Key'}
          </Text>
        </TouchableOpacity>

        {/* Playlist badge */}
        <TouchableOpacity onPress={() => setPlaylistModalVisible(true)}>
          <Text style={styles.playlistBadge}>
            {playlistCount > 0 ? `♦ ${playlistCount}` : '+ Set'}
          </Text>
        </TouchableOpacity>
      </View>

      <BpmModal
        visible={bpmModalVisible}
        currentBpm={track.bpm ?? null}
        onSave={onBpmSave}
        onClose={() => setBpmModalVisible(false)}
      />

      <KeyModal
        visible={keyModalVisible}
        currentKey={track.key ?? null}
        onSave={onKeySave}
        onClose={() => setKeyModalVisible(false)}
      />

      <PlaylistPickerModal
        visible={playlistModalVisible}
        trackId={track.id}
        onClose={() => setPlaylistModalVisible(false)}
        onCountChange={onPlaylistCountChange}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D12' },
  errorText: { color: '#aaa', fontSize: 16 },
  cover: { width: '100%', height: 300, resizeMode: 'cover' },
  coverPlaceholder: {
    width: '100%',
    height: 220,
    backgroundColor: '#1C1C24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: { fontSize: 72 },
  titleBlock: { padding: 20, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  artist: { color: '#DFFF00', fontSize: 17, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    backgroundColor: '#1C1C24',
    color: '#aaa',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  section: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  sectionTitle: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  conditionRow: { flexDirection: 'row', gap: 24 },
  conditionItem: { alignItems: 'center', gap: 6 },
  conditionLabel: { color: '#aaa', fontSize: 12 },
  valuationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  valuationItem: {},
  valuationLabel: { color: '#aaa', fontSize: 12, marginBottom: 2 },
  valuationAmount: { color: '#fff', fontSize: 18, fontWeight: '700' },
  highlight: { color: '#DFFF00' },
  detailsTable: { gap: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: '#aaa', fontSize: 14, flex: 1 },
  detailValue: { color: '#fff', fontSize: 14, flex: 2, textAlign: 'right' },
  notes: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  deleteBtn: {
    marginHorizontal: 20,
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFFF00',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#DFFF00', fontSize: 15, fontWeight: '600' },
  tracklist: { gap: 10 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackPosition: { color: '#DFFF00', fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
  trackTitle: { color: '#fff', fontSize: 14, flex: 1 },
  trackRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackDuration: { color: '#666', fontSize: 13 },
  bpmBadge:      { color: '#DFFF00', fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: '#DFFF00',  borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  keyBadge:      { color: '#7FFFD4', fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: '#7FFFD4',  borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  playlistBadge: { color: '#B39DDB', fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: '#B39DDB',  borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bpmInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bpmInput: { backgroundColor: '#2A2A3A', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, fontSize: 13, width: 52, textAlign: 'center' },
  bpmSave: { color: '#7FFFD4', fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  bpmCancel: { color: '#888', fontSize: 14, paddingHorizontal: 4 },
});

const bpmStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2A2A3A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { color: '#888', fontSize: 20, paddingHorizontal: 4 },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#0D0D12',
    borderRadius: 10,
    padding: 3,
    marginBottom: 28,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: { backgroundColor: '#2A2A3A' },
  modeTabText: { color: '#555', fontSize: 14, fontWeight: '600' },
  modeTabTextActive: { color: '#fff' },

  // Tap mode
  tapContent: { alignItems: 'center' },
  bpmReadout: {
    color: '#DFFF00',
    fontSize: 80,
    fontWeight: '800',
    lineHeight: 88,
    letterSpacing: -2,
  },
  bpmUnit: { color: '#555', fontSize: 14, fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
  tapHint: { color: '#666', fontSize: 13, marginBottom: 32, textAlign: 'center' },
  tapButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0D0D12',
    borderWidth: 3,
    borderColor: '#DFFF00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  tapButtonText: {
    color: '#DFFF00',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
  },

  // Type mode
  typeContent: { alignItems: 'center', paddingTop: 8 },
  typeInput: {
    backgroundColor: '#0D0D12',
    color: '#DFFF00',
    fontSize: 64,
    fontWeight: '800',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2A2A3A',
    marginBottom: 8,
  },
  typeUnit: { color: '#555', fontSize: 14, fontWeight: '700', letterSpacing: 3, marginBottom: 32 },

  // Shared save button
  saveButton: {
    backgroundColor: '#DFFF00',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
  },
  saveButtonDisabled: { opacity: 0.35 },
  saveButtonText: { color: '#0D0D12', fontSize: 16, fontWeight: '800' },
});

const keyStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2A2A3A',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  soundToggleWrap: {
    alignItems: 'center',
    gap: 4,
  },
  soundToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#2A2A3A',
    backgroundColor: '#0D0D12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundToggleOn: {
    backgroundColor: '#7FFFD4',
    borderColor: '#7FFFD4',
  },
  soundToggleHint: {
    color: '#444',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  closeBtn: { color: '#888', fontSize: 20, paddingHorizontal: 4 },

  readoutRow: { alignItems: 'center', marginBottom: 16 },
  readout: {
    color: '#7FFFD4',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 52,
  },
  readoutSub: { color: '#555', fontSize: 13, marginTop: 2 },

  circleWrap: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    position: 'relative',
    marginBottom: 24,
  },
  keyBadge: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  keyBadgeMinor: {
    borderColor: '#222230',
  },
  keyBadgeSelected: {
    borderWidth: 0,
    shadowColor: '#fff',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  keyText: { color: '#ccc', fontSize: 11, fontWeight: '700' },
  keyTextMinor: { color: '#666', fontSize: 10, fontWeight: '600' },
  keyTextSelected: { color: '#fff', fontWeight: '800' },
  centerDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2A2A3A',
    left: CENTER - 6,
    top: CENTER - 6,
  },

  saveButton: {
    backgroundColor: '#7FFFD4',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  saveButtonDisabled: { opacity: 0.3 },
  saveButtonText: { color: '#0D0D12', fontSize: 16, fontWeight: '800' },
});

// ─── Playlist Picker Styles ───────────────────────────────────────────────────
const plStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1C1C24', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, maxHeight: '70%',
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#2A2A3A',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 12,
  },
  title:    { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { color: '#888', fontSize: 20, paddingHorizontal: 4 },
  list:     { maxHeight: 340 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#2A2A3A',
  },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#444', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#DFFF00', borderColor: '#DFFF00' },
  rowText:         { color: '#fff', fontSize: 15 },
  newInputWrap:    { paddingTop: 4 },
  newInputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  newHint:         { color: '#666', fontSize: 12, paddingHorizontal: 24, paddingBottom: 10 },
  newInput: {
    flex: 1, backgroundColor: '#0D0D12', borderRadius: 10, borderWidth: 1,
    borderColor: '#2A2A3A', color: '#fff', fontSize: 15, paddingHorizontal: 12, paddingVertical: 8,
  },
  newConfirm:         { backgroundColor: '#DFFF00', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newConfirmDisabled: { opacity: 0.35 },
  newConfirmText:     { color: '#0D0D12', fontSize: 14, fontWeight: '700' },
  newRow:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 16 },
  newRowText:         { color: '#DFFF00', fontSize: 15, fontWeight: '600' },
  doneBtn:            { marginHorizontal: 24, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: '#DFFF00', alignItems: 'center' },
  doneBtnText:        { color: '#0D0D12', fontSize: 16, fontWeight: '800' },
});
