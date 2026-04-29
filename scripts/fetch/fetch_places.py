"""
Stage 1 — Scrape & Store
========================
Fetches places across Taipei from Google Places API and upserts them into
Supabase.  Both ACTIVE and PERMANENTLY CLOSED stores are captured so the
Time Machine "dead zone" layer works correctly.

Blind-spot mitigation
---------------------
Google Places Nearby returns at most 60 results per search (3 pages × 20).
A single district-center search misses stores near district borders or in
large districts (Neihu, Beitou, Wenshan).

Solution: each district is divided into a 3×3 grid of overlapping search
cells (~1 km radius each, adjusted for district size).  A global
google_place_id set deduplicates results across all cells and districts.

Dead-zone capture
-----------------
Google Nearby Search returns `business_status`:
  OPERATIONAL       → status = 'active'
  CLOSED_TEMPORARILY → status = 'active'  (re-check later)
  CLOSED_PERMANENTLY → status = 'closed'  + closed_date = today

Pass --skip-closed to omit permanently-closed stores (not recommended for
production; dead zones give valuable BI signal to business owners).

Usage
-----
  cd scripts
  python seed_taipei_all_districts.py [--category CATEGORY] [--dry-run] [--skip-closed]

  --category      Store type keyword sent to Google (default: coffee shop)
  --dry-run       Print results but do not write to Supabase
  --skip-closed   Exclude permanently-closed places from the upsert
"""

import argparse
import base64
import json
import math
import os
import sys
import time
from datetime import date
from dotenv import load_dotenv
import googlemaps
from supabase import create_client, Client

# ── Environment ───────────────────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path=env_path)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
SUPABASE_URL        = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY        = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not GOOGLE_MAPS_API_KEY:
    sys.exit("ERROR: GOOGLE_MAPS_API_KEY is not set in .env.local")
if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in .env.local")


def _jwt_role(token: str) -> str:
    try:
        payload_b64 = token.split('.')[1]
        payload_b64 += '=' * (-len(payload_b64) % 4)
        return json.loads(base64.b64decode(payload_b64)).get('role', 'unknown')
    except Exception:
        return 'unknown'


if _jwt_role(SUPABASE_KEY) != 'service_role':
    sys.exit(
        "ERROR: SUPABASE_SERVICE_ROLE_KEY is not a service_role key.\n"
        "  → In Supabase dashboard: Settings → API → copy the 'service_role' key.\n"
        "  → Update SUPABASE_SERVICE_ROLE_KEY in .env.local and retry."
    )

gmaps: googlemaps.Client = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
supabase: Client         = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase.postgrest.auth(SUPABASE_KEY)

# ── District definitions ──────────────────────────────────────────────────────
# Each district carries a `half_km` radius that controls how large a bounding
# box is divided into the 3×3 search grid.  Larger districts get bigger cells.
TAIPEI_DISTRICTS = {
    'Daan':       {'lat': 25.026,    'lng': 121.543,    'name_zh': '大安區', 'half_km': 1.8},
    'Xinyi':      {'lat': 25.0348,   'lng': 121.5677,   'name_zh': '信義區', 'half_km': 1.8},
    'Wanhua':     {'lat': 25.026285, 'lng': 121.497032, 'name_zh': '萬華區', 'half_km': 1.5},
    'Datong':     {'lat': 25.063,    'lng': 121.511,    'name_zh': '大同區', 'half_km': 1.3},
    'Zhongzheng': {'lat': 25.03236,  'lng': 121.51827,  'name_zh': '中正區', 'half_km': 1.5},
    'Songshan':   {'lat': 25.055,    'lng': 121.554,    'name_zh': '松山區', 'half_km': 1.5},
    'Zhongshan':  {'lat': 25.05499,  'lng': 121.52540,  'name_zh': '中山區', 'half_km': 1.5},
    'Neihu':      {'lat': 25.0667,   'lng': 121.5833,   'name_zh': '內湖區', 'half_km': 3.0},
    'Wenshan':    {'lat': 24.9897,   'lng': 121.5722,   'name_zh': '文山區', 'half_km': 2.5},
    'Nangang':    {'lat': 25.03843,  'lng': 121.621825, 'name_zh': '南港區', 'half_km': 2.0},
    'Shilin':     {'lat': 25.0833,   'lng': 121.5170,   'name_zh': '士林區', 'half_km': 2.5},
    'Beitou':     {'lat': 25.1167,   'lng': 121.5000,   'name_zh': '北投區', 'half_km': 3.0},
}

