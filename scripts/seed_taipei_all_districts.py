"""
Stage 1 — Scrape & Store
========================
Fetches all coffee shops across Taipei from Google Places API and upserts
them into Supabase. founded_date is left NULL here; run update_founded_dates.py
(Stage 2) afterwards to enrich it.

Deduplication strategy
-----------------------
Google Places API returns ~60 results per search (3 pages × 20). Shops near
district borders appear in multiple district searches. We track every
google_place_id we've already processed in a set and skip any repeat,
regardless of which district search returned it.

Usage
-----
  cd scripts
  python seed_taipei_all_districts.py [--category CATEGORY] [--dry-run]

  --category   Store type keyword sent to Google (default: coffee shop)
  --dry-run    Print results but do not write to Supabase
"""

import argparse
import base64
import json
import os
import sys
import time
from dotenv import load_dotenv
import googlemaps
from supabase import create_client, Client

# ── Environment ──────────────────────────────────────────────────────────────
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
    """Decode the JWT payload (no signature verification) and return the role claim."""
    try:
        payload_b64 = token.split('.')[1]
        # Add padding so base64 doesn't complain
        payload_b64 += '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.b64decode(payload_b64))
        return payload.get('role', 'unknown')
    except Exception:
        return 'unknown'


_key_role = _jwt_role(SUPABASE_KEY)
if _key_role != 'service_role':
    sys.exit(
        f"ERROR: SUPABASE_SERVICE_ROLE_KEY has role='{_key_role}' — expected 'service_role'.\n"
        "  → In your Supabase dashboard: Settings → API → copy the 'service_role' key (not 'anon').\n"
        "  → Update SUPABASE_SERVICE_ROLE_KEY in .env.local and retry."
    )

gmaps: googlemaps.Client = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
supabase: Client         = create_client(SUPABASE_URL, SUPABASE_KEY)
# supabase-py v2 sends the key as `apikey` but not as `Authorization: Bearer`,
# so PostgREST doesn't see the service role and RLS blocks writes.
# Explicitly setting auth here fixes that.
supabase.postgrest.auth(SUPABASE_KEY)

# ── District definitions ─────────────────────────────────────────────────────
# Center coordinates only. Bounds-polygon support is in the districts table;
# these centers are used to anchor the Places API search.
TAIPEI_DISTRICTS = {
    'Daan':       {'lat': 25.026,    'lng': 121.543,    'name_zh': '大安區'},
    'Xinyi':      {'lat': 25.0348,   'lng': 121.5677,   'name_zh': '信義區'},
    'Wanhua':     {'lat': 25.026285, 'lng': 121.497032, 'name_zh': '萬華區'},
    'Datong':     {'lat': 25.063,    'lng': 121.511,    'name_zh': '大同區'},
    'Zhongzheng': {'lat': 25.03236,  'lng': 121.51827,  'name_zh': '中正區'},
    'Songshan':   {'lat': 25.055,    'lng': 121.554,    'name_zh': '松山區'},
    'Zhongshan':  {'lat': 25.05499,  'lng': 121.52540,  'name_zh': '中山區'},
    'Neihu':      {'lat': 25.0667,   'lng': 121.5833,   'name_zh': '內湖區'},
    'Wenshan':    {'lat': 24.9897,   'lng': 121.5722,   'name_zh': '文山區'},
    'Nangang':    {'lat': 25.03843,  'lng': 121.621825, 'name_zh': '南港區'},
    'Shilin':     {'lat': 25.0833,   'lng': 121.5170,   'name_zh': '士林區'},
    'Beitou':     {'lat': 25.1167,   'lng': 121.5000,   'name_zh': '北投區'},
}

# Google Places Nearby returns max 3 pages × 20 results = 60 per search.
MAX_PAGES   = 3
SEARCH_RADIUS = 2500  # metres — covers most districts; large ones (Neihu, Beitou) need multiple passes


