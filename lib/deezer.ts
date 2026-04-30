// Deezer API client — free, no API key required
// https://developers.deezer.com/api

const BASE_URL = 'https://api.deezer.com';

interface DeezerTrack {
  id: number;
  title: string;
  bpm: number; // 0 if unknown
  duration: number;
  artist: { name: string };
  album: { title: string };
}

interface DeezerSearchResponse {
  data: DeezerTrack[];
  total: number;
  error?: { type: string; message: string; code: number };
}

/**
 * Look up BPM for a track via Deezer's free API.
 * Returns the BPM as a number, or null if not found / unavailable.
 */
export async function lookupBpmDeezer(
  trackTitle: string,
  artistName: string
): Promise<number | null> {
  try {
    // Search with artist + track for best match
    const query = encodeURIComponent(`artist:"${artistName}" track:"${trackTitle}"`);
    const url = `${BASE_URL}/search?q=${query}&limit=5`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`Deezer search failed: ${res.status}`);
      return null;
    }

    const data: DeezerSearchResponse = await res.json();

    if (data.error || !data.data?.length) {
      // Try a looser search if exact match fails
      const looseQuery = encodeURIComponent(`${artistName} ${trackTitle}`);
      const looseRes = await fetch(`${BASE_URL}/search?q=${looseQuery}&limit=5`);
      if (!looseRes.ok) return null;
      const looseData: DeezerSearchResponse = await looseRes.json();
      if (!looseData.data?.length) return null;
      data.data = looseData.data;
    }

    // Find best match — prefer tracks where title and artist both match
    const lowerTitle = trackTitle.toLowerCase();
    const lowerArtist = artistName.toLowerCase().split(' ')[0]; // first word e.g. "Michael"

    const best = data.data.find(
      (t) =>
        t.title.toLowerCase().includes(lowerTitle) &&
        t.artist.name.toLowerCase().includes(lowerArtist)
    ) ?? data.data[0];

    // Deezer returns 0 for unknown BPM
    if (!best.bpm || best.bpm === 0) return null;

    return Math.round(best.bpm);
  } catch (e) {
    console.warn('Deezer BPM lookup error:', e);
    return null;
  }
}