# Singapore planning areas — 3 regions (CCR / RCR / OCR) covering the whole island.
# half_km controls the 3×3 search grid size; OCR estates are larger so use bigger cells.
SINGAPORE_DISTRICTS = {
    # ── Core Central Region (CCR) ──────────────────────────
    'Orchard':       {'lat': 1.3048,  'lng': 103.8318, 'half_km': 1.5},
    'Marina_Bay':    {'lat': 1.2847,  'lng': 103.8610, 'half_km': 1.5},
    'Tanjong_Pagar': {'lat': 1.2763,  'lng': 103.8468, 'half_km': 1.2},
    'Chinatown':     {'lat': 1.2838,  'lng': 103.8447, 'half_km': 1.0},
    'Bugis':         {'lat': 1.3005,  'lng': 103.8568, 'half_km': 1.2},
    # ── Rest of Central Region (RCR) ──────────────────────
    'Novena':        {'lat': 1.3200,  'lng': 103.8437, 'half_km': 1.3},
    'Queenstown':    {'lat': 1.2952,  'lng': 103.7860, 'half_km': 1.5},
    'Toa_Payoh':     {'lat': 1.3327,  'lng': 103.8468, 'half_km': 1.3},
    'Bishan':        {'lat': 1.3501,  'lng': 103.8480, 'half_km': 1.5},
    # ── Outside Central Region (OCR) — residential heartland
    'Tampines':      {'lat': 1.3540,  'lng': 103.9455, 'half_km': 2.5},
    'Jurong_East':   {'lat': 1.3329,  'lng': 103.7436, 'half_km': 2.0},
    'Woodlands':     {'lat': 1.4371,  'lng': 103.7861, 'half_km': 2.5},
    'Sengkang':      {'lat': 1.3910,  'lng': 103.8945, 'half_km': 2.0},
    'Punggol':       {'lat': 1.4044,  'lng': 103.9021, 'half_km': 2.0},
    'Ang_Mo_Kio':    {'lat': 1.3690,  'lng': 103.8454, 'half_km': 2.0},
    'Bedok':         {'lat': 1.3236,  'lng': 103.9273, 'half_km': 2.0},
    'Clementi':      {'lat': 1.3150,  'lng': 103.7653, 'half_km': 1.5},
    'Yishun':        {'lat': 1.4299,  'lng': 103.8362, 'half_km': 2.5},
    'Serangoon':     {'lat': 1.3554,  'lng': 103.8679, 'half_km': 1.5},
}

CATEGORY_MAP = {
    # ── F&B ──────────────────────────────────────────────────
    'coffee shop':       'cafe',
    'coffee_shop':       'cafe',
    'cafe':              'cafe',
    'restaurant':        'restaurant',
    'bakery':            'bakery',
    'beverage store':    'beverage_store',
    'beverage_store':    'beverage_store',
    'boba':              'beverage_store',
    'bubble tea':        'beverage_store',
    'hawker centre':     'hawker',
    'hawker center':     'hawker',
    'hawker':            'hawker',
    'food court':        'hawker',
    'kopitiam':          'hawker',
    # ── Retail ───────────────────────────────────────────────
    'convenience store': 'convenience_store',
    'convenience_store': 'convenience_store',
    'grocery':           'grocery',
    'grocery store':     'grocery',
    'supermarket':       'supermarket',
    # ── Health ───────────────────────────────────────────────
    'pharmacy':          'pharmacy',
    'drugstore':         'pharmacy',
    'guardian':          'pharmacy',
    'watsons':           'pharmacy',
    # ── Services ─────────────────────────────────────────────
    'gym':               'gym',
    'fitness':           'gym',
    'fitness center':    'gym',
    'coworking':         'coworking',
    'co-working':        'coworking',
    'coworking space':   'coworking',
    'childcare':         'childcare',
    'child care':        'childcare',
    'enrichment':        'childcare',
    'laundromat':        'laundromat',
    'laundry':           'laundromat',
    # ── Malls ────────────────────────────────────────────────
    'shopping mall':     'shopping_mall',
    'shopping center':   'shopping_mall',
    'shopping centre':   'shopping_mall',
    'mall':              'shopping_mall',
}

