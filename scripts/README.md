# Scripts — StorePulse Data Pipeline

## Directory Structure

```
scripts/
├── fetch/
│   ├── fetch_places.py         ← PRIMARY: Google Places 3×3 grid scraper
│   └── requirements.txt        ← Python dependencies
├── preprocess/
│   ├── update_founded_dates.py ← Backfill store opening dates from oldest review
│   ├── enrich_social_signals.py ← PTT/social signal enrichment
│   └── seed_social_signals.py  ← Seed social signal data to Supabase
└── admin/
    ├── fetch_closed_businesses.py ← Mark closed stores (Google + Gov CSV)
    └── fetch_closed.py            ← Legacy closure fetch
```

## Quick Start

```bash
# Setup
cd /path/to/coffee_map
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/fetch/requirements.txt

# Primary seed (Singapore, one category)
python3 scripts/fetch/fetch_places.py --city singapore --category "hawker centre"

# See full usage
python3 scripts/fetch/fetch_places.py --help
```

## Full Singapore Seed Order

Run in this order for a clean Singapore dataset:

```bash
# 1. F&B (highest consulting value)
python3 scripts/fetch/fetch_places.py --city singapore --category "coffee shop"
python3 scripts/fetch/fetch_places.py --city singapore --category "hawker centre"
python3 scripts/fetch/fetch_places.py --city singapore --category "restaurant"
python3 scripts/fetch/fetch_places.py --city singapore --category "bakery"
python3 scripts/fetch/fetch_places.py --city singapore --category "bubble tea"

# 2. Retail anchors
python3 scripts/fetch/fetch_places.py --city singapore --category "convenience store"
python3 scripts/fetch/fetch_places.py --city singapore --category "supermarket"
python3 scripts/fetch/fetch_places.py --city singapore --category "shopping mall"

# 3. Services / Demographics
python3 scripts/fetch/fetch_places.py --city singapore --category "pharmacy"
python3 scripts/fetch/fetch_places.py --city singapore --category "gym"
python3 scripts/fetch/fetch_places.py --city singapore --category "coworking space"
python3 scripts/fetch/fetch_places.py --city singapore --category "childcare"
python3 scripts/fetch/fetch_places.py --city singapore --category "laundromat"

# 4. Backfill dates
python3 scripts/preprocess/update_founded_dates.py --limit 500

# 5. Mark closed stores
python3 scripts/admin/fetch_closed_businesses.py --source google --limit 500

# 6. Refresh materialized views (run in Supabase SQL Editor)
# REFRESH MATERIALIZED VIEW public.zone_density;
# REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

## See Also

- [docs/DATA_PIPELINE.md](../docs/DATA_PIPELINE.md) — Full pipeline documentation
- [docs/SINGAPORE.md](../docs/SINGAPORE.md) — District coordinates and seeding guidance
