# Data Pipeline — StorePulse

## Overview

```
Google Places API
       │
       ▼
scripts/fetch/fetch_places.py     ← primary ingestion (3×3 grid per district)
       │
       ▼
Supabase `places` table           ← upsert on google_place_id (dedup key)
       │
       ├── scripts/preprocess/update_founded_dates.py   ← backfill opened dates
       │
       ├── scripts/admin/fetch_closed_businesses.py     ← mark closed stores
       │
       ▼
REFRESH MATERIALIZED VIEW zone_density
REFRESH MATERIALIZED VIEW dead_zone_clusters
       │
       ▼
/api/places, /api/hawker-rank, /api/mrt-malls, etc.
       │
       ▼
Browser (map, discover, time-machine)
```

---

## Stage 1 — Place Ingestion (`scripts/fetch/fetch_places.py`)

### How It Works

Each district is divided into a 3×3 grid of cells. Each cell is queried independently with Google Places Nearby Search. This eliminates blind spots — a single center-point query misses places at the edges of a district.

```
┌─────┬─────┬─────┐
│ c1  │ c2  │ c3  │
├─────┼─────┼─────┤
│ c4  │ c5  │ c6  │   ← 9 cells per district
├─────┼─────┼─────┤
│ c7  │ c8  │ c9  │
└─────┴─────┴─────┘
Each cell: up to 60 results (3 pages × 20 results)
```

**Max results per district per category: 540 (9 cells × 60)**

### Running the Pipeline

```bash
cd /Users/sami/code/coffee_map
source .venv/bin/activate

# Single category, single city
python3 scripts/fetch/fetch_places.py --city singapore --category "hawker centre"

# All Singapore districts, one category
python3 scripts/fetch/fetch_places.py --city singapore --category "coffee shop"

# Dry run (print results, no DB write)
python3 scripts/fetch/fetch_places.py --city singapore --category "shopping mall" --dry-run

# Both cities
python3 scripts/fetch/fetch_places.py --city all --category "pharmacy"
```

### Category Search Terms → DB Slugs

The script normalizes search terms to DB slugs via `CATEGORY_MAP`. Always use the natural language search term on the command line:

| Search term | DB slug |
|---|---|
| `"hawker centre"` | `hawker` |
| `"coffee shop"` | `cafe` |
| `"shopping mall"` | `shopping_mall` |
| `"convenience store"` | `convenience_store` |

### Rate Limiting

- 1 second delay between cells
- 2.1 second delay before fetching next page token (Google requirement)
- Max 3 pages per cell (configurable via `--max-pages`)

---

## Stage 2 — Date Backfill (`scripts/preprocess/update_founded_dates.py`)

Estimates store opening date from the oldest Google review date.
Run after initial seeding to populate `founded_date` for Time Machine.

```bash
python3 scripts/preprocess/update_founded_dates.py --limit 200
```

Confidence level stored as `founded_date_confidence = 'estimated'` (vs `'verified'` for government data).

---

## Stage 3 — Closure Detection (`scripts/admin/fetch_closed_businesses.py`)

Two modes:

**Google mode** — Uses Google Places Detail to check `business_status`:
```bash
python3 scripts/admin/fetch_closed_businesses.py --source google --limit 500
```
Sets `status = 'closed'` and `closed_date = today` for permanently closed places.

**Government CSV mode** — Cross-references with ACRA (Singapore) or GCIS (Taiwan):
```bash
python3 scripts/admin/fetch_closed_businesses.py --source gov --gov-csv sg_bizfile.csv --city singapore
```
This is the moat — government data catches closures that Google hasn't flagged yet.

---

## Stage 4 — Materialized View Refresh

Run in Supabase SQL Editor after any bulk data operation:

```sql
REFRESH MATERIALIZED VIEW public.zone_density;
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

`zone_density` — aggregates store count per district × category combination.
`dead_zone_clusters` — groups closed stores into geographic clusters.

---

## Singapore Seeding Runbook

Full Singapore seed (all 14 categories × 19 districts). Estimated time: 2–3 hours.

```bash
cd /Users/sami/code/coffee_map
source .venv/bin/activate

# F&B (highest value for consulting)
python3 scripts/fetch/fetch_places.py --city singapore --category "coffee shop"
python3 scripts/fetch/fetch_places.py --city singapore --category "hawker centre"
python3 scripts/fetch/fetch_places.py --city singapore --category "restaurant"
python3 scripts/fetch/fetch_places.py --city singapore --category "bakery"
python3 scripts/fetch/fetch_places.py --city singapore --category "bubble tea"

# Retail anchors
python3 scripts/fetch/fetch_places.py --city singapore --category "convenience store"
python3 scripts/fetch/fetch_places.py --city singapore --category "supermarket"
python3 scripts/fetch/fetch_places.py --city singapore --category "shopping mall"

# Services / Demographics
python3 scripts/fetch/fetch_places.py --city singapore --category "pharmacy"
python3 scripts/fetch/fetch_places.py --city singapore --category "gym"
python3 scripts/fetch/fetch_places.py --city singapore --category "coworking space"
python3 scripts/fetch/fetch_places.py --city singapore --category "childcare"
python3 scripts/fetch/fetch_places.py --city singapore --category "laundromat"

# Then refresh views
# (run in Supabase SQL Editor)
# REFRESH MATERIALIZED VIEW public.zone_density;
# REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

---

## Data Quality Notes

- **Duplicate handling:** Upsert on `google_place_id` — re-running is safe.
- **Rating freshness:** `rating` and `review_count` are updated on each upsert (freshness from last run).
- **Closed detection lag:** Google may take 3–6 months to mark a closed business. Government CSV is faster.
- **District assignment:** The `district` field is set by which district the scrape was initiated for — a store near a boundary may be assigned to the wrong district. ~5% error rate acceptable.
- **`shopping_mall` precision:** Google Places may return large malls as multiple entries (different floors/wings). Expected behavior — they are distinct places.

---

## Adding a New City

1. Add district dict to `scripts/fetch/fetch_places.py`:
```python
KUALA_LUMPUR_DISTRICTS = {
    'KLCC':    {'lat': 3.1579, 'lng': 101.7130, 'half_km': 1.5},
    'Bukit_Bintang': {'lat': 3.1462, 'lng': 101.7103, 'half_km': 1.5},
    # ...
}
```
2. Add `choices=['taipei', 'singapore', 'kuala_lumpur', 'all']` to argparse
3. Add district seed rows to `db/init_all.sql`
4. Add city config to `CITY_CONFIG` in `pages/map.tsx`
5. Run seeding for all categories
6. Add city toggle button in `pages/map.tsx` sidebar
