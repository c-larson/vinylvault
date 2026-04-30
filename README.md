# VinylVault

A mobile-first vinyl record collection app built with React Native and Expo. Catalog your records by taking a photo or searching by name, track condition and estimated market value using Discogs pricing data, and view full tracklists with BPM data for every track.

Built as a capstone project for the Quantic School of Business and Technology MSSE program.

---

## Features

- **Photo-based cataloging** — Take a photo of any album cover or spine; Google Cloud Vision OCR extracts the artist and title, then searches the Discogs database for a match
- **Manual search** — Search the full Discogs catalog by artist or album name and add releases with one tap
- **Collection browsing** — Scrollable grid of album art with sort/filter controls
- **Record detail view** — Full metadata: artist, label, year, format, genre, catalog number, condition grade, and estimated market value by condition (Goldmine Standard)
- **Tracklist with BPM** — Full tracklist pulled from Discogs; BPM auto-populated via Deezer API with manual entry fallback
- **Condition grading** — Goldmine Standard grades (M → P) with color-coded badges and condition-adjusted price estimates from Discogs marketplace data
- **Authentication** — Email/password sign-up and login via Supabase Auth; each user's collection is private and secured with Row Level Security

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Navigation | Expo Router v6 (file-based) |
| Backend / Auth | Supabase (Postgres + Auth + RLS) |
| Record Catalog | Discogs API |
| Cover Recognition | Google Cloud Vision API (OCR) |
| BPM Data | Deezer API (free, no key required) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo Go app on your iOS or Android device (or Xcode for iOS simulator)

### Installation

```bash
git clone https://github.com/c-larson/vinylvault.git
cd vinylvault
npm install
```

### Environment Variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
| `EXPO_PUBLIC_DISCOGS_CONSUMER_KEY` | discogs.com/settings/developers |
| `EXPO_PUBLIC_DISCOGS_CONSUMER_SECRET` | discogs.com/settings/developers |
| `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` | console.cloud.google.com |

### Database Setup

Run the schema SQL in your Supabase project's SQL editor:

```bash
# In Supabase Dashboard → SQL Editor, run:
supabase_schema.sql
```

### Running the App

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator.

---

## Project Structure

```
vinylvault/
├── app/
│   ├── (auth)/          # Login and signup screens
│   ├── (tabs)/          # Main tab screens (collection, search, scan, profile)
│   └── record/[id].tsx  # Record detail screen
├── components/
│   ├── RecordCard.tsx   # Album art card for collection grid
│   └── ConditionBadge.tsx
├── lib/
│   ├── supabase.ts      # Supabase client + saveTracks helper
│   ├── discogs.ts       # Discogs API client (search, release, pricing)
│   ├── deezer.ts        # Deezer API client (BPM lookup)
│   └── getsongbpm.ts    # Stubbed (Cloudflare blocks mobile requests)
└── types/
    └── database.ts      # Generated Supabase type definitions
```

---

## API Notes

**Discogs** — Powers catalog search, release metadata (tracklist, label, format, pressing info), and condition-based market pricing. Authenticated with consumer key/secret for read-only access. Rate limit: 60 req/min.

**Google Cloud Vision** — Used in the camera scan flow to extract text (artist name, album title) from photos of album covers and spines. The extracted text is then passed to Discogs search.

**Deezer** — Free API, no key required. Used to look up BPM for each track in a release's tracklist. Returns 0 for tracks with unknown BPM; those fall back to manual user entry.

---

## Acknowledgements

BPM data provided by [GetSongBPM](https://getsongbpm.com)

---

## License

MIT
