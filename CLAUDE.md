# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## StorePulse — Claude Development Guide

**StorePulse** is a retail location intelligence platform for Singapore SMEs and angel investor pitch.
Stack: **Next.js 13 + TypeScript + postgres.js (PostgreSQL + PostGIS) + Mapbox GL JS + Python pipeline**

Founder is based in Singapore, actively pitching to pre-seed investors.
Primary market: Singapore. Secondary: Taipei (live dataset retained for comparison).

---

## Commands

```bash
# Local dev — start DB first, then Next.js
docker-compose up -d db        # PostGIS only (faster for dev)
npm run dev                    # → http://localhost:3000 (may use 3001 if 3000 is occupied)

# Full Docker stack (DB + Next.js in containers)
docker-compose up -d

# Type-check without emitting
npx tsc --noEmit

# Tests
npm test                       # Jest unit tests
npm run test:integration       # Integration tests (runs serially)

# Verify no Supabase imports remain
grep -r "supabase" pages/ components/ lib/ --include="*.ts" --include="*.tsx" -l

# DB schema reset (run after docker-compose up -d db)
docker-compose exec -T db psql -U storepulse storepulse < db/init_all.sql
docker-compose exec -T db psql -U storepulse storepulse < db/sg_enrichment.sql
docker-compose exec -T db psql -U storepulse storepulse < db/sg_open_data.sql

# Seed all 14 categories (run from scripts/fetch/)
for cat in "coffee shop" "hawker centre" "restaurant" "bakery" "beverage store" \
           "convenience store" "grocery" "supermarket" "pharmacy" "gym" \
           "coworking" "childcare" "laundromat" "shopping mall"; do
  python3 fetch_places.py --city singapore --category "$cat"
done

# Deploy
gcloud builds submit --config cloudbuild.yaml
```

---

## Critical Context (read before any session)

- **Active city: Singapore.** Default city on map, all new features target SG first.
- **Core moat:** Dead Zones (closed store clusters) + SG government data reconciliation + 14-category signal matrix.
- **`places` table** is the single source of truth — every store with `lat/lng`, `category`, `status`, `review_count`, `rating`, `district`, `nea_grade`, `bus_stops_400m`, `acra_uen`.
- **No ORM.** All DB queries use `postgres.js` tagged template SQL via `lib/db.ts`. Cast results: `rows as unknown as MyType[]`.
- **No Redux/Zustand.** State is React `useState` + `useCallback` + `useEffect` per page.
- **Admin auth:** `ADMIN_SECRET` bearer token. Check: `req.headers.authorization?.split(' ')[1] === process.env.ADMIN_SECRET`.
- **Mapbox token** is client-side only (`NEXT_PUBLIC_MAPBOX_TOKEN`). Never query Google Maps client-side.

---

## Architecture