MAX_PAGES   = 3
GRID_SIZE   = 3   # 3×3 grid per district = 9 cells, ~1 km radius each
TODAY       = date.today().isoformat()


# ── Grid helpers ──────────────────────────────────────────────────────────────

def build_grid(center_lat: float, center_lng: float, half_km: float) -> list[dict]:
    """
    Divide a district bounding box into a GRID_SIZE×GRID_SIZE grid of
    overlapping search cells.  Returns list of {lat, lng, radius_m}.

    Overlap factor 1.2 ensures no gaps at cell edges.
    """
    lat_per_km  = 1 / 111.32
    lng_per_km  = 1 / (111.32 * math.cos(math.radians(center_lat)))

    step_km     = (2 * half_km) / GRID_SIZE
    radius_m    = int(step_km * 1000 * 1.2 / 2)   # with 20 % overlap
    radius_m    = max(800, min(2500, radius_m))

    cells = []
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            cell_lat = center_lat - half_km * lat_per_km + (row + 0.5) * step_km * lat_per_km
            cell_lng = center_lng - half_km * lng_per_km + (col + 0.5) * step_km * lng_per_km
            cells.append({'lat': cell_lat, 'lng': cell_lng, 'radius_m': radius_m})
    return cells


# ── Google Places fetch ───────────────────────────────────────────────────────

def fetch_cell(lat: float, lng: float, radius_m: int, keyword: str) -> list[dict]:
    """Fetch up to MAX_PAGES×20 results for one grid cell."""
    raw = []
    try:
        resp = gmaps.places_nearby(
            location=(lat, lng),
            radius=radius_m,
            keyword=keyword,
            language='en',
        )
    except Exception as e:
        print(f"    [ERROR] Google API failed: {e}")
        return []

    for page_num in range(MAX_PAGES):
        raw.extend(resp.get('results', []))
        token = resp.get('next_page_token')
        if not token or page_num == MAX_PAGES - 1:
            break
        time.sleep(2)
        try:
            resp = gmaps.places_nearby(page_token=token)
        except Exception as e:
            print(f"    [WARN] Could not fetch page {page_num + 2}: {e}")
            break

    return raw


# ── business_status → DB status ───────────────────────────────────────────────

def google_status_to_db(business_status) -> str:  # str | None
    """
    Map Google's business_status field to our DB status values.
    CLOSED_PERMANENTLY → 'closed'
    Everything else   → 'active'
    """
    if business_status == 'CLOSED_PERMANENTLY':
        return 'closed'
    return 'active'


# ── Supabase upsert ───────────────────────────────────────────────────────────

def upsert_batch(places: list[dict]) -> int:
    if not places:
        return 0
    try:
        result = supabase.table('places').upsert(
            places,
            on_conflict='google_place_id',
        ).execute()
        return len(result.data)
    except Exception as e:
        print(f"  [ERROR] Supabase upsert failed: {e}")
        return 0


# ── Main scrape ───────────────────────────────────────────────────────────────

