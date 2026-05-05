"""
Stage 1 — Scrape & Store
========================
Fetches places from Google Places API and upserts them into PostgreSQL.
Both ACTIVE and PERMANENTLY CLOSED stores are captured so the
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
  OPERATIONAL        → status = 'active'
  CLOSED_TEMPORARILY → status = 'active'  (re-check later)
  CLOSED_PERMANENTLY → status = 'closed'  + closed_date = today

Pass --skip-closed to omit permanently-closed stores (not recommended for
production; dead zones give valuable BI signal to business owners).

Usage
-----
  cd scripts/fetch
  python fetch_places.py --city singapore --category "coffee shop"
  python fetch_places.py --city singapore --category "hawker centre" --dry-run
"""

import argparse
import math
import os
import sys
import time
from datetime import date
from dotenv import load_dotenv
import googlemaps
import psycopg2
import psycopg2.extras

# ── Environment ───────────────────────────────────────────────────────────────
# Script lives at scripts/fetch/ — go up two levels to reach project root
env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env.local')
load_dotenv(dotenv_path=env_path)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
DATABASE_URL        = os.getenv("DATABASE_URL")

if not GOOGLE_MAPS_API_KEY:
    sys.exit("ERROR: GOOGLE_MAPS_API_KEY is not set in .env.local")
if not DATABASE_URL:
    sys.exit("ERROR: DATABASE_URL is not set in .env.local")

gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)

# ── District definitions ──────────────────────────────────────────────────────
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

MAX_PAGES = 3
GRID_SIZE = 3   # 3×3 grid per district = 9 cells
TODAY     = date.today().isoformat()


# ── Grid helpers ──────────────────────────────────────────────────────────────

def build_grid(center_lat, center_lng, half_km):
    lat_per_km = 1 / 111.32
    lng_per_km = 1 / (111.32 * math.cos(math.radians(center_lat)))

    step_km  = (2 * half_km) / GRID_SIZE
    radius_m = int(step_km * 1000 * 1.2 / 2)
    radius_m = max(800, min(2500, radius_m))

    cells = []
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            cell_lat = center_lat - half_km * lat_per_km + (row + 0.5) * step_km * lat_per_km
            cell_lng = center_lng - half_km * lng_per_km + (col + 0.5) * step_km * lng_per_km
            cells.append({'lat': cell_lat, 'lng': cell_lng, 'radius_m': radius_m})
    return cells


# ── Google Places fetch ───────────────────────────────────────────────────────

def fetch_cell(lat, lng, radius_m, keyword):
    raw = []
    try:
        resp = gmaps.places_nearby(location=(lat, lng), radius=radius_m,
                                   keyword=keyword, language='en')
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


def google_status_to_db(business_status):
    if business_status == 'CLOSED_PERMANENTLY':
        return 'closed'
    return 'active'


# ── PostgreSQL upsert ─────────────────────────────────────────────────────────

UPSERT_SQL = """
    INSERT INTO places (
        google_place_id, name, address, lat, lng,
        district, city, category, source, status,
        rating, review_count, closed_date
    ) VALUES (
        %(google_place_id)s, %(name)s, %(address)s, %(lat)s, %(lng)s,
        %(district)s, %(city)s, %(category)s, %(source)s, %(status)s,
        %(rating)s, %(review_count)s, %(closed_date)s
    )
    ON CONFLICT (google_place_id) DO UPDATE SET
        name         = EXCLUDED.name,
        address      = EXCLUDED.address,
        lat          = EXCLUDED.lat,
        lng          = EXCLUDED.lng,
        district     = EXCLUDED.district,
        city         = EXCLUDED.city,
        category     = EXCLUDED.category,
        source       = EXCLUDED.source,
        status       = EXCLUDED.status,
        rating       = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        closed_date  = EXCLUDED.closed_date
"""

def upsert_batch(conn, places):
    if not places:
        return 0
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, UPSERT_SQL, places, page_size=100)
        conn.commit()
        return len(places)
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] DB upsert failed: {e}")
        return 0


# ── Main scrape ───────────────────────────────────────────────────────────────

