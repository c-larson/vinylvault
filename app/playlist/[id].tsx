import { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  PanResponder,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetTrackRow {
  id:             string;        // playlist_tracks.id
  track_id:       string;
  position:       number;        // setlist order
  track_position: string | null; // album side/track e.g. "A1", "B2"
  title:          string;
  artist:         string;
  album:          string;
  bpm:            number | null;
  key:            string | null;
  duration:       string | null;
  cue_notes:      string | null; // free-text transition notes
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

function parseDurationSeconds(dur: string | null): number {
  if (!dur) return 0;
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Row height must match the trackRow style below so the drag math is accurate
const ROW_HEIGHT = 76;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SetlistDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const [setName,  setSetName]  = useState('');
  const [tracks,   setTracks]   = useState<SetTrackRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(false);

  // ─── Cue modal state ─────────────────────────────────────────────────────────
  const [cueModalTrackId, setCueModalTrackId] = useState<string | null>(null);

  // ─── Drag state ──────────────────────────────────────────────────────────────
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragToIdx,   setDragToIdx]   = useState<number | null>(null);
  const tracksRef = useRef<SetTrackRow[]>([]);
  tracksRef.current = tracks;

  // Reordered view for display during drag
  const displayTracks = useMemo(() => {
    if (dragFromIdx === null || dragToIdx === null || dragFromIdx === dragToIdx) return tracks;
    const arr = [...tracks];
    const [item] = arr.splice(dragFromIdx, 1);
    arr.splice(dragToIdx, 0, item);
    return arr;
  }, [tracks, dragFromIdx, dragToIdx]);

  const dragActiveId = dragFromIdx !== null ? tracks[dragFromIdx]?.id : null;

  // ─── Fetch ────────────────────────────────────────────────────────────────────

  useEffect(() => { fetchSetlist(); }, [id]);

  async function fetchSetlist() {
    const [setRes, tracksRes] = await Promise.all([
      supabase.from('playlists').select('name').eq('id', id).single(),
      supabase
        .from('playlist_tracks')
        .select('id, track_id, position, cue_notes, record_tracks(title, bpm, key, position, duration, record_id, records(artist, title))')
        .eq('playlist_id', id)
        .order('position'),
    ]);
    if (setRes.data) setSetName(setRes.data.name);
    if (tracksRes.data) {
      setTracks(
        tracksRes.data.map((pt: any) => ({
          id:             pt.id,
          track_id:       pt.track_id,
          position:       pt.position,
          track_position: pt.record_tracks?.position  ?? null,
          title:          pt.record_tracks?.title     ?? '',
          artist:         pt.record_tracks?.records?.artist ?? '',
          album:          pt.record_tracks?.records?.title  ?? '',
          bpm:            pt.record_tracks?.bpm       ?? null,
          key:            pt.record_tracks?.key       ?? null,
          duration:       pt.record_tracks?.duration  ?? null,
          cue_notes:      pt.cue_notes                ?? null,
        }))
      );
    }
    setLoading(false);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────────

  async function saveCueNotes(playlistTrackId: string, notes: string) {
    const value = notes.trim() || null;
    await supabase.from('playlist_tracks').update({ cue_notes: value }).eq('id', playlistTrackId);
    setTracks(prev => prev.map(t => t.id === playlistTrackId ? { ...t, cue_notes: value } : t));
  }

  async function removeTrack(playlistTrackId: string) {
    await supabase.from('playlist_tracks').delete().eq('id', playlistTrackId);
    setTracks(prev => prev.filter(t => t.id !== playlistTrackId));
  }

  async function handleDragEnd(newTracks: SetTrackRow[]) {
    setTracks(newTracks);
    await Promise.all(
      newTracks.map((track, index) =>
        supabase.from('playlist_tracks').update({ position: index }).eq('id', track.id)
      )
    );
  }

  function handleDelete() {
    Alert.alert(
      'Delete Setlist',
      `Delete "${setName}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.from('playlists').delete().eq('id', id);
            if (error) { Alert.alert('Error', error.message); setDeleting(false); }
            else router.back();
          },
        },
      ]
    );
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  const totalSeconds   = tracks.reduce((s, t) => s + parseDurationSeconds(t.duration), 0);
  const totalFormatted = formatTotalDuration(totalSeconds);
  const summaryLine    = [
    `${tracks.length} song${tracks.length !== 1 ? 's' : ''}`,
    totalFormatted,
  ].filter(Boolean).join(' · ');

  // ─── Row renderer ─────────────────────────────────────────────────────────────

  function renderRow(item: SetTrackRow, displayIdx: number) {
    const isActive = item.id === dragActiveId;

    // PanResponder lives on the drag handle view only.
    // displayIdx is captured fresh each render so the move math is always current.
    const panHandlers = PanResponder.create({
      // Capture immediately so the gesture wins over the parent ScrollView
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onPanResponderGrant: () => {
        setDragFromIdx(displayIdx);
        setDragToIdx(displayIdx);
      },
      onPanResponderMove: (_, gs) => {
        const newTo = Math.max(0, Math.min(
          tracksRef.current.length - 1,
          Math.round(displayIdx + gs.dy / ROW_HEIGHT)
        ));
        setDragToIdx(newTo);
      },
      onPanResponderRelease: (_, gs) => {
        const newTo = Math.max(0, Math.min(
          tracksRef.current.length - 1,
          Math.round(displayIdx + gs.dy / ROW_HEIGHT)
        ));
        setDragFromIdx(null);
        setDragToIdx(null);
        if (newTo !== displayIdx) {
          const arr = [...tracksRef.current];
          const [moved] = arr.splice(displayIdx, 1);
          arr.splice(newTo, 0, moved);
          handleDragEnd(arr);
        }
      },
      onPanResponderTerminate: () => {
        setDragFromIdx(null);
        setDragToIdx(null);
      },
    }).panHandlers;

    return (
      <View
        key={item.id}
        style={[styles.trackRow, isActive && styles.trackRowActive]}
      >
        {/* ── Main horizontal row ──────────────────────────────────────── */}
        <View style={styles.trackRowMain}>

          {/* ☰ Drag handle */}
          <View {...panHandlers} style={styles.dragHandle}>
            <Ionicons
              name="reorder-three-outline"
              size={26}
              color={isActive ? '#DFFF00' : '#444'}
            />
          </View>

          {/* Album side/track position chip e.g. "B2" */}
          {item.track_position
            ? <Text style={styles.trackPositionChip}>{item.track_position}</Text>
            : <View style={styles.trackPositionSpacer} />
          }

          {/* Track details */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.trackSub} numberOfLines={1}>
              {item.artist}{item.album ? ` · ${item.album}` : ''}
            </Text>
            {(item.bpm || item.key || item.duration) ? (
              <View style={styles.badges}>
                {item.bpm      ? <Text style={styles.bpmBadge}>{item.bpm} BPM</Text>  : null}
                {item.key      ? <Text style={styles.keyBadge}>{item.key}</Text>       : null}
                {item.duration ? <Text style={styles.durBadge}>{item.duration}</Text>  : null}
              </View>
            ) : null}
          </View>

          {/* + Cue badge */}
          <TouchableOpacity
            onPress={() => !dragActiveId && setCueModalTrackId(item.id)}
            disabled={!!dragActiveId}
            style={styles.cueBadgeWrap}
          >
            <Text style={[styles.cueBadge, !!item.cue_notes && styles.cueBadgeActive]}>
              {item.cue_notes ? '✎ Cue' : '+ Cue'}
            </Text>
          </TouchableOpacity>

          {/* Remove — disabled while dragging so it doesn't fire accidentally */}
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => !dragActiveId && removeTrack(item.id)}
            disabled={!!dragActiveId}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove-circle-outline" size={22} color={dragActiveId ? '#2A2A3A' : '#555'} />
          </TouchableOpacity>

        </View>

        {/* ── Cue notes — expands below when saved ─────────────────────── */}
        {item.cue_notes ? (
          <TouchableOpacity
            style={styles.cueNotesRow}
            onPress={() => !dragActiveId && setCueModalTrackId(item.id)}
            disabled={!!dragActiveId}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward-outline" size={12} color="#FFA040" style={styles.cueNotesArrow} />
            <Text style={styles.cueNotesText}>{item.cue_notes}</Text>
          </TouchableOpacity>
        ) : null}

      </View>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#DFFF00" />
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{setName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Set summary */}
      <View style={styles.summary}>
        <Text style={styles.summarySetName}>{setName}</Text>
        <Text style={styles.summaryStats}>{summaryLine}</Text>
        {tracks.length > 1 && (
          <Text style={styles.summaryHint}>Drag ☰ to reorder</Text>
        )}
      </View>

      {/* Track list */}
      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No tracks yet.</Text>
          <Text style={styles.emptyHint}>
            Open a record and tap + Set on any track to add it here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          scrollEnabled={dragFromIdx === null}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {displayTracks.map((item, displayIdx) => renderRow(item, displayIdx))}
        </ScrollView>
      )}

      {/* Delete */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
        {deleting
          ? <ActivityIndicator color="#ff4444" />
          : <Text style={styles.deleteBtnText}>Delete Setlist</Text>
        }
      </TouchableOpacity>

      {/* Cue notes modal */}
      {cueModalTrackId && (
        <CueModal
          visible
          initialNotes={tracks.find(t => t.id === cueModalTrackId)?.cue_notes ?? ''}
          onSave={async (notes) => {
            await saveCueNotes(cueModalTrackId, notes);
            setCueModalTrackId(null);
          }}
          onClose={() => setCueModalTrackId(null)}
        />
      )}

    </SafeAreaView>
  );
}

// ─── CueModal ─────────────────────────────────────────────────────────────────

function CueModal({
  visible,
  initialNotes,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text,   setText]   = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setText(initialNotes); }, [visible]);

  async function handleSave() {
    setSaving(true);
    await onSave(text);
    setSaving(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={cueStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={cueStyles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={cueStyles.sheet}>
          <View style={cueStyles.header}>
            <Text style={cueStyles.title}>Transition Notes</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={cueStyles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={cueStyles.hint}>
            Notes on how to transition into this song — energy, key, tempo, vibe, etc.
          </Text>
          <TextInput
            style={cueStyles.input}
            value={text}
            onChangeText={setText}
            placeholder="e.g. Fade in slowly, match Bb key, build from 109 BPM…"
            placeholderTextColor="#555"
            multiline
            autoFocus
            textAlignVertical="top"
          />
          <View style={cueStyles.actions}>
            {!!text.trim() && (
              <TouchableOpacity style={cueStyles.clearBtn} onPress={() => setText('')}>
                <Text style={cueStyles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[cueStyles.saveBtn, saving && cueStyles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#0D0D12" size="small" />
                : <Text style={cueStyles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D12' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#2A2A3A',
  },
  backBtn:     { width: 40, padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },

  summary: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#2A2A3A',
    backgroundColor: '#111118',
  },
  summarySetName: { color: '#DFFF00', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  summaryStats:   { color: '#aaa',    fontSize: 14, marginBottom: 2 },
  summaryHint:    { color: '#444',    fontSize: 12 },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyHint: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  list: { flex: 1 },

  // Outer row is a column so cue notes can expand below the main content.
  // ROW_HEIGHT constant is used for drag math and approximates the main row height.
  trackRow: {
    flexDirection: 'column',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C24',
    backgroundColor: '#0D0D12',
  },
  trackRowActive: { backgroundColor: '#1C1C24', borderLeftWidth: 3, borderLeftColor: '#DFFF00' },
  trackRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },

  cueNotesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 52,   // aligns with track title (handle + position chip)
    paddingRight: 48,  // leaves space for remove button column
    paddingBottom: 10,
    paddingTop: 2,
  },
  cueNotesArrow: { marginTop: 1, marginRight: 5, flexShrink: 0 },
  cueNotesText: {
    flex: 1,
    color: '#FFA040',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  dragHandle:          { paddingHorizontal: 6, paddingVertical: 4, marginRight: 4 },
  trackPositionChip:   { color: '#DFFF00', fontSize: 12, fontWeight: '700', width: 28, textAlign: 'center', marginRight: 6 },
  trackPositionSpacer: { width: 34 },

  trackInfo:  { flex: 1, marginRight: 8 },
  trackTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 1 },
  trackSub:   { color: '#666', fontSize: 12, marginBottom: 3 },

  badges: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  bpmBadge: { color: '#DFFF00', fontSize: 11, fontWeight: '600', borderWidth: 1, borderColor: '#DFFF00', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  keyBadge: { color: '#7FFFD4', fontSize: 11, fontWeight: '600', borderWidth: 1, borderColor: '#7FFFD4', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  durBadge: { color: '#888',    fontSize: 11,                    borderWidth: 1, borderColor: '#333',    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },

  cueBadgeWrap: { marginRight: 6 },
  cueBadge: {
    color: '#FFA040', fontSize: 11, fontWeight: '600',
    borderWidth: 1, borderColor: '#FFA040', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  cueBadgeActive: {
    color: '#0D0D12', backgroundColor: '#FFA040',
  },

  removeBtn: { padding: 4 },

  deleteBtn: {
    marginHorizontal: 16, marginBottom: 32, marginTop: 8,
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#ff4444', alignItems: 'center',
  },
  deleteBtnText: { color: '#ff4444', fontSize: 15, fontWeight: '600' },
});

const cueStyles = StyleSheet.create({
  flex:    { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#1C1C24',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#2A2A3A',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  title:    { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { color: '#888', fontSize: 20, paddingHorizontal: 4 },
  hint:     { color: '#555', fontSize: 13, marginBottom: 14 },
  input: {
    backgroundColor: '#0D0D12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A3A',
    color: '#fff',
    fontSize: 15,
    padding: 14,
    minHeight: 120,
    marginBottom: 16,
  },
  actions:        { flexDirection: 'row', gap: 10 },
  clearBtn:       { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center' },
  clearBtnText:   { color: '#aaa', fontSize: 15, fontWeight: '600' },
  saveBtn:        { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFA040', alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.5 },
  saveBtnText:    { color: '#0D0D12', fontSize: 15, fontWeight: '800' },
});
