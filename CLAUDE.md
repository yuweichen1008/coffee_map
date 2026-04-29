# StorePulse — Claude Development Guide

## Project Identity

**StorePulse** is a retail location intelligence platform for Singapore SMEs and angel investor pitch.
Stack: **Next.js 14 + TypeScript + Supabase (PostGIS) + Mapbox GL JS + Python pipeline**

Founder is based in Singapore, actively pitching to pre-seed investors.
Primary market: Singapore. Secondary: Taipei (live dataset retained for comparison).

---

## Critical Context (read before any session)

- **Active city: Singapore.** Default city on map, all new features target SG first.
- **Core moat:** Dead Zones (closed store clusters) + Government data reconciliation + 13-category signal matrix.
- **Supabase `places` table** is the single source of truth — every store with `lat/lng`, `category`, `status`, `review_count`, `rating`, `district`.
- **No ORM.** All DB queries use `supabase-js` client directly with typed selects.
- **No Redux/Zustand.** State is React `useState` + `useCallback` + `useEffect` per page.
- **Admin-gated writes.** Public users get cached reads only. `NEXT_PUBLIC_ADMIN_EMAIL` controls admin access.
- **Mapbox token** is client-side only (`NEXT_PUBLIC_MAPBOX_TOKEN`). Never query Google Maps client-side.

---

## Architecture in One Page

```
Browser (Next.js pages)
  └─ /map          — Mapbox heatmap + signal intelligence panel
  └─ /discover     — Hawker rankings + MRT mall finder
  └─ /time-machine — Year-by-year store opening/closure trends
  └─ /pitch        — VC snapshot (live stats from /api/pitch-stats)
  └─ /intro        — B2B landing page

API Routes (/pages/api/)
  └─ places.ts        — Spatial bbox query, admin-gated Google refresh
  └─ hawker-rank.ts   — Hawkers ordered by review_count DESC
  └─ mrt-malls.ts     — Malls within radius of MRT lat/lng (Haversine)
  └─ pitch-stats.ts   — Live counts for investor deck
  └─ categories.ts    — Category list from DB
  └─ stats.ts         — District-level aggregates

Supabase (PostgreSQL + PostGIS)
  └─ places           — Core store table (14 categories, 2 cities)
  └─ categories       — Category lookup with display_name + group
  └─ districts        — 12 Taipei + 19 Singapore districts with centers
  └─ zone_density     — Materialized view: density per district×category
  └─ dead_zone_clusters — Materialized view: closure cluster signals

Python Pipeline (scripts/)
  └─ fetch/fetch_places.py    — Google Places 3×3 grid scrape per district
  └─ preprocess/update_founded_dates.py — Backfill opening dates
  └─ admin/fetch_closed_businesses.py   — Mark closed via GCIS/ACRA
```

---

## How to Add a New Store Category

1. Add SQL: `INSERT INTO public.categories (name, display_name, group_name) VALUES ('slug', 'Label', 'group')`
2. Add to `scripts/fetch/fetch_places.py` `CATEGORY_MAP` dict
3. Add color to `pages/map.tsx` `CATEGORY_COLORS`
4. Add signal intel to `pages/map.tsx` `SIGNAL_INTEL`
5. Seed: `python3 scripts/fetch/fetch_places.py --city singapore --category "search term"`

## How to Add a New Page

1. Create `pages/[name].tsx` — use `Navbar` component, dark theme (`bg-gray-950 text-white`)
2. Add link in `components/Navbar.tsx`
3. If it needs data: create `pages/api/[name].ts` using `supabase` from `@/lib/supabaseClient`
4. Cache API responses: `res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')`

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin DB access |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | client | Map rendering |
| `GOOGLE_MAPS_API_KEY` | Python scripts only | Places scraping |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | server API routes | Places refresh |
| `NEXT_PUBLIC_ADMIN_EMAIL` | client + server | Admin gate |

---

## Key Files

| File | What it does |
|---|---|
| `pages/map.tsx` | Main map: `CATEGORY_COLORS`, `SIGNAL_INTEL`, `CITY_CONFIG`, `SINGAPORE_DISTRICTS` |
| `pages/discover.tsx` | Hawker rankings + MRT mall finder |
| `pages/pitch.tsx` | Investor deck with live stats |
| `pages/api/places.ts` | Core spatial query + admin Google refresh |
| `db/init_all.sql` | Full schema + all seed data (safe to re-run) |
| `scripts/fetch/fetch_places.py` | Primary data ingestion pipeline |
| `lib/supabaseClient.ts` | Supabase singleton |
| `components/Navbar.tsx` | Global nav — add new pages here |

---

## Common Pitfalls

See `.claude/pitfalls/` for detailed pitfall logs.

- **Python 3.9**: No `dict | None` type hints — use plain `= None` parameter defaults.
- **NEXT_PUBLIC_ prefix**: Any env var read client-side must have `NEXT_PUBLIC_` prefix.
- **Supabase anon key naming**: Key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, not the standard `ANON_KEY`.
- **Port conflict**: Dev server may start on 3001 if 3000 is occupied — check terminal output.
- **Mapbox style load**: Layer operations must wait for `map.on('load', ...)` — wrap with async `styleLoaded` promise.

---

## See Also

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design
- [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md) — Patterns and conventions
- [docs/STORE_INTELLIGENCE.md](docs/STORE_INTELLIGENCE.md) — Signal matrix (core IP)
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) — End-to-end data flow
- [docs/SINGAPORE.md](docs/SINGAPORE.md) — Districts, MRT stations, local insights
- [docs/ROADMAP.md](docs/ROADMAP.md) — Phased feature roadmap
- [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) — Consulting tiers, pitch strategy
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — All API routes with params/responses
- [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md) — Database tables, views, indexes
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — Known limitations and workarounds