def scrape(keyword, dry_run, skip_closed, districts = None, city = 'singapore'):
    if districts is None:
        districts = SINGAPORE_DISTRICTS

    conn = None if dry_run else psycopg2.connect(DATABASE_URL)

    seen_ids  = set()
    all_places = []
    dead_count = 0
    dup_count  = 0
    category   = CATEGORY_MAP.get(keyword.lower(), keyword.replace(' ', '_'))

    for district_name, info in districts.items():
        label = info.get('name_zh') or district_name.replace('_', ' ')
        print(f"\nSearching {district_name} ({label}) "
              f"[{GRID_SIZE}×{GRID_SIZE} grid, half_km={info['half_km']}]…")

        cells = build_grid(info['lat'], info['lng'], info['half_km'])
        district_new  = 0
        district_dead = 0

        for i, cell in enumerate(cells, 1):
            raw = fetch_cell(cell['lat'], cell['lng'], cell['radius_m'], keyword)
            print(f"  Cell {i:2}/{len(cells)}: {len(raw):3} raw results  "
                  f"(r={cell['radius_m']}m)")

            for place in raw:
                pid = place.get('place_id')
                if not pid or pid in seen_ids:
                    dup_count += 1
                    continue
                seen_ids.add(pid)

                db_status = google_status_to_db(place.get('business_status'))
                if db_status == 'closed' and skip_closed:
                    continue
                if db_status == 'closed':
                    district_dead += 1
                    dead_count    += 1

                all_places.append({
                    'google_place_id': pid,
                    'name':            place.get('name'),
                    'address':         place.get('vicinity', ''),
                    'lat':             place.get('geometry', {}).get('location', {}).get('lat'),
                    'lng':             place.get('geometry', {}).get('location', {}).get('lng'),
                    'district':        district_name,
                    'city':            city,
                    'category':        category,
                    'source':          'google_maps_api',
                    'status':          db_status,
                    'rating':          place.get('rating'),
                    'review_count':    place.get('user_ratings_total'),
                    'closed_date':     TODAY if db_status == 'closed' else None,
                })
                district_new += 1

            time.sleep(0.5)

        print(f"  → {district_new} new  |  {district_dead} dead  "
              f"(~{dup_count} dups so far)")
        time.sleep(1)

    print(f"\n{'─' * 60}")
    print(f"Total unique places : {len(all_places)}")
    print(f"  Active            : {len(all_places) - dead_count}")
    print(f"  Permanently closed: {dead_count}  ← dead-zone candidates")
    print(f"  Cross-border dups : {dup_count}")

    if dry_run:
        print("\n[DRY RUN] Skipping DB upsert. Sample rows:")
        for p in all_places[:8]:
            tag = '💀' if p['status'] == 'closed' else '✅'
            print(f"  {tag} {p['district']:12} | {p['name']}")
        if len(all_places) > 8:
            print(f"  … and {len(all_places) - 8} more")
        return

    print("\nUpserting to PostgreSQL…")
    BATCH_SIZE    = 100
    total_upserted = 0
    for i in range(0, len(all_places), BATCH_SIZE):
        batch     = all_places[i:i + BATCH_SIZE]
        upserted  = upsert_batch(conn, batch)
        total_upserted += upserted
        print(f"  Batch {i // BATCH_SIZE + 1}: {upserted}/{len(batch)} rows upserted")

    if conn:
        conn.close()

    print(f"\nDone. {total_upserted} total rows upserted.")
    print("Next: run  python preprocess/update_founded_dates.py  to enrich founded_date.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Stage 1: scrape places (active + closed) from Google Maps into PostgreSQL"
    )
    parser.add_argument('--category',    default='coffee shop',
                        help='Store type keyword (default: "coffee shop")')
    parser.add_argument('--city',        default='singapore',
                        choices=['taipei', 'singapore', 'all'],
                        help='City to scrape: taipei | singapore | all (default: singapore)')
    parser.add_argument('--dry-run',     action='store_true',
                        help='Print results without writing to DB')
    parser.add_argument('--skip-closed', action='store_true',
                        help='Omit permanently-closed places (removes dead-zone data)')
    args = parser.parse_args()

    if args.city == 'singapore':
        districts  = SINGAPORE_DISTRICTS
        city_label = 'Singapore'
        city_key   = 'singapore'
    elif args.city == 'all':
        districts  = {**TAIPEI_DISTRICTS, **SINGAPORE_DISTRICTS}
        city_label = 'Taipei + Singapore'
        city_key   = 'all'
    else:
        districts  = TAIPEI_DISTRICTS
        city_label = 'Taipei'
        city_key   = 'taipei'

    print("=" * 60)
    print(f"PLACES SCRAPER  —  Stage 1  ({city_label})")
    print(f"Keyword      : {args.category}")
    print(f"Grid per dist: {GRID_SIZE}×{GRID_SIZE}  ({GRID_SIZE ** 2} cells)")
    print(f"Districts    : {len(districts)}")
    print(f"Include closed: {'NO (--skip-closed)' if args.skip_closed else 'YES (dead-zone data)'}")
    print(f"Dry run      : {args.dry_run}")
    print("=" * 60)

    scrape(keyword=args.category, dry_run=args.dry_run,
           skip_closed=args.skip_closed, districts=districts, city=city_key)
