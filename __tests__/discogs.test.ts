import { getArtistName } from '@/lib/discogs';

// getArtistName only reads `.artists`; build minimal release objects for the test.
type Release = Parameters<typeof getArtistName>[0];
const release = (names: string[]): Release =>
  ({ artists: names.map((name) => ({ name })) }) as unknown as Release;

describe('getArtistName', () => {
  it('returns a single artist name unchanged', () => {
    expect(getArtistName(release(['Radiohead']))).toBe('Radiohead');
  });

  it('strips Discogs "(n)" disambiguation suffixes', () => {
    expect(getArtistName(release(['Nirvana (2)']))).toBe('Nirvana');
    expect(getArtistName(release(['Eagles (3)']))).toBe('Eagles');
  });

  it('joins multiple artists with a comma, stripping suffixes', () => {
    expect(getArtistName(release(['Simon (5)', 'Garfunkel']))).toBe('Simon, Garfunkel');
  });

  it('leaves parenthetical text that is not a disambiguation number', () => {
    expect(getArtistName(release(['Sigur Rós (band)']))).toBe('Sigur Rós (band)');
  });
});