```
Browser (Next.js pages)
  └─ /map          — Mapbox heatmap + signal intelligence panel
  └─ /discover     — Hawker rankings + MRT mall finder + Jurong East tab + 🎲 random picker
  └─ /michelin     — Michelin-starred restaurants with tenure timeline + vintage filter
  └─ /time-machine — Year-by-year store opening/closure trends
  └─ /pitch        — VC snapshot (live stats from /api/pitch-stats)
  └─ /intro        — B2B landing page
  └─ /login        — Admin login (email → /api/auth/login → sessionStorage token)
  └─ /admin        — Admin CRUD for places (bearer token gated)

API Routes (/pages/api/)
  └─ places.ts              — Spatial bbox query, admin-gated Google refresh
  └─ places-list.ts         — Paginated category bulk load for map sidebar (replaces old supabase/places)
  └─ hawker-rank.ts         — Hawkers ordered by review_count DESC (+ nea_grade)
  └─ mrt-malls.ts           — Malls within radius of MRT lat/lng (Haversine)
  └─ pitch-stats.ts         — Live counts for investor deck
  └─ categories.ts          — Category list from DB
  └─ stats.ts               — District-level aggregates
  └─ report.ts              — User-submitted store report
  └─ auth/login.ts          — POST email → returns ADMIN_SECRET if email matches env
  └─ auth/register.ts       — Admin registration
  └─ admin/place.ts         — Admin CRUD: create/update/delete a place (Bearer gated)
  └─ consulting/signals.ts  — B2B consulting signal data
  └─ sg/enrichment.ts       — Per-place SG data (NEA, ACRA, bus stops)
  └─ sg/planning-areas.ts   — All 55 planning area GeoJSON polygons
  └─ sg/hdb-prices.ts       — Median HDB resale price by town

PostgreSQL + PostGIS (Docker locally / Cloud SQL in production)
  └─ places              — Core store table (14 categories, 2 cities)
  └─ categories          — Category lookup with display_name + group
  └─ districts           — 12 Taipei + 19 Singapore districts with centers
  └─ sg_hawker_centres   — Official NEA hawker centres (linked to places)
  └─ sg_bus_stops        — LTA bus stops with PostGIS location (foot traffic proxy)
  └─ sg_planning_areas   — 55 planning area polygons (OneMap)
  └─ sg_hdb_prices       — Median resale price by town (income signal)
  └─ sg_new_businesses   — ACRA newly registered F&B/retail businesses (trend signal)
  └─ sg_sfa_licenses     — NEA/SFA licensed eating establishments with hygiene grade
  └─ sg_population       — Resident population by planning area (Census 2020)
  └─ zone_density        — Materialized view: density per district×category
  └─ dead_zone_clusters  — Materialized view: closure cluster signals
  └─ sg_area_opportunity — View: stores per 1k residents (underserved area signal)

Python ETL (scripts/)
  └─ fetch/fetch_places.py               — Google Places 3×3 grid scrape per district (all 14 categories)
  └─ fetch/fetch_sg_govdata.py           — data.gov.sg: hawker centres + NEA grades
  └─ fetch/fetch_lta_busstops.py         — LTA DataMall: 5K bus stops → bus_stops_400m
  └─ fetch/fetch_onemap_boundaries.py    — OneMap: 55 planning area polygons
  └─ fetch/fetch_acra.py                 — ACRA CSV: business reg/cease dates
  └─ fetch/fetch_new_businesses.py       — ACRA: newly registered businesses by SSIC category
  └─ fetch/fetch_sfa_licenses.py         — NEA: 36k+ licensed eating establishments + hygiene grades
  └─ fetch/fetch_population.py           — SingStat: resident population by planning area
  └─ fetch/govdata_client.py             — Shared data.gov.sg v2 API client (poll-download pattern)
  └─ preprocess/update_founded_dates.py  — Backfill opening dates
  └─ admin/fetch_closed_businesses.py    — Mark closed via GCIS/ACRA
```

---

## Auth Flow

No JWT, no sessions, no external auth service. Single-admin email gate:

1. Client POSTs `{ email }` to `/api/auth/login`
2. Server compares against `NEXT_PUBLIC_ADMIN_EMAIL`; if match, returns `ADMIN_SECRET`
3. Client stores token in `sessionStorage` as `storepulse_token`
4. Admin API routes check `Authorization: Bearer <token>` against `process.env.ADMIN_SECRET`

Client-side admin check pattern:
```typescript
const isAdmin = typeof window !== 'undefined' &&
  sessionStorage.getItem('storepulse_token') === process.env.NEXT_PUBLIC_ADMIN_SECRET
```

---

## DB Query Pattern

```typescript
import getDb from '@/lib/db'

const sql = getDb()
if (!sql) return res.status(503).json({ error: 'no db' })

const rows = await sql`SELECT * FROM places WHERE city = ${city} LIMIT ${limit}`
const typed = rows as unknown as MyType[]
```

`getDb()` returns `null` when `DATABASE_URL` is unset — always guard against it. Never use an ORM.

---

## How to Add a New Store Category

1. `INSERT INTO categories (name, display_name, group_name) VALUES ('slug', 'Label', 'group')`
2. Add to `scripts/fetch/fetch_places.py` `CATEGORY_MAP`
3. Add color to `pages/map.tsx` `CATEGORY_COLORS`
4. Add signal intel to `pages/map.tsx` `SIGNAL_INTEL`
5. Seed: `python3 scripts/fetch/fetch_places.py --city singapore --category "search term"`

## How to Add a New Page

