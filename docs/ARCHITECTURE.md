# Architecture — StorePulse

## System Overview

StorePulse is a **server-side rendered (Next.js)** retail location intelligence platform.
Data flows from Google Places API → Python pipeline → Supabase PostgreSQL → Next.js API routes → Browser (Mapbox GL JS).

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION                           │
│                                                                 │
│  Google Places API ──► scripts/fetch/fetch_places.py           │
│                              │                                  │
│              3×3 grid per district × N categories              │
│                              │                                  │
│                    Supabase upsert (google_place_id key)        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                       SUPABASE (PostgreSQL + PostGIS)           │
│                                                                 │
│  places          — 5K+ stores, lat/lng/category/status/reviews  │
│  categories      — 14 types with display names and groups       │
│  districts       — 31 districts (12 Taipei + 19 Singapore)      │
│  zone_density    — MAT VIEW: density per district × category    │
│  dead_zone_clusters — MAT VIEW: closure hotspot clusters        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     NEXT.JS API ROUTES                          │
│                                                                 │
│  /api/places        spatial bbox + optional Google refresh      │
│  /api/hawker-rank   ordered by review_count DESC                │
│  /api/mrt-malls     Haversine distance from MRT lat/lng         │
│  /api/pitch-stats   live counts for investor deck               │
│  /api/categories    category list                               │
│  /api/stats         district aggregates                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     BROWSER (Next.js pages)                     │
│                                                                 │
│  /map           Mapbox GL heatmap + category filter + signals   │
│  /discover      Hawker rankings + MRT mall finder               │
│  /time-machine  Year-by-year opening/closure Mapbox replay      │
│  /pitch         VC snapshot with live animated stats            │
│  /intro         B2B landing page (Singapore focus)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | Next.js | 14 | SSR, routing, API routes |
| Language | TypeScript | 5 | Type safety across all code |
| Styling | Tailwind CSS | 3 | Utility-first CSS |
| Map rendering | Mapbox GL JS | 3 | Heatmaps, circle layers, flyTo |
| Database | Supabase (PostgreSQL + PostGIS) | — | Spatial queries, materialized views |
| DB client | supabase-js | 2 | Type-safe queries |
| Auth | Supabase Auth | — | Admin email gate |
| Data scraping | Python 3.9 | — | Google Places pipeline |
| HTTP client (scripts) | requests | — | Google Places API calls |

---

## Page Architecture

### `/map` — Interactive Heatmap

Key state:
- `selectedCategory: string` — drives which places load
- `city: 'taipei' | 'singapore'` — drives map center + district list
- `allPlacesRef` — ref (not state) to avoid re-render on load
- `visiblePlaces` — state, recalculated on map move via bbox filter

Layer lifecycle:
1. Category selected → `loadCategory()` fires
2. Fetch `/api/places?lat=&lng=&radius=&query=<category>`
3. Store all places in `allPlacesRef`
4. On map move: filter `allPlacesRef` by current bbox → `setVisiblePlaces`
5. Mapbox source updated with GeoJSON FeatureCollection
6. Two layers: heatmap (min zoom 0, opacity fades at zoom 14) + circles (min zoom 12)

### `/discover` — Hawker Rankings + MRT Malls

Two independent tabs, each with their own fetch:
- Hawker tab: `GET /api/hawker-rank?district=&limit=` on district change
- Malls tab: `GET /api/mrt-malls?lat=&lng=&radius=` on MRT station or radius change
- Consulting insight card generated client-side from mall count rules

### `/time-machine`

Loads all places with `founded_year` and `closed_year`, renders per-year snapshots.
No server-side computation — all filtering is client-side for smooth year scrubbing.

---

## Data Model

### `places` (core table)

```sql
id               uuid PRIMARY KEY
google_place_id  text UNIQUE          -- dedup key
name             text NOT NULL
address          text
district         text                 -- denormalized slug e.g. 'Tanjong_Pagar'
lat / lng        double precision
location         geometry(Point,4326) -- PostGIS, spatially indexed
category         text                 -- slug e.g. 'hawker', 'cafe'
category_id      uuid → categories.id
status           text DEFAULT 'active' -- 'active' | 'closed' | 'relocated'
founded_date     date
closed_date      date
rating           real                 -- 1.0–5.0
review_count     integer
google_data      jsonb                -- raw Places API payload
```

### Category Groups

| group | categories |
|---|---|
| `f_and_b` | cafe, restaurant, bakery, beverage_store, hawker |
| `retail` | convenience_store, grocery, supermarket, shopping_mall |
| `health` | pharmacy |
| `services` | gym, coworking, childcare, laundromat |

---

## Adding a New Feature — Checklist

### New Store Category
- [ ] SQL insert into `categories`
- [ ] Add to `CATEGORY_MAP` in `scripts/fetch/fetch_places.py`
- [ ] Add color to `CATEGORY_COLORS` in `pages/map.tsx`
- [ ] Add signal entry to `SIGNAL_INTEL` in `pages/map.tsx`
- [ ] Seed: `python3 scripts/fetch/fetch_places.py --city singapore --category "..."`

### New API Route
- [ ] Create `pages/api/[name].ts`
- [ ] Use `supabase` from `@/lib/supabaseClient`
- [ ] Add `Cache-Control` header
- [ ] Handle GET only (`if (req.method !== 'GET') return res.status(405).end()`)
- [ ] Return `{ results: data ?? [] }` or `{ error: msg }`

### New Page
- [ ] Create `pages/[name].tsx` with `<Navbar />`
- [ ] Dark theme: `bg-gray-950 text-white`
- [ ] Add `<Head>` with title/description
- [ ] Add link in `components/Navbar.tsx`
- [ ] Document in [API_REFERENCE.md](API_REFERENCE.md) if it has a backing API

### New City
- [ ] Add districts to `SINGAPORE_DISTRICTS`-style dict in `scripts/fetch/fetch_places.py`
- [ ] Add district seed rows to `db/init_all.sql`
- [ ] Add city config to `CITY_CONFIG` in `pages/map.tsx`
- [ ] Seed all categories for that city

---

## Performance Notes

- **Heatmap opacity** interpolates to 0 at zoom 15 — circles take over, heatmap invisible
- **Bounding box filter** is client-side after initial load — avoids re-fetching on pan
- **Materialized views** (`zone_density`, `dead_zone_clusters`) must be manually refreshed after bulk inserts:
  ```sql
  REFRESH MATERIALIZED VIEW public.zone_density;
  REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
  ```
- **API cache headers** set `s-maxage=300` — Vercel edge caches responses for 5 min
- **Admin-only Google refresh** — public users always get cached Supabase data, never live Google calls
