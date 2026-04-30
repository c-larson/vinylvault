import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { lookupBpmDeezer } from '@/lib/deezer';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Helper: get current user ID (throws if not logged in)
export async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

// Helper: save tracks for a record (with optional BPM auto-lookup)
export async function saveTracks(
  recordId: string,
  tracklist: Array<{ position: string; title: string; duration: string }>,
  artistName?: string
): Promise<void> {
  if (!tracklist?.length) return;

  // Look up BPM for all tracks sequentially to avoid rate limiting
  const bpmResults: (number | null)[] = [];
  for (const track of tracklist) {
    const bpm = artistName ? await lookupBpmDeezer(track.title, artistName) : null;
    bpmResults.push(bpm);
  }

  const rows = tracklist.map((t, i) => ({
    record_id: recordId,
    position: t.position,
    title: t.title,
    duration: t.duration || null,
    bpm: bpmResults[i] ?? null,
  }));

  const { error } = await supabase.from('record_tracks').insert(rows);
  if (error) console.error('Failed to save tracks:', error.message);
}
