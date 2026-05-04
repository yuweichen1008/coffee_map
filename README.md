# StorePulse — Singapore Retail Intelligence

Location intelligence platform for Singapore SMEs and angel investor pitch. Visualize where stores thrive, where businesses fail, and where the next opportunity lies — powered by Singapore government open data.

## What It Does

- **Michelin map** — All Singapore Michelin-starred restaurants with tenure timelines, star ascension history, and vintage filter
- **Discover** — Hawker centre rankings by review count + NEA grade, MRT mall finder, Jurong East quick-access tab, and a random picker with Claude prompt export
- **Dead Zones** — Areas with high closed-store density flagged with ☠ markers and dark heatmap
- **Time Machine** — Replays store openings and closures year by year
- **Pitch deck** — Live investor stats pulled from the database

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org/) + TypeScript |
| Database | PostgreSQL + PostGIS (Docker locally / Cloud SQL in production) |
| DB client | [postgres.js](https://github.com/porsager/postgres) — tagged template SQL, no ORM |
| Map | [Mapbox GL JS](https://www.mapbox.com/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Auth | Custom bearer token (`ADMIN_SECRET`) + sessionStorage on client |
| Data sources | Google Places API · NEA · LTA DataMall · OneMap · ACRA |
| Scripting | Python 3 (ETL pipeline in `scripts/`) |
| Deployment | GCP Cloud Run (asia-southeast1) via Cloud Build |

## Pages

| Route | Description |
|---|---|
| `/map` | Mapbox heatmap + signal intelligence panel, admin Google refresh |
| `/discover` | Hawker rankings, MRT mall finder, Jurong East tab, 🎲 random picker |
| `/michelin` | Michelin restaurants with animated tenure bars + vintage filter |
| `/time-machine` | Year-by-year store opening/closure trends |
| `/pitch` | VC snapshot with live DB stats |
| `/intro` | B2B landing page |
| `/login` | Admin login (email → `/api/auth/login` → sessionStorage token) |
| `/admin` | Admin CRUD for places (bearer token gated) |

## Architecture

```
Browser (Next.js pages)
  └─ Pages call /api/* routes — never touch the DB directly

API Routes (pages/api/)
  └─ All DB access via getDb() from lib/db.ts (postgres.js singleton)
  └─ Admin writes: Authorization: Bearer <ADMIN_SECRET>

PostgreSQL + PostGIS
  └─ Cloud SQL (production) · Docker (local)
  └─ places — core store table (14 categories, SG + Taipei)
  └─ sg_hawker_centres, sg_bus_stops, sg_planning_areas, sg_hdb_prices
  └─ zone_density, dead_zone_clusters (materialized views)

Python ETL (scripts/)
  └─ Google Places scrape, NEA hawker data, LTA bus stops, OneMap, ACRA
```

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for local PostgreSQL + PostGIS)
- A [Mapbox](https://account.mapbox.com) account

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```text
# PostgreSQL connection
DATABASE_URL=postgres://storepulse:storepulse@localhost:5432/storepulse

# Admin auth — must match on both sides
ADMIN_SECRET=generate-with-openssl-rand-hex-32
NEXT_PUBLIC_ADMIN_SECRET=same-value-as-ADMIN_SECRET
NEXT_PUBLIC_ADMIN_EMAIL=you@example.com

# Map rendering
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...

# Google Places API (server-side ETL only)
GOOGLE_MAPS_API_KEY=AIzaSy...

# LTA DataMall (bus stops ETL)
LTA_API_KEY=...
```

### Local Dev with Docker

```bash
# Start PostgreSQL + PostGIS
docker-compose up -d

# Run schema + seed
docker exec -i storepulse-db psql -U storepulse storepulse < db/init_all.sql
docker exec -i storepulse-db psql -U storepulse storepulse < db/sg_enrichment.sql

# Start Next.js
npm install
npm run dev
# → http://localhost:3000
```

### Database Setup (manual)

```bash
# Connect and run schema
psql $DATABASE_URL < db/init_all.sql
psql $DATABASE_URL < db/sg_enrichment.sql
```

## Data Pipeline

### Seed Singapore stores

```bash
cd scripts/fetch
pip install -r requirements.txt

python fetch_places.py --city singapore --category "coffee shop"
python fetch_places.py --city singapore --category "hawker centre"
# etc.
```

### Singapore government data

```bash
python fetch_sg_govdata.py      # NEA hawker centres + grades
python fetch_lta_busstops.py    # LTA bus stops → bus_stops_400m
python fetch_onemap_boundaries.py  # 55 planning area polygons
python fetch_acra.py            # ACRA company registration/closure
```

### Refresh materialized views

```sql
REFRESH MATERIALIZED VIEW public.zone_density;
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

## Admin Auth

Authentication uses a bearer token, not Supabase. Login flow:

1. User POSTs email to `/api/auth/login`
2. Server validates against `NEXT_PUBLIC_ADMIN_EMAIL`, returns `ADMIN_SECRET`
3. Client stores token in `sessionStorage` as `storepulse_token`
4. Admin API routes check `Authorization: Bearer <token>` against `process.env.ADMIN_SECRET`

No JWT, no sessions, no Supabase auth. Token lives only in sessionStorage.

## DB Query Pattern

All queries use postgres.js tagged template SQL via `lib/db.ts`:

```typescript
import getDb from '@/lib/db'

const sql = getDb()
if (!sql) return res.status(503).json({ error: 'no db' })

const rows = await sql`SELECT * FROM places WHERE city = ${city} LIMIT ${limit}`
const typed = rows as unknown as MyType[]
```

Never use an ORM, never use Supabase client for DB queries.

## Deployment

Production runs on GCP Cloud Run (asia-southeast1). See [docs/GCP_SETUP.md](docs/GCP_SETUP.md) for the full runbook.

```bash
# Manual deploy
gcloud builds submit --config cloudbuild.yaml
```

## Key Files

| File | Purpose |
|---|---|
| `lib/db.ts` | postgres.js singleton — `getDb()` |
| `db/init_all.sql` | Full schema + seed (safe to re-run) |
| `db/sg_enrichment.sql` | SG-specific tables and columns |
| `docker-compose.yml` | Local dev: PostGIS + Next.js |
| `cloudbuild.yaml` | GCP CI/CD pipeline |
| `pages/map.tsx` | Main map page |
| `pages/discover.tsx` | Hawker + mall + Jurong East + random picker |
| `pages/michelin.tsx` | Michelin page with tenure animations |
| `pages/api/places.ts` | Core spatial query + admin Google refresh |
| `components/Navbar.tsx` | Global nav |
| `scripts/fetch/` | Python ETL scripts |

## See Also

- [docs/GCP_SETUP.md](docs/GCP_SETUP.md) — Cloud SQL + Cloud Run deployment
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design
- [docs/SINGAPORE.md](docs/SINGAPORE.md) — Districts, MRT stations, local data
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) — End-to-end data flow
- [docs/ROADMAP.md](docs/ROADMAP.md) — Phased feature roadmap
- [CLAUDE.md](CLAUDE.md) — AI development guide
