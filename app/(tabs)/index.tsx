import { useState, useCallback, useMemo, useRef } from 'react';
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
  PanResponder,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import type { Tag } from '@/types/database';
import { getTrackCellValue, getListCellValue, type TrackRow, type RecordWithTags } from '@/lib/cells';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode      = 'grid' | 'table' | 'tracks' | 'playlists';
type SortDir       = 'asc' | 'desc';
type FilterKey     = 'artist' | 'title' | 'genre' | 'year';
type TrackFilterKey = 'artist' | 'album' | 'genre' | 'key' | 'sets';

interface Col {
  key:     string;
  label:   string;
  width:   number;
  visible: boolean;
}

interface PlaylistCard {
  id: string;
  name: string;
  trackCount: number;
}

interface FilterState {
  artist: string | null;
  title:  string | null;
  genre:  string | null;
  year:   string | null;
}

interface TrackFilterState {
  artist: string | null;
  album:  string | null;
  genre:  string | null;
  key:    string | null;
  sets:   string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIST_COLS: Col[] = [
  { key: 'artist',     label: 'Artist',     width: 140, visible: true },
  { key: 'title',      label: 'Album',      width: 160, visible: true },
  { key: 'genre',      label: 'Genre',      width: 100, visible: true },
  { key: 'label',      label: 'Label',      width: 120, visible: true },
  { key: 'year',       label: 'Released',   width: 80,  visible: true },
  { key: 'created_at', label: 'Date Added', width: 110, visible: true },
];

const DEFAULT_TRACK_COLS: Col[] = [
  { key: 'title',    label: 'Song',     width: 180, visible: true  },
  { key: 'artist',   label: 'Artist',   width: 140, visible: true  },
  { key: 'album',    label: 'Album',    width: 140, visible: true  },
  { key: 'genre',    label: 'Genre',    width: 100, visible: true  },
  { key: 'bpm',      label: 'BPM',      width: 72,  visible: true  },
  { key: 'key',      label: 'Key',      width: 72,  visible: true  },
  { key: 'sets',     label: 'Sets',     width: 200, visible: true  },
  { key: 'duration', label: 'Duration', width: 90,  visible: false },
];

const FILTER_LABELS: Record<FilterKey, string> = {
  artist: 'Artist', title: 'Album', genre: 'Genre', year: 'Year',
};

const TRACK_FILTER_LABELS: Record<TrackFilterKey, string> = {
  artist: 'Artist', album: 'Album', genre: 'Genre', key: 'Key', sets: 'Sets',
};

const EMPTY_FILTERS: FilterState            = { artist: null, title: null, genre: null, year: null };
const EMPTY_TRACK_FILTERS: TrackFilterState = { artist: null, album: null, genre: null, key: null, sets: null };

const MODAL_ROW_HEIGHT = 56;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const router = useRouter();

  // Records + tracks
  const [records,    setRecords]    = useState<RecordWithTags[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tracks,     setTracks]     = useState<TrackRow[]>([]);

