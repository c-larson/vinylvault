// Pure helpers for rendering table-cell values in the collection screen.
// Extracted from the screen component so they can be unit-tested in isolation
// (no React Native imports here).

import type { VinylRecord, Tag } from '@/types/database';

// A record row enriched with its tag list (used in the collection list view).
export interface RecordWithTags extends VinylRecord {
  tagList: Tag[];
}

// A flattened track row used in the "songs" table view.
export interface TrackRow {
  id:        string;
  record_id: string;
  title:     string;
  duration:  string | null;
  bpm:       number | null;
  key:       string | null;
  artist:    string;
  album:     string;
  genre:     string | null;
  sets:      string;   // comma-separated names of Sets this track belongs to
}

const EMPTY = '—';

// Returns the display string for a given column in the track (songs) table.
export function getTrackCellValue(t: TrackRow, colKey: string): string {
  switch (colKey) {
    case 'title':    return t.title;
    case 'artist':   return t.artist;
    case 'album':    return t.album;
    case 'genre':    return t.genre    ?? EMPTY;
    case 'bpm':      return t.bpm != null ? String(t.bpm) : EMPTY;
    case 'key':      return t.key      ?? EMPTY;
    case 'sets':     return t.sets     || EMPTY;
    case 'duration': return t.duration ?? EMPTY;
    default:         return EMPTY;
  }
}

// Returns the display string for a given column in the collection list table.
export function getListCellValue(r: RecordWithTags, colKey: string): string {
  switch (colKey) {
    case 'artist':     return r.artist;
    case 'title':      return r.title;
    case 'genre':      return r.genre ?? EMPTY;
    case 'label':      return r.label ?? EMPTY;
    case 'year':       return r.year != null ? String(r.year) : EMPTY;
    case 'created_at': return new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    case 'tag':        return r.tagList.length > 0 ? r.tagList.map(t => t.name).join(', ') : EMPTY;
    default:           return EMPTY;
  }
}
