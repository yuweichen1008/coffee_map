"""
Seed Social Signals — Consulting Feature
=========================================
Populates the `social_signals` table for Da'an + Xinyi districts using
Google rating/review_count data already in the DB.  Zero new API calls.

Usage:
  python scripts/seed_social_signals.py [--districts Daan Xinyi ...] [--dry-run]

How scores are computed
-----------------------
Each place gets 1–3 platforms assigned based on its category and name.
The score is derived from:
  - Google review_count  (normalised to 0–60)
  - Google rating        (contributes 0–20)
  - ±12 random jitter    (realism)

Platform assignment heuristic
------------------------------
  indie/specialty cafe   → instagram + threads
  chain cafe             → facebook + instagram
  boba / beverage        → tiktok + instagram
  restaurant             → facebook + line
  convenience / grocery  → facebook + line
  bakery                 → instagram + threads
"""

import argparse
import os
import random
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

try:
    from supabase import create_client
except ImportError:
    sys.exit("ERROR: supabase-py not installed.  Run:  pip install supabase")

# ── DDL to create the social_signals table ────────────────────────────────────
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS public.social_signals (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      uuid    NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  platform      text    NOT NULL
    CHECK (platform IN ('instagram','tiktok','facebook','threads','line')),
  score         integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  mention_count integer,
  source        text    DEFAULT 'seed',
  last_updated  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_signals_place_platform_uniq
  ON public.social_signals (place_id, platform);
CREATE INDEX IF NOT EXISTS social_signals_place_idx
  ON public.social_signals (place_id);
CREATE INDEX IF NOT EXISTS social_signals_score_idx
  ON public.social_signals (score DESC);
CREATE INDEX IF NOT EXISTS social_signals_platform_idx
  ON public.social_signals (platform);
"""


def ensure_table(supabase_url: str, service_role_key: str) -> bool:
    """
    Tries three paths to create social_signals if it doesn't exist:
      1. Supabase Management API  (needs SUPABASE_ACCESS_TOKEN in env)
      2. psycopg2 direct Postgres (needs DATABASE_URL in env)
      3. Prints SQL + SQL Editor URL for manual run, then exits.
    Returns True if the table now exists.
    """
    import requests as req

    project_ref = supabase_url.replace('https://', '').split('.')[0]
    sql_editor_url = (
        f'https://supabase.com/dashboard/project/{project_ref}/sql/new'
    )

    # ── Path 1: Supabase Management API ──────────────────────────────────────
    access_token = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
    if access_token:
        print('Attempting table creation via Supabase Management API…')
        resp = req.post(
            f'https://api.supabase.com/v1/projects/{project_ref}/database/query',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json',
            },
            json={'query': CREATE_TABLE_SQL},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            print('social_signals table created via Management API.')
            return True
        print(f'  Management API returned {resp.status_code}: {resp.text[:200]}')

    # ── Path 2: psycopg2 direct connection ───────────────────────────────────
    db_url = os.environ.get('DATABASE_URL', '')
    if db_url:
        try:
            import psycopg2
            print('Attempting table creation via direct Postgres connection…')
            conn = psycopg2.connect(db_url)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(CREATE_TABLE_SQL)
            cur.close()
            conn.close()
            print('social_signals table created via direct connection.')
            return True
        except Exception as e:
            print(f'  psycopg2 error: {e}')

    # ── Path 3: Print manual instructions and exit ────────────────────────────
    print()
    print('=' * 70)
    print('ACTION REQUIRED — create the social_signals table first')
    print('=' * 70)
    print()
    print('  1. Open the Supabase SQL Editor for this project:')
    print(f'     {sql_editor_url}')
    print()
    print('  2. Paste and run the following SQL:')
    print()
    print('     ' + CREATE_TABLE_SQL.strip().replace('\n', '\n     '))
    print()
    print('  3. Re-run this script.')
    print()
    print('  OPTIONAL — to skip this step in future, add one of:')
    print('    SUPABASE_ACCESS_TOKEN=<your-pat>  (from supabase.com/dashboard/account/tokens)')
    print('    DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres')
    print('  to your .env.local file.')
    print()
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")

# Chains that are well-known on Facebook/Instagram
CHAIN_KEYWORDS = [
    'starbucks', 'louisa', 'louisa coffee', 'mccafe', 'mcdonalds',
    '7-eleven', '7eleven', 'familymart', 'hilife', 'hi-life',
    'ikari', 'cama', 'komeda', 'hwc', 'rufous',
]

# Known indie/specialty keywords → instagram + threads
INDIE_KEYWORDS = [
    'roast', 'roaster', 'specialty', 'brew', 'pour over',
    'single origin', 'artisan', 'artisanal', 'craft',
    '咖啡', '手沖', '自家烘焙', 'barista',
]


def _is_chain(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in CHAIN_KEYWORDS)


def _is_indie(name: str, category: str) -> bool:
    n = name.lower()
    return category in ('cafe', 'coffee') and any(k in n for k in INDIE_KEYWORDS)


def _platforms_for(name: str, category: str):
    """Return list of (platform, weight_multiplier) tuples for a place."""
    if _is_chain(name):
        return [('facebook', 1.1), ('instagram', 0.85)]
    if _is_indie(name, category):
        return [('instagram', 1.15), ('threads', 0.90)]
    if category in ('cafe', 'coffee'):
        # Default cafe: instagram-first, sometimes threads
        return [('instagram', 1.0), ('threads', 0.7)]
    if category in ('beverage_store', 'boba'):
        return [('tiktok', 1.1), ('instagram', 0.9)]
    if category == 'bakery':
        return [('instagram', 1.1), ('threads', 0.75)]
    if category == 'restaurant':
        return [('facebook', 1.0), ('line', 0.85)]
    # convenience_store, grocery, etc.
    return [('facebook', 0.85), ('line', 0.70)]


def _compute_score(review_count, rating, multiplier: float) -> int:
    """Derive a 0–100 trend score from existing Google data."""
    review_count = review_count or 0
    rating = rating or 3.5

    # Normalise review_count: 90th-pct ≈ 500 reviews → score 60
    base = min(review_count / 500, 1.0) * 60

    # Rating contribution: 3.5 baseline, 5.0 → +20
    rating_boost = max(0.0, (rating - 3.5) / 1.5) * 20

    raw = (base + rating_boost) * multiplier
    jitter = random.randint(-12, 12)
    return max(5, min(100, round(raw + jitter)))


def seed(districts: list, dry_run: bool = False):
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Verify the table exists (and auto-create if possible)
    try:
        sb.from_('social_signals').select('id').limit(0).execute()
    except Exception as e:
        if 'PGRST205' in str(e) or 'social_signals' in str(e):
            ensure_table(SUPABASE_URL, SUPABASE_KEY)
        else:
            raise

    print(f"Districts : {', '.join(districts)}")
    print(f"Dry run   : {dry_run}")
    print()

    # Fetch places for target districts
    response = (
        sb.from_('places')
        .select('id,name,category,rating,review_count,district')
        .in_('district', districts)
        .eq('status', 'active')
        .execute()
    )
    places = response.data or []
    print(f"Fetched {len(places)} active places from {', '.join(districts)}")

    if not places:
        print("No places found — check district names and DB.")
        return

    # Build upsert rows
    rows = []
    now = datetime.now(timezone.utc).isoformat()
    random.seed(42)  # reproducible

    for place in places:
        pid      = place['id']
        name     = place.get('name') or ''
        category = place.get('category') or 'cafe'
        rating   = place.get('rating')
        reviews  = place.get('review_count')

        for platform, mult in _platforms_for(name, category):
            score = _compute_score(reviews, rating, mult)
            mention = max(10, round(score * 2.5 + random.randint(-20, 20)))
            rows.append({
                'place_id':      pid,
                'platform':      platform,
                'score':         score,
                'mention_count': mention,
                'source':        'seed',
                'last_updated':  now,
            })

    print(f"Generated {len(rows)} signal rows across platforms:")
    from collections import Counter
    pc = Counter(r['platform'] for r in rows)
    for p, c in sorted(pc.items()):
        print(f"  {p:12s} {c:4d} rows")
    print()

    if dry_run:
        print("[DRY RUN] Sample rows:")
        for r in rows[:8]:
            place_name = next((p['name'] for p in places if p['id'] == r['place_id']), '?')
            print(f"  {r['platform']:12s} score={r['score']:3d}  {place_name[:40]}")
        print(f"  … and {max(0, len(rows) - 8)} more")
        return

    # Upsert in batches of 200
    BATCH = 200
    upserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        sb.from_('social_signals').upsert(
            batch,
            on_conflict='place_id,platform',
        ).execute()
        upserted += len(batch)
        print(f"  Upserted batch {i // BATCH + 1}: {upserted}/{len(rows)}")

    print(f"\nDone. {upserted} rows in social_signals.")


def main():
    parser = argparse.ArgumentParser(description='Seed social_signals table')
    parser.add_argument(
        '--districts', nargs='+',
        default=['Daan', 'Xinyi'],
        help='District names to seed (default: Daan Xinyi)',
    )
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing to DB')
    args = parser.parse_args()
    seed(districts=args.districts, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
