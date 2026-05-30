import {
  getTrackCellValue,
  getListCellValue,
  type TrackRow,
  type RecordWithTags,
} from '@/lib/cells';

const DASH = '—';

function makeTrack(overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    id: 't1',
    record_id: 'r1',
    title: 'Song A',
    duration: '3:45',
    bpm: 120,
    key: 'Am',
    artist: 'Artist A',
    album: 'Album A',
    genre: 'Rock',
    sets: '',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RecordWithTags> = {}): RecordWithTags {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Album A',
    artist: 'Artist A',
    year: 1969,
    label: 'Apple',
    catalog_number: null,
    format: 'LP',
    genre: 'Rock',
    styles: null,
    country: null,
    notes: null,
    cover_image_url: null,
    media_condition: null,
    sleeve_condition: null,
    purchase_price: null,
    purchase_date: null,
    discogs_lowest_price: null,
    discogs_median_price: null,
    condition_adjusted_value: null,
    discogs_id: null,
    musicbrainz_id: null,
    created_at: '2023-06-15T12:00:00',
    updated_at: '2023-06-15T12:00:00',
    tagList: [],
    ...overrides,
  };
}

describe('getTrackCellValue', () => {
  it('returns plain string columns directly', () => {
    const t = makeTrack({ title: 'Hey Jude', artist: 'The Beatles', album: 'Single' });
    expect(getTrackCellValue(t, 'title')).toBe('Hey Jude');
    expect(getTrackCellValue(t, 'artist')).toBe('The Beatles');
    expect(getTrackCellValue(t, 'album')).toBe('Single');
  });

  // Regression: a BPM of 0 must render as "0", not the em-dash placeholder.
  it('renders a BPM of 0 as "0"', () => {
    expect(getTrackCellValue(makeTrack({ bpm: 0 }), 'bpm')).toBe('0');
  });

  it('renders a non-zero BPM as its string form', () => {
    expect(getTrackCellValue(makeTrack({ bpm: 128 }), 'bpm')).toBe('128');
  });

  it('shows the placeholder for a null BPM', () => {
    expect(getTrackCellValue(makeTrack({ bpm: null }), 'bpm')).toBe(DASH);
  });

  it('shows the placeholder for null genre, key, and duration', () => {
    const t = makeTrack({ genre: null, key: null, duration: null });
    expect(getTrackCellValue(t, 'genre')).toBe(DASH);
    expect(getTrackCellValue(t, 'key')).toBe(DASH);
    expect(getTrackCellValue(t, 'duration')).toBe(DASH);
  });

  it('shows the placeholder for an empty "sets" value', () => {
    expect(getTrackCellValue(makeTrack({ sets: '' }), 'sets')).toBe(DASH);
    expect(getTrackCellValue(makeTrack({ sets: 'Warmup, Peak' }), 'sets')).toBe('Warmup, Peak');
  });

  it('returns the placeholder for an unknown column', () => {
    expect(getTrackCellValue(makeTrack(), 'does-not-exist')).toBe(DASH);
  });
});

describe('getListCellValue', () => {
  it('returns artist and title directly', () => {
    const r = makeRecord({ artist: 'Pink Floyd', title: 'Meddle' });
    expect(getListCellValue(r, 'artist')).toBe('Pink Floyd');
    expect(getListCellValue(r, 'title')).toBe('Meddle');
  });

  it('renders year as a string, or the placeholder when null', () => {
    expect(getListCellValue(makeRecord({ year: 1971 }), 'year')).toBe('1971');
    expect(getListCellValue(makeRecord({ year: null }), 'year')).toBe(DASH);
  });

  it('shows the placeholder for null genre and label', () => {
    const r = makeRecord({ genre: null, label: null });
    expect(getListCellValue(r, 'genre')).toBe(DASH);
    expect(getListCellValue(r, 'label')).toBe(DASH);
  });

  it('formats created_at as a short US date', () => {
    const r = makeRecord({ created_at: '2023-06-15T12:00:00' });
    expect(getListCellValue(r, 'created_at')).toBe('Jun 15, 23');
  });

  it('joins tag names, or shows the placeholder when there are none', () => {
    expect(getListCellValue(makeRecord({ tagList: [] }), 'tag')).toBe(DASH);
    const tagged = makeRecord({
      tagList: [
        { id: '1', user_id: 'u1', name: 'Favorites', color: null, created_at: '2023-01-01' },
        { id: '2', user_id: 'u1', name: 'Jazz', color: null, created_at: '2023-01-01' },
      ],
    });
    expect(getListCellValue(tagged, 'tag')).toBe('Favorites, Jazz');
  });

  it('returns the placeholder for an unknown column', () => {
    expect(getListCellValue(makeRecord(), 'does-not-exist')).toBe(DASH);
  });
});
