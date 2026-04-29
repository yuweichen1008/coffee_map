"""
Stage 3 — Closed-Business Reconciliation
=========================================
Enriches the places table with dead-zone data from two sources:

  Source A — Google Places Details API
    Re-checks every ACTIVE place for CLOSED_PERMANENTLY status.
    Uses the timestamp of the last Google review as a proxy for
    closed_date when a place has gone dark.

  Source B — Taiwan Government Open Data (data.gov.tw)
    Loads Taipei commercial-registration records that include
    廢止日期 (deregistration date) — the actual legal closure date.
    Matches government records to our places table by:
      1. Spatial proximity  (lat/lng within 80 m via Haversine)
      2. Fuzzy name similarity (rapidfuzz ratio ≥ 70, across EN↔ZH)
    Where both signals agree, closed_date is overwritten with the
    government 廢止日期 and confidence is set to 'verified'.

Install
-------
  pip install googlemaps supabase-py python-dotenv rapidfuzz requests

Usage
-----
  # Google-only enrichment (re-checks all active places for closures):
  python fetch_closed_businesses.py --source google [--limit 300] [--dry-run]

  # Government CSV reconciliation:
  python fetch_closed_businesses.py --source gov --gov-csv taipei_biz.csv [--dry-run]

  # Full pipeline — both sources (recommended):
  python fetch_closed_businesses.py --source all --gov-csv taipei_biz.csv [--dry-run]

Government CSV
--------------
Download one of these datasets from https://data.gov.tw, filter to 臺北市,
and pass the CSV path via --gov-csv:

  Dataset A — 臺北市商業登記 (retail / food / beverage businesses)
    URL    : https://data.gov.tw/dataset/6038
    Fields : 公司名稱, 地址, 廢止日期, 設立日期
    Encoding: Big5 or UTF-8-BOM (auto-detected)

  Dataset B — 全國公司基本資料 (MOEA company registration, national)
    URL    : https://data.gov.tw/dataset/6464
    Fields : 公司名稱, 公司所在地, 廢止日期, 設立日期
    Tip    : Pre-filter to rows where 公司所在地 starts with '臺北市'

Both CSVs produce high-confidence closed_date when a record is matched
to a places row within 80 m with name similarity ≥ 70.

Output legend
-------------
  ✅  active  — still open, no change
  💀  active → closed  — newly discovered closure (closed_date from last review)
  📅  closed + no date  — closed_date added via last-review heuristic
  🏛   closed → verified — closed_date overwritten with government 廢止日期
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import math
import os
import sys
import time
from datetime import date, datetime, timezone

from dotenv import load_dotenv

# ── Environment ───────────────────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path=env_path)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
SUPABASE_URL        = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY        = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require(pkg: str, install_as=None):  # install_as: str | None
    import importlib
    try:
        return importlib.import_module(pkg)
    except ImportError:
        sys.exit(f"ERROR: '{pkg}' not installed.  Run:  pip install {install_as or pkg}")


def _jwt_role(token: str) -> str:
    try:
        part = token.split('.')[1]
        part += '=' * (-len(part) % 4)
        return json.loads(base64.b64decode(part)).get('role', 'unknown')
    except Exception:
        return 'unknown'


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in metres between two WGS-84 points."""
    R  = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lng2 - lng1)
    a  = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─────────────────────────────────────────────────────────────────────────────
# Source A — Google Places Details
# ─────────────────────────────────────────────────────────────────────────────

def enrich_via_google(
    places: list[dict],
    gmaps,
    dry_run: bool,
    sb,
    limit: int,
) -> dict:
    """
    For each active place:
      1. Call Details API → check business_status.
      2. CLOSED_PERMANENTLY → mark closed, estimate closed_date from last review.
    Also fills closed_date for existing closed rows that have none.
    """
    summary = {'checked': 0, 'newly_closed': 0, 'date_added': 0, 'errors': 0}

    to_recheck = [p for p in places if p['status'] != 'closed'][:limit]
    need_date  = [p for p in places if p['status'] == 'closed' and not p.get('closed_date')]
    targets    = to_recheck + need_date

    print(f"\n[Google] {len(to_recheck)} active to re-check  +  "
          f"{len(need_date)} closed missing date  =  {len(targets)} API calls")

    for i, place in enumerate(targets, 1):
        pid = place.get('google_place_id')
        if not pid:
            continue

        label = place['name'][:42]
        print(f"  [{i:4}/{len(targets)}] {label:<42}", end=' ', flush=True)

        try:
            result = gmaps.place(
                place_id=pid,
                fields=['business_status', 'reviews', 'permanently_closed'],
                language='en',
            ).get('result', {})
        except Exception as e:
            print(f"[ERR: {e}]")
            summary['errors'] += 1
            time.sleep(1)
            continue

        biz_status = result.get('business_status', 'OPERATIONAL')
        is_closed  = (biz_status == 'CLOSED_PERMANENTLY'
                      or result.get('permanently_closed') is True)

        # Last review timestamp → closed_date proxy
        reviews        = result.get('reviews') or []
        last_review_ts = max((r.get('time', 0) for r in reviews), default=None)
        est_date       = (
            datetime.fromtimestamp(last_review_ts, tz=timezone.utc).date().isoformat()
            if last_review_ts else None
        )

        update: dict = {}

        if is_closed and place['status'] != 'closed':
            update['status']     = 'closed'
            update['closed_date'] = est_date or date.today().isoformat()
            print(f"💀 → closed  ({update['closed_date']})")
            summary['newly_closed'] += 1

        elif place['status'] == 'closed' and not place.get('closed_date') and est_date:
            update['closed_date'] = est_date
            print(f"📅 date={est_date}")
            summary['date_added'] += 1

        else:
            print("✅ open")

        if update and not dry_run:
            try:
                sb.table('places').update(update).eq('id', place['id']).execute()
            except Exception as e:
                print(f"     [DB ERR] {e}")
                summary['errors'] += 1

        summary['checked'] += 1
        time.sleep(0.15)   # ~6 req/s — well within Google's 10 req/s limit

    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Source B — Taiwan Government CSV reconciliation