1. Create `pages/[name].tsx` — use `Navbar` component, dark theme (`bg-gray-950 text-white`)
2. Add link in `components/Navbar.tsx`
3. If it needs data: create `pages/api/[name].ts` using `getDb` from `@/lib/db`
4. Cache: `res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')`

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | server (API routes) | postgres.js connection string |
| `ADMIN_SECRET` | server | Bearer token for admin writes |
| `NEXT_PUBLIC_ADMIN_EMAIL` | client + server | Admin gate (UI visibility) |
| `NEXT_PUBLIC_ADMIN_SECRET` | client | Admin auth from browser |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | client | Map rendering |
| `GOOGLE_MAPS_API_KEY` | server + Python | Places scraping + API refresh |
| `LTA_API_KEY` | Python scripts | LTA DataMall bus stop fetch |

**Local dev:** copy `.env.docker.example` → `.env.docker`, then `docker-compose up -d db && npm run dev`
**Production:** secrets in GCP Secret Manager, deployed via `cloudbuild.yaml` to Cloud Run (asia-southeast1)

---

## Key Files

| File | What it does |
|---|---|
| `lib/db.ts` | postgres.js singleton — `getDb()` returns sql instance or null if no DATABASE_URL |
| `pages/map.tsx` | Main map: `CATEGORY_COLORS`, `SIGNAL_INTEL`, `CITY_CONFIG`, `SINGAPORE_DISTRICTS` |
| `pages/discover.tsx` | Hawker rankings + MRT mall finder + Jurong East tab + random picker |
| `pages/michelin.tsx` | Michelin Guide: starred restaurants (1★–3★) + Bib Gourmand tab, tenure bars, vintage filter, fly-to |
| `pages/pitch.tsx` | Investor deck with live stats |
| `pages/api/places.ts` | Core spatial query + admin Google refresh |
| `pages/api/places-list.ts` | Paginated category bulk load — `GET ?category=&city=&offset=&limit=` |
| `db/init_all.sql` | Full schema + seed data (safe to re-run) |
| `db/sg_enrichment.sql` | SG-specific tables + ALTER TABLE places for NEA/ACRA/bus columns |
| `db/sg_open_data.sql` | Open data tables: sg_new_businesses, sg_sfa_licenses, sg_population, sg_area_opportunity |
| `docker-compose.yml` | Local dev: PostGIS DB + Next.js web |
| `cloudbuild.yaml` | GCP CI/CD: build → GCR → Cloud Run deploy |
| `docs/GCP_SETUP.md` | Full Cloud SQL + Cloud Run setup runbook |
| `scripts/fetch/fetch_places.py` | Primary data ingestion pipeline (all 14 categories) |
| `scripts/fetch/govdata_client.py` | data.gov.sg v2 API client — poll-download CSV pattern |
| `components/Navbar.tsx` | Global nav — add new pages here |

---

## Common Pitfalls

- **postgres.js types**: Results are `RowList<Row[]>` — always cast: `rows as unknown as MyType[]`
- **`getDb()` null guard**: Always check `if (!sql)` before querying — returns null when DATABASE_URL is unset.
- **Python 3.9**: No `dict | None` type hints — use plain `= None` parameter defaults.
- **NEXT_PUBLIC_ prefix**: Any env var read client-side must have `NEXT_PUBLIC_` prefix.
- **Port conflict**: Dev server may start on 3001 if 3000 is occupied — check terminal output.
- **Mapbox style load**: Layer operations must wait for `map.on('load', ...)` — wrap with async `styleLoaded` promise.
- **Set iteration**: Use `Array.from(new Set(...))` not `[...new Set(...)]` — downlevelIteration not enabled.

---

## See Also

- [docs/GCP_SETUP.md](docs/GCP_SETUP.md) — Cloud SQL + Cloud Run deployment runbook
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design
- [docs/STORE_INTELLIGENCE.md](docs/STORE_INTELLIGENCE.md) — Signal matrix (core IP)
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) — End-to-end data flow
- [docs/SINGAPORE.md](docs/SINGAPORE.md) — Districts, MRT stations, local insights
- [docs/ROADMAP.md](docs/ROADMAP.md) — Phased feature roadmap
- [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) — Consulting tiers, pitch strategy
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — All API routes with params/responses
- [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md) — Database tables, views, indexes
