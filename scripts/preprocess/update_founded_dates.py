"""
Stage 2 — Enrich Founded Dates
================================
For every place in Supabase where founded_date is NULL, this script
calls Google Places Details to fetch reviews and uses the oldest review
timestamp as a proxy for the store's founding date.

Why oldest review ≈ founded date
----------------------------------
Google Places API does not expose a store's official opening date.
The oldest available review is the best public signal. Caveat: the API
returns at most 5 reviews (sorted by relevance), so the "oldest" here
is the oldest among those 5 — not necessarily the very first review
ever left. The founded_date_confidence column is set to 'estimated'
to flag this uncertainty.

Resumable
----------
The script only processes rows where founded_date IS NULL, so it can be
interrupted and re-run safely. Already-enriched rows are never touched.

Usage
-----
  cd scripts
  python update_founded_dates.py [--limit N] [--dry-run]

  --limit N    Process at most N places (useful for testing)
  --dry-run    Fetch dates but do not write back to Supabase
"""

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime
from typing import Optional
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
    try:
        payload_b64 = token.split('.')[1]
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
supabase.postgrest.auth(SUPABASE_KEY)

# Seconds to wait between Google API calls. Each Place Details call costs
# one API request. Stay well under the 100 QPS default limit.
API_DELAY = 1.5


def get_oldest_review_date(google_place_id: str) -> Optional[str]:
    """
    Fetches Place Details for the given ID and returns the date of the
    oldest review as 'YYYY-MM-DD', or None if no reviews are available.

    Note: Google returns at most 5 reviews. The oldest among them is used
    as the estimated founded date.
    """
    try:
        details = gmaps.place(
            place_id=google_place_id,
            fields=['review'],
            language='en',
        )
        reviews = details.get('result', {}).get('reviews', [])
        if not reviews:
            return None

        oldest = min(reviews, key=lambda r: r.get('time', float('inf')))
        if 'time' in oldest:
            return datetime.fromtimestamp(oldest['time']).strftime('%Y-%m-%d')

    except Exception as e:
        print(f"    [WARN] Could not fetch reviews for {google_place_id}: {e}")

    return None


def enrich(limit: Optional[int], dry_run: bool) -> None:
    # Fetch only places that still need enrichment
    query = (
        supabase.table('places')
        .select('id, name, google_place_id')
        .is_('founded_date', 'null')
        .not_.is_('google_place_id', 'null')  # skip seed rows with no Place ID
    )
    if limit:
        query = query.limit(limit)

    response = query.execute()
    places   = response.data

    if not places:
        print("All places already have a founded_date. Nothing to do.")
        return

    print(f"Found {len(places)} places to enrich.")
    if dry_run:
        print("[DRY RUN] Will fetch dates but not write to Supabase.\n")

    found     = 0
    not_found = 0

    for i, place in enumerate(places, start=1):
        gid  = place['google_place_id']
        name = place.get('name', gid)
        print(f"[{i}/{len(places)}] {name}")

        date = get_oldest_review_date(gid)

        if date:
            print(f"  → oldest review: {date}")
            found += 1
            if not dry_run:
                try:
                    supabase.table('places').update({
                        'founded_date':            date,
                        'founded_date_confidence': 'estimated',
                    }).eq('id', place['id']).execute()
                except Exception as e:
                    print(f"  [ERROR] Supabase update failed: {e}")
        else:
            print(f"  → no reviews found, skipping")
            not_found += 1

        time.sleep(API_DELAY)

    print(f"\n{'─' * 50}")
    print(f"Enriched : {found}")
    print(f"No reviews: {not_found}")
    if dry_run:
        print("[DRY RUN] No data was written.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stage 2: enrich founded_date from Google review timestamps")
    parser.add_argument('--limit',   type=int, default=None, help='Max number of places to process')
    parser.add_argument('--dry-run', action='store_true',    help='Fetch dates but do not write to Supabase')
    args = parser.parse_args()

    print("=" * 50)
    print("FOUNDED DATE ENRICHER  —  Stage 2 of 2")
    print(f"Limit  : {args.limit or 'all'}")
    print(f"Dry run: {args.dry_run}")
    print("=" * 50)
    print()

    enrich(limit=args.limit, dry_run=args.dry_run)