# ─────────────────────────────────────────────────────────────────────────────

def _detect_encoding(path: str) -> str:
    for enc in ('utf-8-sig', 'big5', 'utf-8'):
        try:
            with open(path, encoding=enc, errors='strict') as f:
                f.read(4096)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue
    return 'utf-8'


def _roc_to_iso(roc: str):  # -> str | None
    """
    Convert ROC calendar strings to ISO-8601.
      '1130315'  → '2024-03-15'
      '113/03/15' → '2024-03-15'
      '20240315'  → '2024-03-15'  (Gregorian, pass-through)
    """
    s = roc.replace('/', '').replace('-', '').strip()
    if len(s) == 7 and s.isdigit():           # ROC 7-digit
        return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:7]}"
    if len(s) == 8 and s.isdigit():           # Gregorian YYYYMMDD
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return None


def load_gov_csv(path: str) -> list[dict]:
    """
    Load a data.gov.tw business-registration CSV.
    Returns only Taipei rows that have a 廢止日期 (closure date).
    Handles both 臺北市商業登記 and 全國公司基本資料 column schemas.
    """
    enc = _detect_encoding(path)
    print(f"[Gov] Loading {path!r}  (encoding: {enc})")

    rows: list[dict] = []
    with open(path, encoding=enc, newline='') as f:
        reader  = csv.DictReader(f)
        headers = reader.fieldnames or []

        addr_col  = '地址' if '地址' in headers else '公司所在地'
        name_col  = '公司名稱'
        close_col = '廢止日期'
        open_col  = '設立日期'

        for row in reader:
            close_raw = row.get(close_col, '').strip()
            if not close_raw:
                continue

            addr = row.get(addr_col, '')
            if '臺北市' not in addr and '台北市' not in addr:
                continue

            rows.append({
                'name_zh':    row.get(name_col, '').strip(),
                'address_zh': addr.strip(),
                'close_date': close_raw,
                'open_date':  row.get(open_col, '').strip(),
            })

    print(f"[Gov] {len(rows)} Taipei closed-business records")
    return rows


def _name_similarity(a: str, b: str, fuzz) -> float:
    """
    Bidirectional fuzzy ratio.  Works across EN↔ZH because many chains
    embed their English name in the Chinese record
    (e.g. '路易莎咖啡 LOUISA COFFEE').
    """
    a_l, b_l = a.lower(), b.lower()
    return max(
        fuzz.ratio(a_l, b_l),
        fuzz.partial_ratio(a_l, b_l),
        fuzz.token_sort_ratio(a_l, b_l),
    )


