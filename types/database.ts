// Auto-generated types matching the Supabase schema

export type GoldmineCondition =
  | 'M'   // Mint
  | 'NM'  // Near Mint
  | 'VG+' // Very Good Plus
  | 'VG'  // Very Good
  | 'G+'  // Good Plus
  | 'G'   // Good
  | 'F'   // Fair
  | 'P';  // Poor

export type MediaFormat =
  | 'LP'
  | '7"'
  | '10"'
  | '12"'
  | 'EP'
  | '45'
  | '78'
  | 'Other';

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type VinylRecord = {
  id: string;
  user_id: string;
  // Core metadata
  title: string;
  artist: string;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  format: MediaFormat | null;
  genre: string | null;
  styles: string[] | null;
  country: string | null;
  notes: string | null;
  // Cover image
  cover_image_url: string | null;
  // Condition & pricing
  media_condition: GoldmineCondition | null;
  sleeve_condition: GoldmineCondition | null;
  purchase_price: number | null;
  purchase_date: string | null;
  discogs_lowest_price: number | null;
  discogs_median_price: number | null;
  condition_adjusted_value: number | null;
  // External IDs
  discogs_id: string | null;
  musicbrainz_id: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export type RecordTrack = {
  id: string;
  record_id: string;
  position: string;
  title: string;
  duration: string | null;
  bpm: number | null;
  key: string | null;
  energy: number | null;
}

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export type RecordTag = {
  record_id: string;
  tag_id: string;
}

export type CollectionStats = {
  user_id: string;
  total_records: number;
  total_value: number;
  top_genre: string | null;
  most_common_format: string | null;
}

export type Playlist = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export type PlaylistTrack = {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number;
  cue_notes: string | null;
  added_at: string;
}

// Custom column definitions per user (persisted)
export type CustomColumn = {
  id: string;
  user_id: string;
  target: 'tracks' | 'list'; // which view this column belongs to
  key: string;               // e.g. "custom_1715000000000"
  label: string;
  width: number;
  position: number;          // display order among custom columns
  created_at: string;
}

// Custom cell values per row per column (persisted)
export type CustomValue = {
  id: string;
  user_id: string;
  column_key: string;       // matches CustomColumn.key
  row_id: string;           // record_track.id or record.id
  value: string;
  updated_at: string;
}

// Insert helper: columns whose type includes `null` have DB defaults, so they're
// optional on insert. `AutoKeys` (id, timestamps) are DB-generated and omitted.
type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];
type InsertRow<T, AutoKeys extends keyof T = never> =
  Omit<T, AutoKeys | NullableKeys<T>> & Partial<Pick<T, Exclude<NullableKeys<T>, AutoKeys>>>;

// Supabase database shape (for typed client).
// NOTE: Each table/view must include `Relationships: []` and the schema must
// include `Views` and `Functions` — otherwise the type fails Supabase's
// GenericSchema constraint and every query result silently degrades to `never`.
// Also: Row types MUST be `type` aliases, not `interface`s — interfaces are not
// assignable to `Record<string, unknown>`, which also collapses queries to `never`.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: InsertRow<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      records: {
        Row: VinylRecord;
        Insert: InsertRow<VinylRecord, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<VinylRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      record_tracks: {
        Row: RecordTrack;
        Insert: InsertRow<RecordTrack, 'id'>;
        Update: Partial<Omit<RecordTrack, 'id' | 'record_id'>>;
        Relationships: [];
      };
      tags: {
        Row: Tag;
        Insert: InsertRow<Tag, 'id' | 'created_at'>;
        Update: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      record_tags: {
        Row: RecordTag;
        Insert: RecordTag;
        Update: never;
        Relationships: [];
      };
      playlists: {
        Row: Playlist;
        Insert: InsertRow<Playlist, 'id' | 'created_at'>;
        Update: Partial<Omit<Playlist, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      playlist_tracks: {
        Row: PlaylistTrack;
        Insert: InsertRow<PlaylistTrack, 'id' | 'added_at'>;
        Update: Partial<Omit<PlaylistTrack, 'id' | 'playlist_id' | 'track_id'>>;
        Relationships: [];
      };
      custom_columns: {
        Row: CustomColumn;
        Insert: InsertRow<CustomColumn, 'id' | 'created_at'>;
        Update: Partial<Omit<CustomColumn, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      custom_values: {
        Row: CustomValue;
        Insert: InsertRow<CustomValue, 'id'>;
        Update: Partial<Omit<CustomValue, 'id' | 'user_id'>>;
        Relationships: [];
      };
    };
    Views: {
      collection_stats: {
        Row: CollectionStats;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
