# Decibel Archive

[![CI](https://github.com/c-larson/vinylvault/actions/workflows/ci.yml/badge.svg)](https://github.com/c-larson/vinylvault/actions/workflows/ci.yml)

A mobile-first vinyl record collection app built with React Native and Expo. Catalog your records by taking a photo or searching by name, track condition and estimated market value using Discogs pricing data, and view full tracklists with BPM data for every track.

Built as a capstone project for the Quantic School of Business and Technology MSSE program.

---

## Project Links

| Resource | Link |
|---|---|
| 📋 Agile task board (GitHub Projects) | https://github.com/users/c-larson/projects/1 |
| 📱 Install the app (Android APK) | [Releases → v1.0.0](https://github.com/c-larson/vinylvault/releases/tag/v1.0.0) |
| 🎥 Demo / presentation video | _add link_ |

> **Capstone reviewers / TODO:** replace the placeholders above with the Trello board URL, an EAS build (or Expo) install link, and the recorded demo. These are required Capstone submission components.

---

## Features

- **Photo-based cataloging** — Take a photo of any album cover or spine; Google Gemini 2.5 Flash Vision identifies the artist and album title and returns structured JSON, which is passed to the Discogs database for a match
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
| Cover Recognition | Google Gemini 2.5 Flash Vision API |
| BPM Data | Deezer API (free, no key required) |
| Language | TypeScript |
| Testing | Jest (`jest-expo` preset) |
| CI | GitHub Actions (type check, lint, tests) |

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
| `EXPO_PUBLIC_GEMINI_API_KEY` | aistudio.google.com/app/apikey |

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

## Testing

Automated tests run with **Jest** (the `jest-expo` preset):

```bash
npm test            # run the suite once
npm run test:watch  # watch mode
```

Coverage focuses on the pure logic extracted from the UI so it can be tested without a device:

- **`lib/cells.ts`** — table-cell formatting (`getTrackCellValue`, `getListCellValue`): null/placeholder handling, BPM-of-zero rendering, short-date formatting, and tag joining.
- **`lib/discogs.ts`** — `getArtistName`: Discogs artist parsing, including stripping `(n)` disambiguation suffixes and joining multiple artists.

Every push and pull request runs the full quality gate in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): **type check → lint → tests**.

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
│   ├── gemini.ts        # Gemini Vision API client (photo → artist/album JSON)
│   ├── deezer.ts        # Deezer BPM client (stubbed — CORS issues on mobile)
│   ├── getsongbpm.ts    # Stubbed (Cloudflare blocks mobile requests)
│   └── cells.ts         # Pure table-cell formatting helpers (unit-tested)
├── __tests__/           # Jest unit tests (cells, discogs)
└── types/
    └── database.ts      # Supabase type definitions (typed client)
```

---

## API Notes

**Discogs** — Powers catalog search, release metadata (tracklist, label, format, pressing info), and condition-based market pricing. Authenticated with consumer key/secret for read-only access. Rate limit: 60 req/min.

**Google Gemini 2.5 Flash Vision** — Used in the camera scan flow to identify the artist name and album title from photos of album covers and spines. Unlike traditional OCR, Gemini returns structured JSON (`{ artist, album }`) directly, eliminating a text-parsing step and improving accuracy on stylised or foreign-language covers. Accessed via the Gemini API (Google AI Studio). `thinkingBudget` is set to 0 for low-latency extraction.

**Deezer** — Free API, no key required. Used to look up BPM for each track in a release's tracklist. Returns 0 for tracks with unknown BPM; those fall back to manual user entry.

---

## Acknowledgements

BPM data provided by [GetSongBPM](https://getsongbpm.com)

---

## License

MIT