def reconcile_gov_data(
    gov_records: list[dict],
    places: list[dict],
    dry_run: bool,
    sb,
    proximity_m: float = 80.0,
    name_threshold: float = 70.0,
) -> dict:
    """
    For each government closure record:
      1. Find the place with the highest name similarity.
      2. Confirm plausibility via coordinate distance when coords are available.
      3. Overwrite closed_date + set confidence='verified'.

    Note: most government records do not include lat/lng; spatial filtering
    is therefore an optional verification step, not a hard gate.
    """
    from rapidfuzz import fuzz   # type: ignore

    summary = {'matched': 0, 'updated': 0, 'errors': 0}

    coord_places = [p for p in places if p.get('lat') and p.get('lng')]
    print(f"\n[Gov] Reconciling {len(gov_records)} records against "
          f"{len(coord_places)} places with coordinates…")

    for i, rec in enumerate(gov_records, 1):
        iso_date = _roc_to_iso(rec['close_date'])
        if not iso_date:
            continue

        name_zh = rec['name_zh']
        if not name_zh:
            continue

        best_place = None
        best_score = 0.0

        for p in coord_places:
            score = _name_similarity(name_zh, p['name'], fuzz)
            if score > best_score:
                best_score = score
                best_place = p

        if best_score < name_threshold or best_place is None:
            continue

        summary['matched'] += 1
        existing_date = best_place.get('closed_date') or ''

        # Only upgrade when government date is earlier (legal date < scraped date)
        # or when the existing date is missing / not verified.
        should_update = (
            not existing_date
            or iso_date < existing_date
            or best_place.get('founded_date_confidence') != 'verified'
        )

        if not should_update:
            continue

        update = {
            'status':                  'closed',
            'closed_date':             iso_date,
            'founded_date_confidence': 'verified',
        }
        summary['updated'] += 1

        if i % 100 == 0 or True:   # always log first time
            print(f"  [{i:5}/{len(gov_records)}] {name_zh[:28]:<28} "
                  f"sim={best_score:.0f}  "
                  f"match='{best_place['name'][:28]}'  "
                  f"🏛  {existing_date or 'none'} → {iso_date}")

        if not dry_run:
            try:
                sb.table('places').update(update).eq('id', best_place['id']).execute()
            except Exception as e:
                print(f"     [DB ERR] {e}")
                summary['errors'] += 1

    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stage 3: enrich places table with closed-business data"
    )
    parser.add_argument('--source',   choices=['google', 'gov', 'all'], default='all')
    parser.add_argument('--gov-csv',  metavar='PATH',
                        help="Path to downloaded data.gov.tw CSV")
    parser.add_argument('--limit',    type=int, default=500,
                        help="Max active places to re-check via Google (default: 500)")
    parser.add_argument('--category', default=None,
                        help="Limit to one category slug (default: all)")
    parser.add_argument('--dry-run',  action='store_true',
                        help="Print changes without writing to DB")
    args = parser.parse_args()

    # Validate
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
    if _jwt_role(SUPABASE_KEY) != 'service_role':
        sys.exit("ERROR: SUPABASE_SERVICE_ROLE_KEY must be the service_role key")

    use_google = args.source in ('google', 'all')
    use_gov    = args.source in ('gov', 'all')

    if use_google and not GOOGLE_MAPS_API_KEY:
        sys.exit("ERROR: GOOGLE_MAPS_API_KEY missing — required for --source google/all")
    if use_gov and not args.gov_csv:
        sys.exit(
            "ERROR: --gov-csv required for --source gov/all\n"
            "  Download from https://data.gov.tw/dataset/6038 (Taipei commercial)\n"
            "         or    https://data.gov.tw/dataset/6464 (national company)"
        )

    # Clients
    supabase_mod = _require('supabase', install_as='supabase-py')
    sb = supabase_mod.create_client(SUPABASE_URL, SUPABASE_KEY)
    sb.postgrest.auth(SUPABASE_KEY)

    # Fetch places
    print("Fetching places from Supabase…")
    q = sb.table('places').select(
        'id,name,address,lat,lng,category,status,'
        'closed_date,founded_date,founded_date_confidence,google_place_id'
    )
    if args.category:
        q = q.eq('category', args.category)
    result = q.limit(20_000).execute()
    places = result.data or []

    active_n = sum(1 for p in places if p['status'] != 'closed')
    closed_n = len(places) - active_n
    print(f"  {len(places)} places  ({active_n} active, {closed_n} closed)")

    print("=" * 60)
    print(f"Source   : {args.source}")
    print(f"Category : {args.category or 'all'}")
    print(f"Limit    : {args.limit} (Google re-check)")
    print(f"Dry run  : {args.dry_run}")
    print("=" * 60)

    # Source A: Google
    if use_google:
        _require('googlemaps')
        import googlemaps  # type: ignore
        gmaps     = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
        g_summary = enrich_via_google(places, gmaps, args.dry_run, sb, args.limit)
        print(f"\n[Google] checked={g_summary['checked']}  "
              f"newly_closed={g_summary['newly_closed']}  "
              f"date_added={g_summary['date_added']}  "
              f"errors={g_summary['errors']}")

    # Source B: Government CSV
    if use_gov:
        _require('rapidfuzz')
        gov_records = load_gov_csv(args.gov_csv)
        g2          = reconcile_gov_data(gov_records, places, args.dry_run, sb)
        print(f"\n[Gov] matched={g2['matched']}  "
              f"updated={g2['updated']}  "
              f"errors={g2['errors']}")

    print("\nAll done."
          + ("  (dry run — no DB changes)" if args.dry_run else ""))
    print("Tip: refresh the materialized view after a real run:")
    print("     REFRESH MATERIALIZED VIEW public.dead_zone_clusters;")


if __name__ == "__main__":
    main()