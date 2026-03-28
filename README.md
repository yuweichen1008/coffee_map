# Taipei Business Map

Location intelligence for business owners. Visualize where stores are thriving, where businesses have failed, and where the next opportunity lies — across any category in Taipei.

## What It Does

- **Spot opportunities:** See which districts are undersaturated for a given store type before committing to a lease.
- **Avoid dead zones:** Areas with a high concentration of closed businesses are flagged with ☠ markers and a dark heatmap — a graveyard signal to avoid.
- **Track growth over time:** The Time Machine replays how any category expanded across Taipei year by year, with warm/cold color encoding for saturated vs. growing zones.
- **Understand the competitive landscape:** Switch between cafes, convenience stores, restaurants, bakeries, and more — same map, same tools.
- **Pan to discover:** The store list updates in real time as you move the map — no search needed.

## Key Features

| Feature | Description |
|---|---|
| **Interactive Map** | Supabase-backed map with viewport-driven store list |
| **Heatmap** | Cold-blue = established zones · Warm-red = recent growth |
| **Dead Zones** | ☠ skull markers + dark heatmap for permanently-closed businesses |
| **Time Machine** | Year slider replays store openings and closures; dynamic range per category |
| **Multi-category** | Tabs for cafe, convenience store, restaurant, bakery, beverage store, and more |
| **Angel Zone** *(planned)* | Opportunity scoring: high foot-traffic × low competition × low failure rate |
| **Admin CMS** | Force-sync from Google, inline edit/delete, research-on-demand button |
| **User Reports** | Community contributions with gamification points |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 13](https://nextjs.org/) + TypeScript |
| Database | [Supabase](https://supabase.io/) (PostgreSQL + PostGIS) |
| Map | [Mapbox GL JS](https://www.mapbox.com/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Data source | Google Places API + Taiwan Government Open Data |
| Scripting | Python 3 (3-stage ingestion pipeline) |

## Architecture

```
Google Places API                  data.gov.tw (Taiwan Gov)
       │                                    │
       ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│  Python ingestion pipeline (scripts/)               │
│                                                     │
│  Stage 1: seed_taipei_all_districts.py              │
│    · 3×3 grid search per district (covers borders)  │
│    · Captures CLOSED_PERMANENTLY → dead zones       │
│                                                     │
│  Stage 2: update_founded_dates.py                   │
│    · Backfills founded_date via oldest review       │
│                                                     │
│  Stage 3: fetch_closed_businesses.py                │
│    · Re-checks active places for new closures       │
│    · Reconciles 廢止日期 from gov CSV (verified)    │
└─────────────────────────────────────────────────────┘
       │
       ▼
Supabase (PostgreSQL + PostGIS)
  places · categories · districts
  zone_density (materialized view)       ← active store density
  dead_zone_clusters (materialized view) ← closure-rate per grid cell
       │
       ▼
Next.js API routes (pages/api/)
  /api/supabase/places  – category fetch, include_closed flag
  /api/places           – spatial search + admin Google sync
  /api/categories       – live category list from DB
       │
       ▼
Mapbox GL JS
  Home page  – viewport-driven list, hover highlight, heatmap
  Time Machine – year slider, warm/cold layers, dead zone ☠ overlay
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://app.supabase.com) project (free tier works)
- A [Mapbox](https://account.mapbox.com) account (free tier works)
- A [Google Maps Platform](https://console.cloud.google.com) project with Places API enabled

### Environment Variables

Create `.env.local` in the project root:

```text
# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token

# Google Maps — unrestricted key for server scripts; browser key for client
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_google_key
GOOGLE_MAPS_API_KEY=your_server_google_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # never commit this

# Admin
NEXT_PUBLIC_ADMIN_EMAIL=your-admin-email@example.com
```

### Database Setup

1. Open your Supabase project → **SQL Editor**
2. Paste `db/init_all.sql` and run — creates all tables, indexes, materialized views, and seed categories
3. Verify with: `SELECT COUNT(*) FROM public.categories;` (should return 6)

### Run Locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Data Pipeline

### Stage 1 — Scrape Google Places (active + dead stores)

```bash
cd scripts
pip install googlemaps supabase-py python-dotenv

# All categories, 3×3 grid per district, includes permanently-closed stores
python seed_taipei_all_districts.py --category "coffee shop"
python seed_taipei_all_districts.py --category "convenience store"
python seed_taipei_all_districts.py --category "restaurant"
# etc.

# Dry run to preview without writing:
python seed_taipei_all_districts.py --dry-run
```

**What it does:**
- Divides each of the 12 Taipei districts into a **3×3 grid** of overlapping search cells — covers district borders and large districts (Neihu, Beitou, Wenshan) that a single-center search misses
- Maps Google's `business_status` field: `CLOSED_PERMANENTLY` → `status='closed'` + `closed_date=today`
- Upserts on `google_place_id` — safe to re-run

### Stage 2 — Backfill founding dates

```bash
python update_founded_dates.py [--limit 200] [--dry-run]
```

For every place with `founded_date IS NULL`, calls the Places Details API and uses the oldest review timestamp as a proxy for opening date. Sets `founded_date_confidence='estimated'`.

### Stage 3 — Enrich dead-zone data

```bash
pip install rapidfuzz

# Google-only: re-check all active places for new closures
python fetch_closed_businesses.py --source google --limit 500

# Government CSV reconciliation (most accurate closed_date):
# 1. Download from https://data.gov.tw/dataset/6038 (Taipei commercial)
#    or           https://data.gov.tw/dataset/6464 (national company)
# 2. Filter to 臺北市 rows, save as taipei_biz.csv
python fetch_closed_businesses.py --source gov --gov-csv taipei_biz.csv

# Both sources (recommended for production):
python fetch_closed_businesses.py --source all --gov-csv taipei_biz.csv --dry-run
```

**Reconciliation logic:**
- **Google Details API**: detects `CLOSED_PERMANENTLY`; uses last-review timestamp as `closed_date` proxy
- **Government CSV**: matches records by fuzzy name similarity (rapidfuzz ≥ 70) — handles English ↔ Chinese (many chains embed their English name in the Chinese record, e.g. `路易莎咖啡 LOUISA COFFEE`)
- Where a government match is found, `closed_date` is overwritten with the legal `廢止日期` and `founded_date_confidence` is set to `'verified'`

**Refresh materialized views after Stage 3:**
```sql
REFRESH MATERIALIZED VIEW public.zone_density;
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

## Database Schema

### `places`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `google_place_id` | text | Unique Google Place ID |
| `name` | text | Store name |
| `address` | text | Street address |
| `district` | text | Taipei district (denormalized) |
| `lat` / `lng` | float | GPS coordinates |
| `location` | geometry(Point, 4326) | PostGIS point — spatially indexed |
| `category` | text | Category slug |
| `status` | text | `active` \| `closed` \| `relocated` |
| `founded_date` | date | Estimated opening date |
| `founded_date_confidence` | text | `estimated` \| `verified` \| `unknown` |
| `closed_date` | date | Legal or estimated closure date |
| `rating` | real | Google rating 1.0–5.0 |
| `review_count` | integer | Number of Google reviews |
| `google_data` | jsonb | Raw Google Places payload |

**Indexes:** GIST on `location` · `(category, district)` · `founded_date` · `(status, closed_date)`

### `zone_density` (materialized view)

~200 m grid cells with store counts, avg rating, and date range per active category. Powers the home-page heatmap without a full table scan.

### `dead_zone_clusters` (materialized view)

~200 m grid cells ranked by `closure_rate` (closed ÷ total) and `closed_count`. A cell with `closure_rate > 0.3` and `closed_count ≥ 3` is a meaningful "avoid this block" signal.

| Column | Description |
|---|---|
| `category` | Store type slug |
| `district` | Taipei district |
| `grid_cell` | PostGIS ~200 m cell centroid |
| `closed_count` | Number of closed stores in this cell |
| `total_count` | All stores ever (active + closed) |
| `closure_rate` | `closed_count / total_count` |
| `earliest_closure` | Oldest recorded `closed_date` |
| `latest_closure` | Most recent `closed_date` |

### `categories`

| Column | Description |
|---|---|
| `name` | Slug (`cafe`, `convenience_store`, …) |
| `display_name` | UI label (`Coffee Shop`) |
| `group_name` | `f_and_b` \| `retail` \| `services` |

Seeded with 6 categories. `/api/categories` derives live categories from the `places` table as a fallback, so new categories added via the pipeline appear automatically.

## Map Pages

### Home (`/`)

- Loads all places for the selected category from Supabase (Supabase-only, no auto Google calls)
- List updates as you **pan the map** — shows only stores in the current viewport
- **Hover** a list item → highlight pin on map + popup; click → fly to location
- **Research this area** button (admin only, shown when DB has < 30 stores) → fetches from Google and saves to DB

### Time Machine (`/time-machine`)

- Year slider range is **dynamic** — 10th percentile of `founded_year` to max, recalculated per category
- **Cold-blue heatmap** = established/saturated zones (high existing competition)
- **Warm-red heatmap** = recent growth (stores opened in last 3 years)
- **Dead zone toggle (⚠️)** — when ON, shows:
  - Dark maroon heatmap for areas with high business failure density
  - ☠ skull markers on individual permanently-closed stores
  - Popup shows `⚠️ Closed YYYY` with founding year
- **Pop ring + dot** — stores that opened exactly in the selected year get a glowing aura
- **Histogram** — bars above the slider colored cold→hot by year position; click any bar to jump to that year

## Angel Zone — Planned Feature

> **Concept:** Predict low-risk, high-potential locations for new stores by cross-referencing multiple signals.

### Why convenience stores are the anchor signal

Convenience store chains (7-Eleven, FamilyMart, Hi-Life) place stores using professional foot-traffic algorithms. A neighborhood dense with convenience stores reliably indicates **high pedestrian activity**. When a target category (say, café) has low density in that same neighborhood, it represents an underserved but active market.

### Scoring model (planned)

Each ~200 m grid cell gets a score:

```
angel_score =
    (convenience_store_density  × 0.35)   # foot traffic proxy
  + (active_store_growth_rate   × 0.25)   # rising neighborhood
  - (dead_zone_closure_rate     × 0.40)   # structural failure signal
  - (target_category_saturation × 0.20)   # competition penalty
```

Cells in the top quartile of `angel_score` where `closure_rate < 0.15` are highlighted as **Angel Zones**.

### Implementation steps

1. **DB**: Add `angel_zones` materialized view joining `zone_density`, `dead_zone_clusters`, and convenience-store density
   ```sql
   CREATE MATERIALIZED VIEW public.angel_zones AS
   SELECT
     category,
     district,
     grid_cell,
     -- foot traffic proxy: convenience store count in same cell
     (SELECT store_count FROM zone_density z2
      WHERE z2.grid_cell = z.grid_cell
        AND z2.category = 'convenience_store') AS cvs_density,
     store_count AS target_density,
     COALESCE(dc.closure_rate, 0)              AS closure_rate,
     -- angel score (higher = better opportunity)
     ROUND(
       COALESCE(cvs.store_count, 0) * 0.35
       - COALESCE(dc.closure_rate, 0) * 0.40
       - z.store_count * 0.20,
     2) AS angel_score
   FROM zone_density z
   LEFT JOIN dead_zone_clusters dc USING (category, district, grid_cell)
   LEFT JOIN zone_density cvs ON cvs.grid_cell = z.grid_cell
     AND cvs.category = 'convenience_store';
   ```

2. **API**: `/api/supabase/angel-zones?category=cafe` — returns GeoJSON of top-scoring cells

3. **Map layer**: Green glow heatmap overlaid on the home page and Time Machine when "Angel Zones" toggle is ON

4. **Data requirement**: convenience store data must be seeded (run Stage 1 with `--category "convenience store"`)

## Admin System

### Enable Admin Access

```text
NEXT_PUBLIC_ADMIN_EMAIL=your-admin-email@example.com
```

Log in with that email via OTP. A red **Admin CMS** button appears in the navbar.

### Admin Dashboard (`/admin`)

- View all places with inline edit and delete
- **Research this area** button on the home map triggers a live Google fetch for the current viewport center and saves results to Supabase

### Cost Model

All user traffic hits Supabase only. Google Places API is called exclusively:
- During `seed_taipei_all_districts.py` (admin pipeline)
- When an admin clicks **Research this area** on the home page

## Testing

```bash
npm test                  # unit tests
npm run test:integration  # read-only, requires .env.local
```

## Roadmap

- [x] Interactive Mapbox map with viewport-driven store list
- [x] Cold-blue / warm-red heatmap for saturation vs. growth
- [x] Time Machine with dynamic year range per category
- [x] Dead zone ☠ markers + dark heatmap layer
- [x] Multi-category support with live category list from DB
- [x] 3×3 grid seeding per district (eliminates border blind spots)
- [x] Dead-zone data pipeline (Google Details + Taiwan gov CSV reconciliation)
- [x] `dead_zone_clusters` materialized view
- [x] Hover-to-highlight + pan-to-update on home map
- [x] Admin "Research this area" on-demand Google fetch
- [ ] Angel Zone scoring layer (convenience store × low closure rate)
- [ ] District boundary polygons in `districts` table
- [ ] `zone_density` + `dead_zone_clusters` wired to a REST endpoint for the heatmap
- [ ] Store lifecycle timeline (relocated tracking)
- [ ] Public API for third-party integrations