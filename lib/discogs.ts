// Discogs API client — uses Consumer Key/Secret for read-only public access
// Full OAuth is only needed for write operations (which we don't need yet)

const DISCOGS_BASE = 'https://api.discogs.com';
const KEY = process.env.EXPO_PUBLIC_DISCOGS_CONSUMER_KEY!;
const SECRET = process.env.EXPO_PUBLIC_DISCOGS_CONSUMER_SECRET!;

const AUTH_HEADER = `Discogs key=${KEY}, secret=${SECRET}`;
const USER_AGENT = 'DecibelArchive/1.0 (https://github.com/c-larson/vinylvault)';

async function discogsGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${DISCOGS_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: AUTH_HEADER,
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscogsSearchResult {
  id: number;
  type: 'release' | 'master' | 'artist' | 'label';
  title: string;
  year?: string;
  country?: string;
  label?: string[];
  catno?: string;
  format?: string[];
  genre?: string[];
  style?: string[];
  thumb: string;
  cover_image: string;
  resource_url: string;
}

export interface DiscogsRelease {
  id: number;
  title: string;
  artists: Array<{ name: string; id: number }>;
  year: number;
  country: string;
  labels: Array<{ name: string; catno: string }>;
  formats: Array<{ name: string; qty: string; descriptions?: string[] }>;
  genres: string[];
  styles: string[];
  tracklist: Array<{
    position: string;
    title: string;
    duration: string;
  }>;
  images: Array<{ type: string; uri: string; uri150: string }>;
  community: {
    have: number;
    want: number;
    rating: { count: number; average: number };
  };
  lowest_price: number | null;
}

export interface DiscogsPriceSuggestions {
  'Mint (M)'?: { value: number; currency: string };
  'Near Mint (NM or M-)'?: { value: number; currency: string };
  'Very Good Plus (VG+)'?: { value: number; currency: string };
  'Very Good (VG)'?: { value: number; currency: string };
  'Good Plus (G+)'?: { value: number; currency: string };
  'Good (G)'?: { value: number; currency: string };
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchDiscogs(
  query: string,
  options?: { type?: 'release' | 'master'; per_page?: number }
): Promise<DiscogsSearchResult[]> {
  const data = await discogsGet<{ results: DiscogsSearchResult[] }>('/database/search', {
    q: query,
    type: options?.type ?? 'release',
    per_page: String(options?.per_page ?? 10),
  });
  return data.results ?? [];
}

// ─── Release lookup ───────────────────────────────────────────────────────────

export async function getRelease(releaseId: number): Promise<DiscogsRelease> {
  return discogsGet<DiscogsRelease>(`/releases/${releaseId}`);
}

// ─── Price suggestions (by condition) ────────────────────────────────────────

export async function getPriceSuggestions(releaseId: number): Promise<DiscogsPriceSuggestions> {
  return discogsGet<DiscogsPriceSuggestions>(`/marketplace/price_suggestions/${releaseId}`);
}

// ─── Artist lookup ────────────────────────────────────────────────────────────

export async function getArtistReleases(
  artistId: number,
  page = 1
): Promise<{ releases: DiscogsSearchResult[]; pages: number }> {
  const data = await discogsGet<{
    releases: DiscogsSearchResult[];
    pagination: { pages: number };
  }>(`/artists/${artistId}/releases`, { page: String(page), per_page: '25' });
  return { releases: data.releases, pages: data.pagination.pages };
}

// ─── Helper: artist name from a release ──────────────────────────────────────

export function getArtistName(release: DiscogsRelease): string {
  return release.artists
    .map((a) => a.name.replace(/\s*\(\d+\)$/, '')) // strip "(2)" disambiguation
    .join(', ');
}
