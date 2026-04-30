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

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Record {
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

export interface RecordTrack {
  id: string;
  record_id: string;
  position: string;
  title: string;
  duration: string | null;
  bpm: number | null;
  key: string | null;
  energy: number | null;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface RecordTag {
  record_id: string;
  tag_id: string;
}

export interface CollectionStats {
  user_id: string;
  total_records: number;
  total_value: number;
  top_genre: string | null;
  most_common_format: string | null;
}

// Supabase database shape (for typed client)
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      records: {
        Row: Record;
        Insert: Omit<Record, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Record, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
      };
      record_tracks: {
        Row: RecordTrack;
        Insert: Omit<RecordTrack, 'id'>;
        Update: Partial<Omit<RecordTrack, 'id' | 'record_id'>>;
      };
      tags: {
        Row: Tag;
        Insert: Omit<Tag, 'id' | 'created_at'>;
        Update: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at'>>;
      };
      record_tags: {
        Row: RecordTag;
        Insert: RecordTag;
        Update: never;
      };
    };
    Views: {
      collection_stats: {
        Row: CollectionStats;
      };
    };
  };
}