def scrape(keyword: str, dry_run: bool, skip_closed: bool,
           districts=None) -> None:
    if districts is None:
        districts = TAIPEI_DISTRICTS
    seen_ids: set[str] = set()
    all_places: list[dict] = []
    dead_count = 0
    dup_count  = 0
    category   = CATEGORY_MAP.get(keyword.lower(), keyword.replace(' ', '_'))

    for district_name, info in districts.items():
        label = info.get('name_zh') or district_name.replace('_', ' ')
        print(f"\nSearching {district_name} ({label}) "
              f"[{GRID_SIZE}×{GRID_SIZE} grid, half_km={info['half_km']}]…")

        cells = build_grid(info['lat'], info['lng'], info['half_km'])
        district_new = 0
        district_dead = 0

        for i, cell in enumerate(cells, 1):
            raw = fetch_cell(cell['lat'], cell['lng'], cell['radius_m'], keyword)
            print(f"  Cell {i:2}/{len(cells)}: {len(raw):3} raw results  "
                  f"(r={cell['radius_m']}m)")

            for place in raw:
                pid = place.get('place_id')
                if not pid:
                    continue
                if pid in seen_ids:
                    dup_count += 1
                    continue
                seen_ids.add(pid)

                biz_status = place.get('business_status')   # Google field
                db_status  = google_status_to_db(biz_status)

                if db_status == 'closed' and skip_closed:
                    continue

                if db_status == 'closed':
                    district_dead += 1
                    dead_count    += 1

                row: dict = {
                    'google_place_id': pid,
                    'name':            place.get('name'),
                    'address':         place.get('vicinity', ''),
                    'lat':             place.get('geometry', {}).get('location', {}).get('lat'),
                    'lng':             place.get('geometry', {}).get('location', {}).get('lng'),
                    'district':        district_name,
                    'category':        category,
                    'source':          'google_maps_api',
                    'status':          db_status,
                    'rating':          place.get('rating'),
                    'review_count':    place.get('user_ratings_total'),
                    # closed_date: mark as today so the Time Machine can show
                    # when the dead-zone layer should appear.  It will be
                    # refined by update_founded_dates.py (last-review heuristic).
                    'closed_date':     TODAY if db_status == 'closed' else None,
                    # founded_date left NULL — enriched by update_founded_dates.py
                }
                all_places.append(row)
                district_new += 1

            time.sleep(0.5)   # polite pause between cells

        print(f"  → {district_new} new  |  {district_dead} dead  "
              f"(skipped {len(cells) * 60 - district_new - dup_count} dups est.)")
        time.sleep(1)   # polite pause between districts

    print(f"\n{'─' * 60}")
    print(f"Total unique places : {len(all_places)}")
    print(f"  Active            : {len(all_places) - dead_count}")
    print(f"  Permanently closed: {dead_count}  ← dead-zone candidates")
    print(f"  Cross-border dups : {dup_count}")

    if dry_run:
        print("\n[DRY RUN] Skipping Supabase upsert. Sample rows:")
        for p in all_places[:8]:
            tag = '💀' if p['status'] == 'closed' else '✅'
            print(f"  {tag} {p['district']:12} | {p['name']}")
        if len(all_places) > 8:
            print(f"  … and {len(all_places) - 8} more")
        return

    print("\nUpserting to Supabase…")
    BATCH_SIZE    = 100
    total_upserted = 0
    for i in range(0, len(all_places), BATCH_SIZE):
        batch     = all_places[i:i + BATCH_SIZE]
        upserted  = upsert_batch(batch)
        total_upserted += upserted
        print(f"  Batch {i // BATCH_SIZE + 1}: {upserted}/{len(batch)} rows upserted")

    print(f"\nDone. {total_upserted} total rows upserted.")
    print("Next: run  python update_founded_dates.py  to enrich founded_date.")
    print("      Dead stores will also get a closed_date estimate from last review.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Stage 1: scrape places (active + closed) from Google Maps into Supabase"
    )
    parser.add_argument('--category',    default='coffee shop',
                        help='Store type keyword (default: "coffee shop")')
    parser.add_argument('--city',        default='taipei',
                        choices=['taipei', 'singapore', 'all'],
                        help='City to scrape: taipei | singapore | all (default: taipei)')
    parser.add_argument('--dry-run',     action='store_true',
                        help='Print results without writing to Supabase')
    parser.add_argument('--skip-closed', action='store_true',
                        help='Omit permanently-closed places (not recommended; removes dead-zone data)')
    args = parser.parse_args()

    if args.city == 'singapore':
        districts = SINGAPORE_DISTRICTS
        city_label = 'Singapore'
    elif args.city == 'all':
        districts  = {**TAIPEI_DISTRICTS, **SINGAPORE_DISTRICTS}
        city_label = 'Taipei + Singapore'
    else:
        districts  = TAIPEI_DISTRICTS
        city_label = 'Taipei'

    print("=" * 60)
    print(f"PLACES SCRAPER  —  Stage 1  ({city_label})")
    print(f"Keyword      : {args.category}")
    print(f"Grid per dist: {GRID_SIZE}×{GRID_SIZE}  ({GRID_SIZE ** 2} cells)")
    print(f"Districts    : {len(districts)}")
    print(f"Include closed: {'NO (--skip-closed)' if args.skip_closed else 'YES (dead-zone data)'}")
    print(f"Dry run      : {args.dry_run}")
    print("=" * 60)

    scrape(keyword=args.category, dry_run=args.dry_run,
           skip_closed=args.skip_closed, districts=districts)