def fetch_district_places(district_name: str, coords: dict, keyword: str) -> list[dict]:
    """
    Fetches up to MAX_PAGES pages of results for one district.
    Returns a list of raw Google Places result dicts.
    """
    raw_results = []
    try:
        response = gmaps.places_nearby(
            location=(coords['lat'], coords['lng']),
            radius=SEARCH_RADIUS,
            keyword=keyword,
            language='en',
        )
    except Exception as e:
        print(f"  [ERROR] Google Places API call failed for {district_name}: {e}")
        return []

    for page_num in range(MAX_PAGES):
        raw_results.extend(response.get('results', []))

        next_token = response.get('next_page_token')
        if not next_token or page_num == MAX_PAGES - 1:
            break

        # Google requires a short delay before the next_page_token becomes valid
        time.sleep(2)
        try:
            response = gmaps.places_nearby(page_token=next_token)
        except Exception as e:
            print(f"  [WARN] Could not fetch page {page_num + 2} for {district_name}: {e}")
            break

    return raw_results


def upsert_to_supabase(places: list[dict]) -> int:
    """
    Upserts a list of place dicts into Supabase.
    Returns the number of rows upserted.
    """
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


def scrape(keyword: str, dry_run: bool) -> None:
    # google_place_id set — deduplicates across all district searches
    seen_place_ids: set[str] = set()
    all_places: list[dict]   = []
    duplicate_count          = 0

    for district_name, coords in TAIPEI_DISTRICTS.items():
        print(f"\nSearching {district_name} ({coords['name_zh']})...")
        raw = fetch_district_places(district_name, coords, keyword)
        print(f"  Google returned {len(raw)} raw results")

        new_this_district = 0
        for place in raw:
            place_id = place.get('place_id')
            if not place_id:
                continue

            if place_id in seen_place_ids:
                duplicate_count += 1
                continue

            seen_place_ids.add(place_id)
            new_this_district += 1

            all_places.append({
                'google_place_id': place_id,
                'name':            place.get('name'),
                'address':         place.get('vicinity', ''),
                'lat':             place.get('geometry', {}).get('location', {}).get('lat'),
                'lng':             place.get('geometry', {}).get('location', {}).get('lng'),
                'district':        district_name,
                'category':        keyword.replace(' ', '_'),  # e.g. 'coffee_shop' → normalised below
                'source':          'google_maps_api',
                'status':          'active',
                # founded_date intentionally omitted — enriched by update_founded_dates.py
            })

        print(f"  {new_this_district} new unique places (skipped {len(raw) - new_this_district} duplicates)")
        time.sleep(1)  # polite pause between district searches

    # Normalise category to match the categories table slugs
    category_map = {
        'coffee shop':       'cafe',
        'coffee_shop':       'cafe',
        'cafe':              'cafe',
        'convenience store': 'convenience_store',
        'grocery':           'grocery',
        'restaurant':        'restaurant',
        'bakery':            'bakery',
        'beverage store':    'beverage_store',
    }
    for p in all_places:
        p['category'] = category_map.get(p['category'].lower(), p['category'])

    print(f"\n{'─' * 50}")
    print(f"Total unique places collected : {len(all_places)}")
    print(f"Cross-district duplicates skipped: {duplicate_count}")

    if dry_run:
        print("\n[DRY RUN] Skipping Supabase upsert.")
        for p in all_places[:5]:
            print(f"  {p['district']:12} | {p['name']}")
        if len(all_places) > 5:
            print(f"  ... and {len(all_places) - 5} more")
        return

    print("\nUpserting to Supabase...")
    # Batch in chunks of 100 to avoid request size limits
    BATCH_SIZE = 100
    total_upserted = 0
    for i in range(0, len(all_places), BATCH_SIZE):
        batch = all_places[i:i + BATCH_SIZE]
        upserted = upsert_to_supabase(batch)
        total_upserted += upserted
        print(f"  Batch {i // BATCH_SIZE + 1}: {upserted}/{len(batch)} rows upserted")

    print(f"\nDone. {total_upserted} total rows upserted.")
    print("Next step: run  python update_founded_dates.py  to enrich founded_date.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stage 1: scrape Taipei places from Google Maps into Supabase")
    parser.add_argument('--category', default='coffee shop', help='Store type keyword (default: "coffee shop")')
    parser.add_argument('--dry-run',  action='store_true',   help='Print results without writing to Supabase')
    args = parser.parse_args()

    print("=" * 50)
    print("TAIPEI PLACES SCRAPER  —  Stage 1 of 2")
    print(f"Keyword  : {args.category}")
    print(f"Districts: {len(TAIPEI_DISTRICTS)}")
    print(f"Dry run  : {args.dry_run}")
    print("=" * 50)

    scrape(keyword=args.category, dry_run=args.dry_run)
