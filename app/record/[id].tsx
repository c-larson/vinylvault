import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPriceSuggestions } from '@/lib/discogs';
import { ConditionBadge } from '@/components/ConditionBadge';
import type { Record, RecordTrack, GoldmineCondition } from '@/types/database';

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
  const [record, setRecord] = useState<Record | null>(null);
  const [tracks, setTracks] = useState<RecordTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      const [recordResult, tracksResult] = await Promise.all([
        supabase.from('records').select('*').eq('id', id).single(),
        supabase.from('record_tracks').select('*').eq('record_id', id).order('position'),
      ]);
      if (recordResult.data) setRecord(recordResult.data);
      if (recordResult.error) Alert.alert('Error', 'Could not load record.');
      if (tracksResult.data) setTracks(tracksResult.data);
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
        <ActivityIndicator size="large" color="#e94560" />
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
          ? <ActivityIndicator color="#e94560" />
          : <Text style={styles.deleteBtnText}>Remove from Vault</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function TrackRow({
  track,
  onBpmSave,
}: {
  track: RecordTrack;
  onBpmSave: (bpm: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [bpmInput, setBpmInput] = useState(track.bpm ? String(track.bpm) : '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const val = parseInt(bpmInput, 10);
    if (isNaN(val) || val < 1 || val > 300) {
      Alert.alert('Invalid BPM', 'Enter a number between 1 and 300.');
      return;
    }
    setSaving(true);
    await onBpmSave(val);
    setSaving(false);
    setEditing(false);
  }

  return (
    <View style={styles.trackRow}>
      <Text style={styles.trackPosition}>{track.position}</Text>
      <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
      <View style={styles.trackRight}>
        {track.duration ? (
          <Text style={styles.trackDuration}>{track.duration}</Text>
        ) : null}
        {editing ? (
          <View style={styles.bpmInputRow}>
            <TextInput
              style={styles.bpmInput}
              value={bpmInput}
              onChangeText={setBpmInput}
              keyboardType="number-pad"
              placeholder="BPM"
              placeholderTextColor="#555"
              maxLength={3}
              autoFocus
            />
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={styles.bpmSave}>{saving ? '…' : '✓'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.bpmCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.bpmBadge}>
              {track.bpm ? `${track.bpm} BPM` : '+ BPM'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  errorText: { color: '#aaa', fontSize: 16 },
  cover: { width: '100%', height: 300, resizeMode: 'cover' },
  coverPlaceholder: {
    width: '100%',
    height: 220,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: { fontSize: 72 },
  titleBlock: { padding: 20, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  artist: { color: '#e94560', fontSize: 17, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    backgroundColor: '#16213e',
    color: '#aaa',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  section: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
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
  highlight: { color: '#e94560' },
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
    borderColor: '#e94560',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#e94560', fontSize: 15, fontWeight: '600' },
  tracklist: { gap: 10 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackPosition: { color: '#e94560', fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
  trackTitle: { color: '#fff', fontSize: 14, flex: 1 },
  trackRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackDuration: { color: '#666', fontSize: 13 },
  bpmBadge: { color: '#e94560', fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: '#e94560', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bpmInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bpmInput: { backgroundColor: '#0f3460', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, fontSize: 13, width: 52, textAlign: 'center' },
  bpmSave: { color: '#4ade80', fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  bpmCancel: { color: '#888', fontSize: 14, paddingHorizontal: 4 },
});
