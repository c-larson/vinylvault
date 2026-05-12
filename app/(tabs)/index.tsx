import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { Record, Tag } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode      = 'grid' | 'table' | 'tracks';
type SortDir       = 'asc' | 'desc';
type FilterKey     = 'artist' | 'title' | 'genre' | 'year' | 'tag';
type TrackFilterKey = 'artist' | 'album' | 'genre' | 'key' | 'category';

interface RecordWithTags extends Record {
  tagList: Tag[];
}

interface TrackRow {
  id:        string;
  record_id: string;
  title:     string;
  duration:  string | null;
  bpm:       number | null;
  key:       string | null;
  artist:    string;
  album:     string;
  genre:     string | null;
  category:  string;
}

interface Col {
  key:     string;
  label:   string;
  width:   number;
  visible: boolean;
}

interface FilterState {
  artist: string | null;
  title:  string | null;
  genre:  string | null;
  year:   string | null;
  tag:    string | null;
}

interface TrackFilterState {
  artist:   string | null;
  album:    string | null;
  genre:    string | null;
  key:      string | null;
  category: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIST_COLS: Col[] = [
  { key: 'artist',     label: 'Artist',     width: 140, visible: true },
  { key: 'title',      label: 'Album',      width: 160, visible: true },
  { key: 'genre',      label: 'Genre',      width: 100, visible: true },
  { key: 'label',      label: 'Label',      width: 120, visible: true },
  { key: 'year',       label: 'Released',   width: 80,  visible: true },
  { key: 'created_at', label: 'Date Added', width: 110, visible: true },
  { key: 'tag',        label: 'Category',   width: 130, visible: true },
];

const DEFAULT_TRACK_COLS: Col[] = [
  { key: 'title',    label: 'Song',     width: 180, visible: true  },
  { key: 'artist',   label: 'Artist',   width: 140, visible: true  },
  { key: 'album',    label: 'Album',    width: 140, visible: true  },
  { key: 'genre',    label: 'Genre',    width: 100, visible: true  },
  { key: 'bpm',      label: 'BPM',      width: 72,  visible: true  },
  { key: 'key',      label: 'Key',      width: 72,  visible: true  },
  { key: 'category', label: 'Category', width: 130, visible: true  },
  { key: 'duration', label: 'Duration', width: 90,  visible: false },
];

const FILTER_LABELS: Record<FilterKey, string> = {
  artist: 'Artist', title: 'Album', genre: 'Genre', year: 'Year', tag: 'Category',
};

const TRACK_FILTER_LABELS: Record<TrackFilterKey, string> = {
  artist: 'Artist', album: 'Album', genre: 'Genre', key: 'Key', category: 'Category',
};

const EMPTY_FILTERS: FilterState       = { artist: null, title: null, genre: null, year: null, tag: null };
const EMPTY_TRACK_FILTERS: TrackFilterState = { artist: null, album: null, genre: null, key: null, category: null };

// ─── Cell value helpers ───────────────────────────────────────────────────────

function getTrackCellValue(t: TrackRow, colKey: string): string {
  switch (colKey) {
    case 'title':    return t.title;
    case 'artist':   return t.artist;
    case 'album':    return t.album;
    case 'genre':    return t.genre    ?? '—';
    case 'bpm':      return t.bpm != null ? String(t.bpm) : '—';
    case 'key':      return t.key      ?? '—';
    case 'category': return t.category || '—';
    case 'duration': return t.duration ?? '—';
    default:         return '—';
  }
}

function getListCellValue(r: RecordWithTags, colKey: string): string {
  switch (colKey) {
    case 'artist':     return r.artist;
    case 'title':      return r.title;
    case 'genre':      return r.genre ?? '—';
    case 'label':      return (r as any).label ?? '—';
    case 'year':       return r.year != null ? String(r.year) : '—';
    case 'created_at': return new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    case 'tag':        return r.tagList.length > 0 ? r.tagList.map(t => t.name).join(', ') : '—';
    default:           return '—';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const router = useRouter();

  // Records + tracks
  const [records,    setRecords]    = useState<RecordWithTags[]>([]);
  const [allTags,    setAllTags]    = useState<Tag[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tracks,     setTracks]     = useState<TrackRow[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Record filters / sort
  const [filters,      setFilters]      = useState<FilterState>(EMPTY_FILTERS);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [sortColumn,   setSortColumn]   = useState('created_at');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');

  // Column configs (both views)
  const [listCols,       setListCols]       = useState<Col[]>(DEFAULT_LIST_COLS);
  const [trackCols,      setTrackCols]      = useState<Col[]>(DEFAULT_TRACK_COLS);
  const [listColModal,   setListColModal]   = useState(false);
  const [trackColModal,  setTrackColModal]  = useState(false);

  // Track filters / sort
  const [trackFilters,      setTrackFilters]      = useState<TrackFilterState>(EMPTY_TRACK_FILTERS);
  const [trackOpenDropdown, setTrackOpenDropdown] = useState<TrackFilterKey | null>(null);
  const [trackSortCol,      setTrackSortCol]      = useState('title');
  const [trackSortDir,      setTrackSortDir]      = useState<SortDir>('asc');

  // ⋮ Three-dot menu
  const [menuVisible, setMenuVisible] = useState(false);

  // Add custom tag modal
  const [addTagVisible, setAddTagVisible] = useState(false);
  const [newTagName,    setNewTagName]    = useState('');

  // Edit custom-cell value modal
  const [editCellVisible, setEditCellVisible] = useState(false);
  const [editRowId,       setEditRowId]       = useState('');
  const [editColKey,      setEditColKey]      = useState('');
  const [editColLabel,    setEditColLabel]    = useState('');
  const [editCellText,    setEditCellText]    = useState('');
  const [editCellTarget,  setEditCellTarget]  = useState<'tracks' | 'list'>('tracks');

  // Custom tag values: { [rowId]: { [colKey]: value } }
  const [customTrackVals, setCustomTrackVals] = useState<Record<string, Record<string, string>>>({});
  const [customListVals,  setCustomListVals]  = useState<Record<string, Record<string, string>>>({});

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCollection = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [recordsRes, tagsRes, recordTagsRes] = await Promise.all([
      supabase.from('records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('tags').select('*').eq('user_id', user.id),
      supabase.from('record_tags').select('record_id, tag_id'),
    ]);

    const tags           = tagsRes.data       ?? [];
    const recordTagLinks = recordTagsRes.data ?? [];
    setAllTags(tags);

    const recs = recordsRes.data ?? [];
    const enriched: RecordWithTags[] = recs.map(r => ({
      ...r,
      tagList: recordTagLinks
        .filter(rt => rt.record_id === r.id)
        .map(rt => tags.find(t => t.id === rt.tag_id))
        .filter(Boolean) as Tag[],
    }));
    setRecords(enriched);

    if (recs.length > 0) {
      const { data: tracksData } = await supabase
        .from('record_tracks').select('*')
        .in('record_id', recs.map(r => r.id)).order('title');

      if (tracksData) {
        const recordMap = Object.fromEntries(recs.map(r => [r.id, r]));
        const tagMap    = Object.fromEntries(recs.map(r => [
          r.id,
          recordTagLinks.filter(rt => rt.record_id === r.id)
            .map(rt => tags.find(t => t.id === rt.tag_id)?.name)
            .filter(Boolean).join(', '),
        ]));
        setTracks(tracksData.map(t => ({
          id: t.id, record_id: t.record_id, title: t.title,
          duration: t.duration ?? null, bpm: t.bpm ?? null, key: t.key ?? null,
          artist:   recordMap[t.record_id]?.artist ?? '',
          album:    recordMap[t.record_id]?.title  ?? '',
          genre:    recordMap[t.record_id]?.genre  ?? null,
          category: tagMap[t.record_id]            ?? '',
        })));
      }
    } else {
      setTracks([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchCollection(); }, [fetchCollection]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCollection();
    setRefreshing(false);
  }, [fetchCollection]);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filterOptions = useMemo<Record<FilterKey, Array<{ label: string; value: string }>>>(() => ({
    artist: [...new Set(records.map(r => r.artist))].sort().map(v => ({ label: v, value: v })),
    title:  [...new Set(records.map(r => r.title))].sort().map(v => ({ label: v, value: v })),
    genre:  [...new Set(records.map(r => r.genre).filter(Boolean) as string[])].sort().map(v => ({ label: v, value: v })),
    year:   [...new Set(records.map(r => r.year).filter(Boolean) as number[])].sort((a, b) => b - a).map(v => ({ label: String(v), value: String(v) })),
    tag:    allTags.map(t => ({ label: t.name, value: t.id })),
  }), [records, allTags]);

  const filteredRecords = useMemo(() => {
    let result = records.filter(r => {
      if (filters.artist && r.artist !== filters.artist) return false;
      if (filters.title  && r.title  !== filters.title)  return false;
      if (filters.genre  && r.genre  !== filters.genre)  return false;
      if (filters.year   && String(r.year) !== filters.year) return false;
      if (filters.tag    && !r.tagList.some(t => t.id === filters.tag)) return false;
      return true;
    });
    if (viewMode === 'table') {
      result = [...result].sort((a, b) => {
        const v = (r: RecordWithTags) =>
          sortColumn === 'tag' ? (r.tagList[0]?.name ?? '') : String((r as any)[sortColumn] ?? '');
        return sortDir === 'asc' ? v(a).localeCompare(v(b)) : v(b).localeCompare(v(a));
      });
    }
    return result;
  }, [records, filters, viewMode, sortColumn, sortDir]);

  const trackFilterOptions = useMemo<Record<TrackFilterKey, Array<{ label: string; value: string }>>>(() => ({
    artist:   [...new Set(tracks.map(t => t.artist).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
    album:    [...new Set(tracks.map(t => t.album).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
    genre:    [...new Set(tracks.map(t => t.genre).filter(Boolean) as string[])].sort().map(v => ({ label: v, value: v })),
    key:      [...new Set(tracks.map(t => t.key).filter(Boolean) as string[])].sort().map(v => ({ label: v, value: v })),
    category: [...new Set(tracks.map(t => t.category).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
  }), [tracks]);

  const filteredTracks = useMemo(() => {
    let result = tracks.filter(t => {
      if (trackFilters.artist   && t.artist   !== trackFilters.artist)   return false;
      if (trackFilters.album    && t.album    !== trackFilters.album)    return false;
      if (trackFilters.genre    && t.genre    !== trackFilters.genre)    return false;
      if (trackFilters.key      && t.key      !== trackFilters.key)      return false;
      if (trackFilters.category && !t.category.includes(trackFilters.category)) return false;
      return true;
    });
    return [...result].sort((a, b) => {
      if (trackSortCol === 'bpm') {
        const d = (a.bpm ?? 0) - (b.bpm ?? 0);
        return trackSortDir === 'asc' ? d : -d;
      }
      const av = getTrackCellValue(a, trackSortCol);
      const bv = getTrackCellValue(b, trackSortCol);
      return trackSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [tracks, trackFilters, trackSortCol, trackSortDir]);

  const visibleListCols  = listCols.filter(c => c.visible);
  const visibleTrackCols = trackCols.filter(c => c.visible);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function applyFilter(key: FilterKey, value: string | null) {
    setFilters(prev => ({ ...prev, [key]: value }));
    setOpenDropdown(null);
  }

  function applyTrackFilter(key: TrackFilterKey, value: string | null) {
    setTrackFilters(prev => ({ ...prev, [key]: value }));
    setTrackOpenDropdown(null);
  }

  function handleSort(col: string) {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  }

  function handleTrackSort(col: string) {
    if (trackSortCol === col) setTrackSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTrackSortCol(col); setTrackSortDir('asc'); }
  }

  // Column config: List view
  function moveListCol(i: number, dir: 'up' | 'down') {
    setListCols(prev => {
      const next = [...prev];
      const t = dir === 'up' ? i - 1 : i + 1;
      if (t < 0 || t >= next.length) return prev;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  }
  function toggleListColVisible(i: number) {
    setListCols(prev => prev.map((c, idx) => idx === i ? { ...c, visible: !c.visible } : c));
  }

  // Column config: Track / Songs view
  function moveTrackCol(i: number, dir: 'up' | 'down') {
    setTrackCols(prev => {
      const next = [...prev];
      const t = dir === 'up' ? i - 1 : i + 1;
      if (t < 0 || t >= next.length) return prev;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  }
  function toggleTrackColVisible(i: number) {
    setTrackCols(prev => prev.map((c, idx) => idx === i ? { ...c, visible: !c.visible } : c));
  }

  // ⋮ Menu: open the right modal based on which option the user tapped
  function handleMenuAdjustCols() {
    setMenuVisible(false);
    if (viewMode === 'table')  setListColModal(true);
    if (viewMode === 'tracks') setTrackColModal(true);
  }

  function handleMenuAddTag() {
    setMenuVisible(false);
    setNewTagName('');
    setAddTagVisible(true);
  }

  function confirmAddTag() {
    const name = newTagName.trim();
    if (!name) return;
    const newCol: Col = { key: `custom_${Date.now()}`, label: name, width: 130, visible: true };
    if (viewMode === 'table')  setListCols(prev => [...prev, newCol]);
    if (viewMode === 'tracks') setTrackCols(prev => [...prev, newCol]);
    setAddTagVisible(false);
  }

  // Edit a custom-column cell value
  function openEditCell(rowId: string, colKey: string, colLabel: string, currentVal: string, target: 'tracks' | 'list') {
    setEditRowId(rowId);
    setEditColKey(colKey);
    setEditColLabel(colLabel);
    setEditCellText(currentVal);
    setEditCellTarget(target);
    setEditCellVisible(true);
  }

  function confirmEditCell() {
    if (editCellTarget === 'tracks') {
      setCustomTrackVals(prev => ({
        ...prev,
        [editRowId]: { ...(prev[editRowId] ?? {}), [editColKey]: editCellText.trim() },
      }));
    } else {
      setCustomListVals(prev => ({
        ...prev,
        [editRowId]: { ...(prev[editRowId] ?? {}), [editColKey]: editCellText.trim() },
      }));
    }
    setEditCellVisible(false);
  }

  const activeFilterCount      = Object.values(filters).filter(Boolean).length;
  const activeTrackFilterCount = Object.values(trackFilters).filter(Boolean).length;

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#DFFF00" />
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vault</Text>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="images-outline" size={15} color={viewMode === 'grid' ? '#DFFF00' : '#555'} />
            <Text style={[styles.toggleLabel, viewMode === 'grid' && styles.toggleLabelActive]}>Art</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'table' && styles.toggleBtnActive]}
            onPress={() => setViewMode('table')}
          >
            <Ionicons name="list-outline" size={15} color={viewMode === 'table' ? '#DFFF00' : '#555'} />
            <Text style={[styles.toggleLabel, viewMode === 'table' && styles.toggleLabelActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'tracks' && styles.toggleBtnActive]}
            onPress={() => setViewMode('tracks')}
          >
            <Ionicons name="musical-notes-outline" size={15} color={viewMode === 'tracks' ? '#DFFF00' : '#555'} />
            <Text style={[styles.toggleLabel, viewMode === 'tracks' && styles.toggleLabelActive]}>Songs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filter bar (with ⋮ button for List + Songs) ──────────────────────── */}
      <View style={styles.filterBarRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBarScroll}
          contentContainerStyle={styles.filterBarContent}
        >
          {viewMode !== 'tracks' ? (
            /* Record filters */
            <>
              {(['artist', 'title', 'genre', 'year', 'tag'] as FilterKey[]).map(key => {
                const active = filters[key];
                const displayVal = active
                  ? (key === 'tag' ? (allTags.find(t => t.id === active)?.name ?? active) : active)
                  : null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => active ? applyFilter(key, null) : setOpenDropdown(key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                      {active ? `${FILTER_LABELS[key]}: ${displayVal} ✕` : `${FILTER_LABELS[key]} ▾`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.clearChip} onPress={() => setFilters(EMPTY_FILTERS)}>
                  <Text style={styles.clearChipText}>Clear all</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            /* Track filters */
            <>
              {(['artist', 'album', 'genre', 'key', 'category'] as TrackFilterKey[]).map(key => {
                const active = trackFilters[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => active ? applyTrackFilter(key, null) : setTrackOpenDropdown(key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                      {active ? `${TRACK_FILTER_LABELS[key]}: ${active} ✕` : `${TRACK_FILTER_LABELS[key]} ▾`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {activeTrackFilterCount > 0 && (
                <TouchableOpacity style={styles.clearChip} onPress={() => setTrackFilters(EMPTY_TRACK_FILTERS)}>
                  <Text style={styles.clearChipText}>Clear all</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>

        {/* ⋮ button — only shown in List and Songs views */}
        {(viewMode === 'table' || viewMode === 'tracks') && (
          <TouchableOpacity style={styles.menuDotBtn} onPress={() => setMenuVisible(true)}>
            <Ionicons name="ellipsis-vertical" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Count ───────────────────────────────────────────────────────────── */}
      <Text style={styles.countText}>
        {viewMode === 'tracks'
          ? filteredTracks.length === tracks.length
            ? `${tracks.length} song${tracks.length !== 1 ? 's' : ''}`
            : `${filteredTracks.length} of ${tracks.length} songs`
          : filteredRecords.length === records.length
            ? `${records.length} record${records.length !== 1 ? 's' : ''}`
            : `${filteredRecords.length} of ${records.length} records`
        }
      </Text>

      {/* ── Content ─────────────────────────────────────────────────────────── */}

      {records.length === 0 ? (

        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💿</Text>
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptySubtitle}>Tap Scan to add your first record</Text>
        </View>

      ) : viewMode === 'grid' ? (

        /* ── Art view ───────────────────────────────────────────────────── */
        <FlatList
          data={filteredRecords}
          keyExtractor={item => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.gridItem} onPress={() => router.push(`/record/${item.id}`)} activeOpacity={0.8}>
              {item.cover_image_url
                ? <Image source={{ uri: item.cover_image_url }} style={styles.gridImage} />
                : <View style={styles.gridImagePlaceholder}><Text style={styles.gridPlaceholderEmoji}>💿</Text></View>
              }
              <View style={styles.gridMeta}>
                <Text style={styles.gridTitle}  numberOfLines={1}>{item.title}</Text>
                <Text style={styles.gridArtist} numberOfLines={1}>{item.artist}</Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.gridList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DFFF00" />}
        />

      ) : viewMode === 'table' ? (

        /* ── List view ──────────────────────────────────────────────────── */
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DFFF00" />}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Header row */}
              <View style={styles.tableHeaderRow}>
                {visibleListCols.map(col => (
                  <TouchableOpacity
                    key={col.key}
                    style={[styles.tableHeaderCell, { width: col.width }]}
                    onPress={() => !col.key.startsWith('custom_') && handleSort(col.key)}
                  >
                    <Text style={styles.tableHeaderText}>
                      {col.label}{sortColumn === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Data rows — each cell is individually tappable */}
              {filteredRecords.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Text style={styles.tableEmptyText}>No records match the current filters.</Text>
                </View>
              ) : (
                filteredRecords.map((item, index) => (
                  <View key={item.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    {visibleListCols.map(col => {
                      const isCustom = col.key.startsWith('custom_');
                      const val = isCustom
                        ? (customListVals[item.id]?.[col.key] ?? '')
                        : getListCellValue(item, col.key);
                      return (
                        <TouchableOpacity
                          key={col.key}
                          style={{ width: col.width }}
                          onPress={() => isCustom
                            ? openEditCell(item.id, col.key, col.label, val, 'list')
                            : router.push(`/record/${item.id}`)
                          }
                        >
                          <Text
                            style={[
                              styles.tableCell,
                              { width: col.width },
                              isCustom && styles.tableCellCustom,
                              isCustom && !val && styles.tableCellCustomEmpty,
                            ]}
                            numberOfLines={1}
                          >
                            {isCustom ? (val || 'Tap to add…') : val}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </ScrollView>

      ) : (

        /* ── Songs view ─────────────────────────────────────────────────── */
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DFFF00" />}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Header row */}
              <View style={styles.tableHeaderRow}>
                {visibleTrackCols.map(col => (
                  <TouchableOpacity
                    key={col.key}
                    style={[styles.tableHeaderCell, { width: col.width }]}
                    onPress={() => !col.key.startsWith('custom_') && handleTrackSort(col.key)}
                  >
                    <Text style={styles.tableHeaderText}>
                      {col.label}{trackSortCol === col.key ? (trackSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Data rows */}
              {filteredTracks.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Text style={styles.tableEmptyText}>
                    {tracks.length === 0 ? 'No tracks yet — add records with tracklists.' : 'No songs match the current filters.'}
                  </Text>
                </View>
              ) : (
                filteredTracks.map((track, index) => (
                  <View key={track.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    {visibleTrackCols.map(col => {
                      const isCustom = col.key.startsWith('custom_');
                      const val = isCustom
                        ? (customTrackVals[track.id]?.[col.key] ?? '')
                        : getTrackCellValue(track, col.key);
                      return (
                        <TouchableOpacity
                          key={col.key}
                          style={{ width: col.width }}
                          onPress={() => isCustom
                            ? openEditCell(track.id, col.key, col.label, val, 'tracks')
                            : router.push(`/record/${track.record_id}`)
                          }
                        >
                          <Text
                            style={[
                              styles.tableCell,
                              { width: col.width },
                              col.key === 'key' && track.key  && styles.tableCellKey,
                              col.key === 'bpm' && track.bpm  && styles.tableCellBpm,
                              isCustom && styles.tableCellCustom,
                              isCustom && !val && styles.tableCellCustomEmpty,
                            ]}
                            numberOfLines={1}
                          >
                            {isCustom ? (val || 'Tap to add…') : val}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Modals
      ════════════════════════════════════════════════════════════════════ */}

      {/* ── ⋮ Dropdown menu ─────────────────────────────────────────────── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={styles.menuItem} onPress={handleMenuAdjustCols}>
              <Ionicons name="options-outline" size={18} color="#DFFF00" />
              <Text style={styles.menuItemText}>Adjust Columns</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleMenuAddTag}>
              <Ionicons name="pricetag-outline" size={18} color="#DFFF00" />
              <Text style={styles.menuItemText}>Add a custom tag</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add custom tag (name input) ──────────────────────────────────── */}
      <Modal visible={addTagVisible} transparent animationType="fade" onRequestClose={() => setAddTagVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAddTagVisible(false)}>
          <View style={styles.inputCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.inputCardTitle}>Add Custom Column</Text>
            <Text style={styles.inputCardHint}>
              Name your new column — you can fill in values for each {viewMode === 'tracks' ? 'song' : 'record'} after.
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Mood, Playlist, Notes…"
              placeholderTextColor="#555"
              value={newTagName}
              onChangeText={setNewTagName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmAddTag}
            />
            <View style={styles.inputCardActions}>
              <TouchableOpacity style={styles.inputCardCancel} onPress={() => setAddTagVisible(false)}>
                <Text style={styles.inputCardCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inputCardConfirm, !newTagName.trim() && styles.inputCardConfirmDisabled]}
                onPress={confirmAddTag}
                disabled={!newTagName.trim()}
              >
                <Text style={styles.inputCardConfirmText}>Add Column</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit custom cell value ───────────────────────────────────────── */}
      <Modal visible={editCellVisible} transparent animationType="fade" onRequestClose={() => setEditCellVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditCellVisible(false)}>
          <View style={styles.inputCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.inputCardTitle}>{editColLabel}</Text>
            <Text style={styles.inputCardHint}>Enter a custom tag for this {editCellTarget === 'tracks' ? 'song' : 'record'}.</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Type a value…"
              placeholderTextColor="#555"
              value={editCellText}
              onChangeText={setEditCellText}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmEditCell}
            />
            <View style={styles.inputCardActions}>
              <TouchableOpacity style={styles.inputCardCancel} onPress={() => setEditCellVisible(false)}>
                <Text style={styles.inputCardCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inputCardConfirm} onPress={confirmEditCell}>
                <Text style={styles.inputCardConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Record filter dropdown ───────────────────────────────────────── */}
      <Modal visible={openDropdown !== null} transparent animationType="fade" onRequestClose={() => setOpenDropdown(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOpenDropdown(null)}>
          <View style={styles.dropdown} onStartShouldSetResponder={() => true}>
            <Text style={styles.dropdownTitle}>{openDropdown ? FILTER_LABELS[openDropdown as FilterKey] : ''}</Text>
            <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator>
              <TouchableOpacity style={styles.dropdownOption} onPress={() => openDropdown && applyFilter(openDropdown as FilterKey, null)}>
                <Text style={styles.dropdownOptionAll}>All</Text>
              </TouchableOpacity>
              {openDropdown && filterOptions[openDropdown as FilterKey]?.map(opt => (
                <TouchableOpacity key={opt.value} style={styles.dropdownOption} onPress={() => applyFilter(openDropdown as FilterKey, opt.value)}>
                  <Text style={[styles.dropdownOptionText, filters[openDropdown as FilterKey] === opt.value && styles.dropdownOptionActive]}>
                    {opt.label}
                  </Text>
                  {filters[openDropdown as FilterKey] === opt.value && <Text style={styles.dropdownCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Track filter dropdown ────────────────────────────────────────── */}
      <Modal visible={trackOpenDropdown !== null} transparent animationType="fade" onRequestClose={() => setTrackOpenDropdown(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTrackOpenDropdown(null)}>
          <View style={styles.dropdown} onStartShouldSetResponder={() => true}>
            <Text style={styles.dropdownTitle}>{trackOpenDropdown ? TRACK_FILTER_LABELS[trackOpenDropdown] : ''}</Text>
            <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator>
              <TouchableOpacity style={styles.dropdownOption} onPress={() => trackOpenDropdown && applyTrackFilter(trackOpenDropdown, null)}>
                <Text style={styles.dropdownOptionAll}>All</Text>
              </TouchableOpacity>
              {trackOpenDropdown && trackFilterOptions[trackOpenDropdown]?.map(opt => (
                <TouchableOpacity key={opt.value} style={styles.dropdownOption} onPress={() => applyTrackFilter(trackOpenDropdown, opt.value)}>
                  <Text style={[styles.dropdownOptionText, trackFilters[trackOpenDropdown] === opt.value && styles.dropdownOptionActive]}>
                    {opt.label}
                  </Text>
                  {trackFilters[trackOpenDropdown] === opt.value && <Text style={styles.dropdownCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── List column config ───────────────────────────────────────────── */}
      <Modal visible={listColModal} transparent animationType="slide" onRequestClose={() => setListColModal(false)}>
        <View style={styles.colModalBackdrop}>
          <View style={styles.colModalSheet}>
            <View style={styles.colModalHeader}>
              <Text style={styles.colModalTitle}>List Columns</Text>
              <TouchableOpacity onPress={() => setListColModal(false)}>
                <Text style={styles.colModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.colModalHint}>Tap the eye to show/hide · arrows to reorder</Text>
            <ScrollView>
              {listCols.map((col, i) => (
                <View key={col.key} style={styles.colRow}>
                  <TouchableOpacity onPress={() => toggleListColVisible(i)} style={styles.colEye}>
                    <Ionicons name={col.visible ? 'eye-outline' : 'eye-off-outline'} size={20} color={col.visible ? '#DFFF00' : '#444'} />
                  </TouchableOpacity>
                  <Text style={[styles.colLabel, !col.visible && styles.colLabelHidden]}>{col.label}</Text>
                  <View style={styles.colArrows}>
                    <TouchableOpacity onPress={() => moveListCol(i, 'up')} disabled={i === 0} style={styles.colArrowBtn}>
                      <Ionicons name="chevron-up-outline" size={20} color={i === 0 ? '#333' : '#aaa'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveListCol(i, 'down')} disabled={i === listCols.length - 1} style={styles.colArrowBtn}>
                      <Ionicons name="chevron-down-outline" size={20} color={i === listCols.length - 1 ? '#333' : '#aaa'} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Track column config ──────────────────────────────────────────── */}
      <Modal visible={trackColModal} transparent animationType="slide" onRequestClose={() => setTrackColModal(false)}>
        <View style={styles.colModalBackdrop}>
          <View style={styles.colModalSheet}>
            <View style={styles.colModalHeader}>
              <Text style={styles.colModalTitle}>Song Columns</Text>
              <TouchableOpacity onPress={() => setTrackColModal(false)}>
                <Text style={styles.colModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.colModalHint}>Tap the eye to show/hide · arrows to reorder</Text>
            <ScrollView>
              {trackCols.map((col, i) => (
                <View key={col.key} style={styles.colRow}>
                  <TouchableOpacity onPress={() => toggleTrackColVisible(i)} style={styles.colEye}>
                    <Ionicons name={col.visible ? 'eye-outline' : 'eye-off-outline'} size={20} color={col.visible ? '#DFFF00' : '#444'} />
                  </TouchableOpacity>
                  <Text style={[styles.colLabel, !col.visible && styles.colLabelHidden]}>{col.label}</Text>
                  <View style={styles.colArrows}>
                    <TouchableOpacity onPress={() => moveTrackCol(i, 'up')} disabled={i === 0} style={styles.colArrowBtn}>
                      <Ionicons name="chevron-up-outline" size={20} color={i === 0 ? '#333' : '#aaa'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveTrackCol(i, 'down')} disabled={i === trackCols.length - 1} style={styles.colArrowBtn}>
                      <Ionicons name="chevron-down-outline" size={20} color={i === trackCols.length - 1 ? '#333' : '#aaa'} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D12' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D12' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#2A2A3A',
  },
  headerTitle:    { color: '#fff', fontSize: 20, fontWeight: '800' },
  viewToggle:     { flexDirection: 'row', gap: 4 },
  toggleBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A3A' },
  toggleBtnActive:{ borderColor: '#DFFF00' },
  toggleLabel:    { fontSize: 12, fontWeight: '600', color: '#555' },
  toggleLabelActive: { color: '#DFFF00' },

  // Filter bar row (chips + ⋮ button)
  filterBarRow:     { flexDirection: 'row', alignItems: 'center', height: 56, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  filterBarScroll:  { flex: 1 },
  filterBarContent: { paddingHorizontal: 12, gap: 8, flexDirection: 'row', alignItems: 'center', height: 56 },
  filterChip:       { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A3A', backgroundColor: '#1C1C24' },
  filterChipActive: { borderColor: '#DFFF00', backgroundColor: '#2a1020' },
  filterChipText:   { color: '#aaa', fontSize: 13 },
  filterChipTextActive: { color: '#DFFF00' },
  clearChip:        { paddingHorizontal: 12, paddingVertical: 6 },
  clearChipText:    { color: '#666', fontSize: 13, textDecorationLine: 'underline' },

  // ⋮ button
  menuDotBtn: {
    width: 44, height: 56, justifyContent: 'center', alignItems: 'center',
    borderLeftWidth: 1, borderLeftColor: '#2A2A3A',
  },

  // Count
  countText: { color: '#555', fontSize: 12, paddingHorizontal: 16, paddingVertical: 6 },

  // Empty
  empty:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon:     { fontSize: 64, marginBottom: 16 },
  emptyTitle:    { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: '#aaa', textAlign: 'center' },

  // Grid
  gridList:             { padding: 12, gap: 12 },
  gridItem:             { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1C1C24', borderWidth: 1, borderColor: '#2A2A3A' },
  gridImage:            { width: '100%', aspectRatio: 1 },
  gridImagePlaceholder: { width: '100%', aspectRatio: 1, backgroundColor: '#2A2A3A', justifyContent: 'center', alignItems: 'center' },
  gridPlaceholderEmoji: { fontSize: 48 },
  gridMeta:   { padding: 8 },
  gridTitle:  { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  gridArtist: { color: '#aaa', fontSize: 12 },

  // Table
  tableHeaderRow:  { flexDirection: 'row', backgroundColor: '#2A2A3A', borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  tableHeaderCell: { paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  tableHeaderText: { color: '#DFFF00', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  tableRowAlt:     { backgroundColor: '#1C1C24' },
  tableCell:       { color: '#ccc', fontSize: 13, paddingHorizontal: 12, paddingVertical: 12 },
  tableCellKey:    { color: '#7FFFD4', fontWeight: '700' },
  tableCellBpm:    { color: '#DFFF00', fontWeight: '600' },
  tableCellCustom: { color: '#aaa', fontStyle: 'italic' },
  tableCellCustomEmpty: { color: '#444' },
  tableEmpty:      { padding: 32, alignItems: 'center' },
  tableEmptyText:  { color: '#555', fontSize: 14 },

  // ⋮ Dropdown menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuCard: {
    position: 'absolute', top: 128, right: 8,
    backgroundColor: '#1C1C24', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A3A',
    minWidth: 210, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
  },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  menuItemText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  menuDivider:  { height: 1, backgroundColor: '#2A2A3A' },

  // Shared modal overlay
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Input card (add tag + edit cell)
  inputCard: {
    backgroundColor: '#1C1C24', borderRadius: 20, borderWidth: 1, borderColor: '#2A2A3A',
    width: '100%', padding: 24,
  },
  inputCardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  inputCardHint:  { color: '#666', fontSize: 13, marginBottom: 16 },
  textInput: {
    backgroundColor: '#0D0D12', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A',
    color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 20,
  },
  inputCardActions:       { flexDirection: 'row', gap: 10 },
  inputCardCancel:        { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center' },
  inputCardCancelText:    { color: '#aaa', fontSize: 15, fontWeight: '600' },
  inputCardConfirm:       { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DFFF00', alignItems: 'center' },
  inputCardConfirmDisabled: { opacity: 0.35 },
  inputCardConfirmText:   { color: '#0D0D12', fontSize: 15, fontWeight: '700' },

  // Filter dropdown
  dropdown:         { backgroundColor: '#1C1C24', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A3A', width: '100%', maxHeight: 400, overflow: 'hidden' },
  dropdownTitle:    { color: '#fff', fontSize: 16, fontWeight: '700', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  dropdownScroll:   { maxHeight: 320 },
  dropdownOption:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  dropdownOptionAll:   { color: '#aaa', fontSize: 15 },
  dropdownOptionText:  { color: '#fff', fontSize: 15 },
  dropdownOptionActive:{ color: '#DFFF00', fontWeight: '600' },
  dropdownCheck:       { color: '#DFFF00', fontSize: 16 },

  // Column config modal (shared by List + Songs)
  colModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  colModalSheet: {
    backgroundColor: '#1C1C24', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, maxHeight: '80%',
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#2A2A3A',
  },
  colModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 6 },
  colModalTitle:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  colModalDone:    { color: '#DFFF00', fontSize: 16, fontWeight: '600' },
  colModalHint:    { color: '#555', fontSize: 12, paddingHorizontal: 20, paddingBottom: 10 },
  colRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  colEye:          { marginRight: 14 },
  colLabel:        { flex: 1, color: '#fff', fontSize: 16 },
  colLabelHidden:  { color: '#444' },
  colArrows:       { flexDirection: 'row', gap: 4 },
  colArrowBtn:     { padding: 6 },
});
