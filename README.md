# Taipei Business Map

Location intelligence for business owners. Visualize where stores are thriving, where gaps exist, and how the competitive landscape has changed over time — across any business category in Taipei.

## What It Does

- **Spot opportunities:** See which districts are undersaturated for a given store type before committing to a lease.
- **Track growth over time:** The Time Machine feature replays how a category expanded across Taipei year by year, using each store's estimated founding date.
- **Identify hot and cold zones:** A heatmap highlights density clusters so you can see which neighborhoods are booming and which are quiet.
- **Multi-category analysis:** Switch between coffee shops, convenience stores, grocery stores, restaurants, bakeries, and more — same map, same tools.

## Key Features

| Feature | Description |
|---|---|
| **Interactive Map** | Mapbox-powered map with per-district filtering |
| **Heatmap** | Density overlay to visualize hot and cold zones |
| **Time Machine** | Date-range slider to view store counts at any point in history |
| **Multi-category** | Toggle across business types (cafe, grocery, convenience store, etc.) |
| **Admin CMS** | Authorized admins can sync, edit, and enrich place data |
| **User Reports** | Community contribution system with gamification points |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 13](https://nextjs.org/) + TypeScript |
| Database | [Supabase](https://supabase.io/) (PostgreSQL + PostGIS) |
| Map | [Mapbox GL JS](https://www.mapbox.com/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Data source | [Google Places API](https://developers.google.com/maps/documentation/places/web-service) |
| Scripting | Python 3 (data ingestion pipeline) |

## Architecture

```
Google Places API
       │
       ▼
Python scripts (scripts/)
  seed_taipei_all_districts.py  →  taipei_coffee_shops.csv  →  Supabase (manual import)
  update_founded_dates.py       →  backfills founded_date in Supabase
       │
       ▼
Supabase (PostgreSQL + PostGIS)
  places, categories, districts, zone_density (materialized view)
       │
       ▼
Next.js API routes (pages/api/)
  /api/places      – spatial + temporal queries
  /api/stats       – counts per category
  /api/categories  – available store types
       │
       ▼
Mapbox GL JS (pages/index.tsx)
  markers, heatmap layer, time machine date filter
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://app.supabase.com) project (free tier works)
- A [Mapbox](https://account.mapbox.com) account (free tier works)
- A [Google Maps Platform](https://console.cloud.google.com) project with Places API enabled

### Environment Variables

Create a `.env.local` file in the project root:

```text
# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token

# Google Maps — use browser-restricted key for NEXT_PUBLIC, unrestricted for server
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_google_maps_key
GOOGLE_MAPS_API_KEY=your_server_google_maps_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # keep secret — never commit

# Admin
NEXT_PUBLIC_ADMIN_EMAIL=your-admin-email@example.com
```

### Database Setup

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `db/init_all.sql` and run it
3. This creates all extensions, tables, indexes, the `zone_density` materialized view, and seed categories

> **Note:** The service role key is required for server-side writes. If Row-Level Security blocks writes during development, make sure `SUPABASE_SERVICE_ROLE_KEY` is set.

### Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Pipeline

Populate the database with real Taipei store data:

**Step 1 — Scrape Google Places → CSV**

```bash
cd scripts
pip install -r requirements.txt
python seed_taipei_all_districts.py
```

This fetches coffee shops across all 12 Taipei districts, enriches each with a `founded_date` (estimated from the oldest Google review), and writes `taipei_coffee_shops.csv`.

**Step 2 — Import CSV into Supabase**

- Supabase dashboard → `places` table → **Import data** → select `taipei_coffee_shops.csv`
- Map columns: `google_place_id`, `name`, `address`, `lat`, `lng`, `category`, `source`, `founded_date`

**Step 3 — Backfill missing founding dates (optional)**

```bash
python update_founded_dates.py
```

Updates any `places` rows where `founded_date` is NULL by querying the oldest Google review.

## Database Schema

### `categories`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Unique slug (`cafe`, `convenience_store`, `grocery`) |
| `display_name` | text | Human-readable label shown in UI |
| `group_name` | text | Category group (`f_and_b`, `retail`, `services`) |
| `icon` | text | Icon key for UI rendering |
| `description` | text | Optional description |

### `districts`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | English district name (`Daan`, `Xinyi`, …) |
| `name_zh` | text | Chinese name (`大安區`) |
| `center_lat` / `center_lng` | float | Map center for the district |
| `bounds` | jsonb | GeoJSON polygon for district boundary |

### `places`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `google_place_id` | text | Unique Google Place ID |
| `name` | text | Store name |
| `address` | text | Street address |
| `district` | text | Taipei district (denormalized for fast filtering) |
| `zipcode` | text | Postal code |
| `lat` / `lng` | float | GPS coordinates |
| `location` | geometry(Point) | PostGIS point (SRID 4326) — spatially indexed |
| `category` | text | Category slug (denormalized) |
| `category_id` | uuid | FK → `categories.id` |
| `source` | text | `google_maps_api` \| `admin` \| `user_report` |
| `status` | text | `active` \| `closed` \| `relocated` |
| `founded_date` | date | Estimated store opening date |
| `founded_date_confidence` | text | `estimated` \| `verified` \| `unknown` |
| `closed_date` | date | When the store closed (if applicable) |
| `rating` | real | Google rating (1.0 – 5.0) |
| `review_count` | integer | Number of Google reviews |
| `google_data` | jsonb | Raw Google Places API payload |
| `created_at` / `updated_at` | timestamptz | Record timestamps |

**Indexes:** spatial GIST on `location`, composite `(category, district)` for BI queries, `founded_date` for Time Machine queries.

### `zone_density` (materialized view)

Pre-computed ~200 m grid cells with store counts per category. Used by the heatmap to avoid full table scans on every map interaction. Refresh with:

```sql
REFRESH MATERIALIZED VIEW public.zone_density;
```

### `reports`

User-submitted store reports. Each accepted report awards the submitter 10 points tracked in `user_points`.

## Admin System

### Enable Admin Access

Add to `.env.local`:

```text
NEXT_PUBLIC_ADMIN_EMAIL=your-admin-email@example.com
```

Log in with that email via the OTP prompt. A red **Admin CMS** button appears in the navbar.

### Admin Dashboard (`/admin`)

- **Places table** — view all cached stores with name, address, category, founded date
- **Inline edit** — update any field and save directly to Supabase
- **Delete** — remove a place from the database
- **Sync from Google Places** — force-fetch fresh data for a district and upsert results

### Cost Efficiency

First admin sync populates Supabase → all subsequent user searches hit the cache → Google Places API is only called on explicit admin re-sync.

## Testing

```bash
# Unit tests
npm test

# Integration test (requires Supabase credentials in .env.local)
npm run test:integration
```

The integration test is read-only and safe to run against a live Supabase project.

## Roadmap

- [x] Interactive Mapbox map with district filtering
- [x] Heatmap density overlay
- [x] Time Machine date-range filtering
- [x] Google Places data ingestion pipeline
- [x] Admin CMS for data management
- [x] User authentication (email OTP)
- [x] Multi-category support (cafe, grocery, convenience store, etc.)
- [ ] `zone_density` materialized view wired to heatmap API
- [ ] District boundary polygons in `districts` table
- [ ] Store lifecycle tracking (closed / relocated stores)
- [ ] "Request Analysis" feature with real scoring model
- [ ] Public API for third-party integrations