  // Playlists
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);

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

  // Column drag state (modal drag-to-reorder)
  const [listDragFrom,  setListDragFrom]  = useState<number | null>(null);
  const [listDragTo,    setListDragTo]    = useState<number | null>(null);
  const [trackDragFrom, setTrackDragFrom] = useState<number | null>(null);
  const [trackDragTo,   setTrackDragTo]   = useState<number | null>(null);

  // Refs so stale pan-responder closures can see the latest cols
  const listColsRef  = useRef(listCols);
  listColsRef.current  = listCols;
  const trackColsRef = useRef(trackCols);
  trackColsRef.current = trackCols;

  // Track filters / sort
  const [trackFilters,      setTrackFilters]      = useState<TrackFilterState>(EMPTY_TRACK_FILTERS);
  const [trackOpenDropdown, setTrackOpenDropdown] = useState<TrackFilterKey | null>(null);
  const [trackSortCol,      setTrackSortCol]      = useState('title');
  const [trackSortDir,      setTrackSortDir]      = useState<SortDir>('asc');


  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCollection = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [recordsRes, tagsRes, recordTagsRes, playlistsRes] = await Promise.all([
      supabase.from('records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('tags').select('*').eq('user_id', user.id),
      supabase.from('record_tags').select('record_id, tag_id'),
      supabase.from('playlists').select('id, name').eq('user_id', user.id).order('created_at'),
    ]);

    const tags           = tagsRes.data       ?? [];
    const recordTagLinks = recordTagsRes.data ?? [];

    const recs = recordsRes.data ?? [];
    const enriched: RecordWithTags[] = recs.map(r => ({
      ...r,
      tagList: recordTagLinks
        .filter(rt => rt.record_id === r.id)
        .map(rt => tags.find(t => t.id === rt.tag_id))
        .filter(Boolean) as Tag[],
    }));
    setRecords(enriched);

    // Playlists — fetch playlist_tracks for counts AND to build track→sets map
    const rawPlaylists = playlistsRes.data ?? [];
    const trackSetsMap: Record<string, string[]> = {};
    if (rawPlaylists.length > 0) {
      const { data: ptData } = await supabase
        .from('playlist_tracks')
        .select('playlist_id, track_id')
        .in('playlist_id', rawPlaylists.map(p => p.id));
      const countMap: Record<string, number> = {};
      (ptData ?? []).forEach(pt => {
        countMap[pt.playlist_id] = (countMap[pt.playlist_id] ?? 0) + 1;
        const name = rawPlaylists.find(p => p.id === pt.playlist_id)?.name ?? '';
        if (name) {
          if (!trackSetsMap[pt.track_id]) trackSetsMap[pt.track_id] = [];
          if (!trackSetsMap[pt.track_id].includes(name)) trackSetsMap[pt.track_id].push(name);
        }
      });
      setPlaylists(rawPlaylists.map(p => ({ id: p.id, name: p.name, trackCount: countMap[p.id] ?? 0 })));
    } else {
      setPlaylists([]);
    }

    if (recs.length > 0) {
      const { data: tracksData } = await supabase
        .from('record_tracks').select('*')
        .in('record_id', recs.map(r => r.id)).order('title');

      if (tracksData) {
        const recordMap = Object.fromEntries(recs.map(r => [r.id, r]));
        setTracks(tracksData.map(t => ({
          id: t.id, record_id: t.record_id, title: t.title,
          duration: t.duration ?? null, bpm: t.bpm ?? null, key: t.key ?? null,
          artist: recordMap[t.record_id]?.artist ?? '',
          album:  recordMap[t.record_id]?.title  ?? '',
          genre:  recordMap[t.record_id]?.genre  ?? null,
          sets:   (trackSetsMap[t.id] ?? []).join(', '),
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
  }), [records]);

  const filteredRecords = useMemo(() => {
    let result = records.filter(r => {
      if (filters.artist && r.artist !== filters.artist) return false;
      if (filters.title  && r.title  !== filters.title)  return false;
      if (filters.genre  && r.genre  !== filters.genre)  return false;
      if (filters.year   && String(r.year) !== filters.year) return false;
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
    artist: [...new Set(tracks.map(t => t.artist).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
    album:  [...new Set(tracks.map(t => t.album).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
    genre:  [...new Set(tracks.map(t => t.genre).filter(Boolean) as string[])].sort().map(v => ({ label: v, value: v })),
    key:    [...new Set(tracks.map(t => t.key).filter(Boolean) as string[])].sort().map(v => ({ label: v, value: v })),
    sets:   [...new Set(tracks.flatMap(t => t.sets ? t.sets.split(', ') : []).filter(Boolean))].sort().map(v => ({ label: v, value: v })),
  }), [tracks]);

  const filteredTracks = useMemo(() => {
    let result = tracks.filter(t => {
      if (trackFilters.artist && t.artist !== trackFilters.artist) return false;
      if (trackFilters.album  && t.album  !== trackFilters.album)  return false;
      if (trackFilters.genre  && t.genre  !== trackFilters.genre)  return false;
      if (trackFilters.key    && t.key    !== trackFilters.key)    return false;
      if (trackFilters.sets   && !t.sets.split(', ').includes(trackFilters.sets)) return false;
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

  // Reordered col arrays to show drag preview in modals
  const displayListCols = useMemo(() => {
    if (listDragFrom === null || listDragTo === null || listDragFrom === listDragTo) return listCols;
    const arr = [...listCols];
    const [moved] = arr.splice(listDragFrom, 1);
    arr.splice(listDragTo, 0, moved);
    return arr;
  }, [listCols, listDragFrom, listDragTo]);

  const displayTrackCols = useMemo(() => {
    if (trackDragFrom === null || trackDragTo === null || trackDragFrom === trackDragTo) return trackCols;
    const arr = [...trackCols];
    const [moved] = arr.splice(trackDragFrom, 1);
    arr.splice(trackDragTo, 0, moved);
    return arr;
  }, [trackCols, trackDragFrom, trackDragTo]);

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

  function handleAdjustCols() {
    if (viewMode === 'table')  setListColModal(true);
    if (viewMode === 'tracks') setTrackColModal(true);
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
    <SafeAreaView style={styles.container} edges={['top']}>

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
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'playlists' && styles.toggleBtnActive]}
            onPress={() => setViewMode('playlists')}
          >
            <Ionicons name="bookmark-outline" size={15} color={viewMode === 'playlists' ? '#DFFF00' : '#555'} />
            <Text style={[styles.toggleLabel, viewMode === 'playlists' && styles.toggleLabelActive]}>Sets</Text>
          </TouchableOpacity>
        </View>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.headerLogo}
        />
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
              {(['artist', 'title', 'genre', 'year'] as FilterKey[]).map(key => {
                const active = filters[key];
                const displayVal = active ? active : null;
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
              {(['artist', 'album', 'genre', 'key', 'sets'] as TrackFilterKey[]).map(key => {
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

        {/* Adjust Columns button — only shown in List and Songs views */}
        {(viewMode === 'table' || viewMode === 'tracks') && (
          <TouchableOpacity style={styles.menuDotBtn} onPress={handleAdjustCols}>
            <Ionicons name="options-outline" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Count ───────────────────────────────────────────────────────────── */}
      <Text style={styles.countText}>
        {viewMode === 'playlists'
          ? `${playlists.length} set${playlists.length !== 1 ? 's' : ''}`
          : viewMode === 'tracks'
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
          key="art-view"
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

      ) : viewMode === 'playlists' ? (

        /* ── Playlists view ─────────────────────────────────────────────── */
        playlists.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎵</Text>
            <Text style={styles.emptyTitle}>No sets yet</Text>
            <Text style={styles.emptySubtitle}>Tap + Set on any track to start one</Text>
          </View>
        ) : (
          <FlatList
            key="playlist-view"
            data={playlists}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.playlistCard}
                onPress={() => router.push(`/playlist/${item.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={styles.playlistCardIcon}>
                  <Ionicons name="bookmark" size={22} color="#DFFF00" />
                </View>
                <View style={styles.playlistCardInfo}>
                  <Text style={styles.playlistCardName}>{item.name}</Text>
                  <Text style={styles.playlistCardCount}>{item.trackCount} track{item.trackCount !== 1 ? 's' : ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.playlistList}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DFFF00" />}
          />
        )

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
                    onPress={() => handleSort(col.key)}
                  >
                    <Text style={styles.tableHeaderText}>
                      {col.label}{sortColumn === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Data rows */}
              {filteredRecords.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Text style={styles.tableEmptyText}>No records match the current filters.</Text>
                </View>
              ) : (
                filteredRecords.map((item, index) => (
                  <View key={item.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    {visibleListCols.map(col => (
                      <TouchableOpacity
                        key={col.key}
                        style={{ width: col.width }}
                        onPress={() => router.push(`/record/${item.id}`)}
                      >
                        <Text style={[styles.tableCell, { width: col.width }]} numberOfLines={1}>
                          {getListCellValue(item, col.key)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </ScrollView>

      ) : viewMode === 'tracks' ? (

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
                    onPress={() => handleTrackSort(col.key)}
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
                    {visibleTrackCols.map(col => (
                      <TouchableOpacity
                        key={col.key}
                        style={{ width: col.width }}
                        onPress={() => router.push(`/record/${track.record_id}`)}
                      >
                        <Text
                          style={[
                            styles.tableCell,
                            { width: col.width },
                            col.key === 'key'  && !!track.key  && styles.tableCellKey,
                            col.key === 'bpm'  && !!track.bpm  && styles.tableCellBpm,
                            col.key === 'sets' && !!track.sets && styles.tableCellSets,
                          ]}
                          numberOfLines={1}
                        >
                          {getTrackCellValue(track, col.key)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </ScrollView>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════════
          Modals
      ════════════════════════════════════════════════════════════════════ */}

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
      <Modal visible={listColModal} transparent animationType="slide" onRequestClose={() => { setListColModal(false); setListDragFrom(null); setListDragTo(null); }}>
        <View style={styles.colModalBackdrop}>
          <View style={styles.colModalSheet}>
            <View style={styles.colModalHeader}>
              <Text style={styles.colModalTitle}>List Columns</Text>
              <TouchableOpacity onPress={() => { setListColModal(false); setListDragFrom(null); setListDragTo(null); }}>
                <Text style={styles.colModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.colModalHint}>Drag ≡ to reorder</Text>
            <ScrollView scrollEnabled={listDragFrom === null}>
              {displayListCols.map((col, displayIdx) => {
                const isDragging = listDragFrom !== null && displayListCols[listDragFrom === listDragTo ? listDragFrom : listDragTo ?? listDragFrom]?.key === col.key;
                const pan = PanResponder.create({
                  onStartShouldSetPanResponderCapture: () => true,
                  onMoveShouldSetPanResponder: () => true,
                  onPanResponderGrant: () => {
                    setListDragFrom(displayIdx);
                    setListDragTo(displayIdx);
                  },
                  onPanResponderMove: (_, gs) => {
                    const newTo = Math.min(
                      Math.max(0, Math.round(displayIdx + gs.dy / MODAL_ROW_HEIGHT)),
                      listColsRef.current.length - 1,
                    );
                    setListDragTo(newTo);
                  },
                  onPanResponderRelease: (_, gs) => {
                    const finalTo = Math.min(
                      Math.max(0, Math.round(displayIdx + gs.dy / MODAL_ROW_HEIGHT)),
                      listColsRef.current.length - 1,
                    );
                    if (finalTo !== displayIdx) {
                      const arr = [...listColsRef.current];
                      const [moved] = arr.splice(displayIdx, 1);
                      arr.splice(finalTo, 0, moved);
                      setListCols(arr);
                    }
                    setListDragFrom(null);
                    setListDragTo(null);
                  },
                });
                return (
                  <View
                    key={col.key}
                    style={[styles.colRow, isDragging && styles.colRowDragging]}
                  >
                    <View {...pan.panHandlers} style={styles.colDragHandle}>
                      <Ionicons name="menu-outline" size={22} color="#888" />
                    </View>
                    <Text style={styles.colLabel}>{col.label}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Track column config ──────────────────────────────────────────── */}
      <Modal visible={trackColModal} transparent animationType="slide" onRequestClose={() => { setTrackColModal(false); setTrackDragFrom(null); setTrackDragTo(null); }}>
        <View style={styles.colModalBackdrop}>
          <View style={styles.colModalSheet}>
            <View style={styles.colModalHeader}>
              <Text style={styles.colModalTitle}>Song Columns</Text>
              <TouchableOpacity onPress={() => { setTrackColModal(false); setTrackDragFrom(null); setTrackDragTo(null); }}>
                <Text style={styles.colModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.colModalHint}>Drag ≡ to reorder</Text>
            <ScrollView scrollEnabled={trackDragFrom === null}>
              {displayTrackCols.map((col, displayIdx) => {
                const isDragging = trackDragFrom !== null && displayTrackCols[trackDragFrom === trackDragTo ? trackDragFrom : trackDragTo ?? trackDragFrom]?.key === col.key;
                const pan = PanResponder.create({
                  onStartShouldSetPanResponderCapture: () => true,
                  onMoveShouldSetPanResponder: () => true,
                  onPanResponderGrant: () => {
                    setTrackDragFrom(displayIdx);
                    setTrackDragTo(displayIdx);
                  },
                  onPanResponderMove: (_, gs) => {
                    const newTo = Math.min(
                      Math.max(0, Math.round(displayIdx + gs.dy / MODAL_ROW_HEIGHT)),
                      trackColsRef.current.length - 1,
                    );
                    setTrackDragTo(newTo);
                  },
                  onPanResponderRelease: (_, gs) => {
                    const finalTo = Math.min(
                      Math.max(0, Math.round(displayIdx + gs.dy / MODAL_ROW_HEIGHT)),
                      trackColsRef.current.length - 1,
                    );
                    if (finalTo !== displayIdx) {
                      const arr = [...trackColsRef.current];
                      const [moved] = arr.splice(displayIdx, 1);
                      arr.splice(finalTo, 0, moved);
                      setTrackCols(arr);
                    }
                    setTrackDragFrom(null);
                    setTrackDragTo(null);
                  },
                });
                return (
                  <View
                    key={col.key}
                    style={[styles.colRow, isDragging && styles.colRowDragging]}
                  >
                    <View {...pan.panHandlers} style={styles.colDragHandle}>
                      <Ionicons name="menu-outline" size={22} color="#888" />
                    </View>
                    <Text style={styles.colLabel}>{col.label}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
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
  headerLogo:     { width: 32, height: 32, borderRadius: 6, marginLeft: 10 },
  viewToggle:     { flexDirection: 'row', gap: 4 },
  toggleBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A3A' },
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

  // Adjust Columns button
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
  tableCellKey:  { color: '#7FFFD4', fontWeight: '700' },
  tableCellBpm:  { color: '#DFFF00', fontWeight: '600' },
  tableCellSets: { color: '#B39DDB', fontWeight: '500' },
  tableEmpty:      { padding: 32, alignItems: 'center' },
  tableEmptyText:  { color: '#555', fontSize: 14 },

  // Shared modal overlay
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Filter dropdown
  dropdown:         { backgroundColor: '#1C1C24', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A3A', width: '100%', maxHeight: 400, overflow: 'hidden' },
  dropdownTitle:    { color: '#fff', fontSize: 16, fontWeight: '700', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  dropdownScroll:   { maxHeight: 320 },
  dropdownOption:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  dropdownOptionAll:   { color: '#aaa', fontSize: 15 },
  dropdownOptionText:  { color: '#fff', fontSize: 15 },
  dropdownOptionActive:{ color: '#DFFF00', fontWeight: '600' },
  dropdownCheck:       { color: '#DFFF00', fontSize: 16 },

  // Playlist cards
  playlistList:      { padding: 12 },
  playlistCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C24', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2A2A3A' },
  playlistCardIcon:  { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0D0D12', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#2A2A3A' },
  playlistCardInfo:  { flex: 1 },
  playlistCardName:  { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  playlistCardCount: { color: '#666', fontSize: 13 },

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
  colRowDragging:  { backgroundColor: '#1a1a2e', opacity: 0.85 },
  colLabel:        { flex: 1, color: '#fff', fontSize: 16 },
  colDragHandle:   { paddingHorizontal: 8, paddingVertical: 4, marginRight: 12 },
});
