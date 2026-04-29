"""
fetch_closed.py — Stage 2b: Taiwan Government Closure Data
===========================================================
Fetches dissolved/cancelled company records from Taiwan GCIS (經濟部商業司)
open data and reconciles them against the places table in Supabase.

Data source
-----------
  GCIS Dataset 236EE382 — Company Dissolution notices
  URL: https://data.gcis.nat.gov.tw/od/data/api/236EE382-4942-41A9-BD03-CA0709025E7C
  Alternatively download CSV manually from:
    https://data.gov.tw/dataset/6049

Usage
-----
  # Auto-fetch from GCIS API (may be blocked outside Taiwan — use VPN if needed)
  python scripts/fetch_closed.py

  # Use a pre-downloaded CSV
  python scripts/fetch_closed.py --csv path/to/gcis_dissolved.csv

  # Dry run (no DB writes)
  python scripts/fetch_closed.py --dry-run

  # Limit API pages (each page = 1000 records)
  python scripts/fetch_closed.py --pages 5

Output
------
  - Prints matched/updated counts
  - Writes unmatched rows to  scripts/output/unmatched_closures.csv
  - Updates matched places: status='closed', closed_date=<dissolution_date>
"""

import argparse
import csv
import io
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env.local')

# ── Dependencies ──────────────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    sys.exit("ERROR: pip install requests")

try:
    from supabase import create_client
except ImportError:
    sys.exit("ERROR: pip install supabase")

try:
    from rapidfuzz import fuzz
    HAS_FUZZ = True
except ImportError:
    HAS_FUZZ = False
    print("WARNING: rapidfuzz not installed — falling back to exact name matching only.")
    print("         pip install rapidfuzz  for fuzzy EN↔ZH matching\n")

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local")

# GCIS API — paginated JSON (1000 records/page)
GCIS_API_URL = (
    "https://data.gcis.nat.gov.tw/od/data/api/"
    "236EE382-4942-41A9-BD03-CA0709025E7C"
    "?$format=json&$skip={skip}&$top=1000"
)

# Food & beverage industry codes to filter (GCIS 行業代碼)
TARGET_INDUSTRY_CODES = {
    'F501010',  # 餐館業
    'F501020',  # 飲料店業 (general)
    'F501030',  # 咖啡館業
    'F501040',  # 冰果店業
    'F501060',  # 飲料攤販業
    'F501070',  # 烘焙業
    'F199990',  # 其他食品零售業
}

# Keywords to match if industry code unavailable
NAME_KEYWORDS = '咖啡|珈琲|coffee|café|茶|飲|bubble|boba|拿鐵|latte|烘焙|bakery|麵包|甜點|dessert'

FUZZY_THRESHOLD = 72   # minimum token_sort_ratio to count as a match
OUTPUT_DIR      = Path(__file__).parent / 'output'


# ── ROC date → ISO ────────────────────────────────────────────────────────────
def roc_to_iso(roc_str: str):  # -> str | None
    """Convert ROC date string (e.g. '1130315' or '113/03/15') to ISO-8601."""
    if not roc_str:
        return None
    s = str(roc_str).replace('/', '').replace('-', '').strip()
    if len(s) == 7:                       # YYYMMDD
        try:
            year = int(s[:3]) + 1911
            return f"{year}-{s[3:5]}-{s[5:7]}"
        except ValueError:
            return None
    if len(s) == 8:                       # YYYYMMDD — already Gregorian
        try:
            return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        except ValueError:
            return None
    return None


# ── Fetch from GCIS API ───────────────────────────────────────────────────────
def fetch_gcis_api(max_pages: int) -> list[dict]:
    records = []
    headers = {
        'User-Agent':  'Mozilla/5.0 (compatible; StorePulse/1.0)',
        'Accept':      'application/json',
        'Referer':     'https://data.gov.tw/',
    }
    for page in range(max_pages):
        url  = GCIS_API_URL.format(skip=page * 1000)
        print(f"  Fetching GCIS page {page + 1} … ", end='', flush=True)
        try:
            resp = requests.get(url, headers=headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.ConnectionError:
            print("FAILED (connection refused)")
            print()
            print("  The GCIS API may be blocking non-Taiwan IPs.")
            print("  Use --csv to load a pre-downloaded file instead:")
            print("    1. Open  https://data.gov.tw/dataset/6049  in a browser")
            print("    2. Download the CSV file")
            print("    3. Re-run: python scripts/fetch_closed.py --csv <path>")
            return records
        except requests.exceptions.Timeout:
            print("TIMEOUT")
            break
        except Exception as e:
            print(f"ERROR: {e}")
            break

        if not data:
            print(f"empty — done at {len(records)} records")
            break

        batch = data if isinstance(data, list) else data.get('value', [])
        records.extend(batch)
        print(f"{len(batch)} records  (total {len(records)})")

        if len(batch) < 1000:
            break   # last page

        time.sleep(0.4)   # be polite

    return records


# ── Parse CSV ─────────────────────────────────────────────────────────────────
def parse_csv(path: str) -> list[dict]:
    """Load GCIS dissolution CSV (auto-detects Big5 / UTF-8-BOM / UTF-8)."""
    for enc in ('utf-8-sig', 'big5', 'cp950', 'utf-8'):
        try:
            with open(path, encoding=enc, newline='') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            print(f"  Loaded {len(rows)} rows from CSV (encoding: {enc})")
            return rows
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    sys.exit(f"ERROR: cannot read {path} — try converting to UTF-8 first")


# ── Normalise a raw GCIS record ───────────────────────────────────────────────
def normalise(row: dict):  # -> dict | None
    """
    Map raw GCIS field names to a standard dict.
    Returns None if the record is clearly out of scope.
    """
    # Field names differ between API JSON and downloaded CSV
    name    = (row.get('公司名稱') or row.get('Company_Name') or '').strip()
    city    = (row.get('公司所在地') or row.get('Address') or '').strip()
    code    = (row.get('行業代碼') or row.get('Business_Item') or '').strip()
    raw_dt  = (row.get('廢止日期') or row.get('Cancel_Date') or
               row.get('解散日期') or row.get('Dissolution_Date') or '').strip()

    if not name:
        return None
    # Only keep Taipei records
    if city and '臺北市' not in city and '台北市' not in city:
        return None

    # Industry filter — accept if code matches OR name contains keyword
    import re
    if code:
        matched_code = any(code.startswith(c) for c in TARGET_INDUSTRY_CODES)
    else:
        matched_code = False
    matched_name = bool(re.search(NAME_KEYWORDS, name, re.IGNORECASE))

    if not matched_code and not matched_name:
        return None

    return {
        'name':        name,
        'city':        city,
        'industry':    code,
        'closed_date': roc_to_iso(raw_dt) or datetime.today().strftime('%Y-%m-%d'),
    }


# ── Match against Supabase places ─────────────────────────────────────────────
def reconcile(gov_records: list[dict], dry_run: bool) -> None:
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Load all active places from Supabase (name + id)
    print("\nFetching active places from Supabase …")
    page_size = 1000
    offset    = 0
    places    = []
    while True:
        r = (sb.from_('places')
               .select('id,name,district')
               .neq('status', 'closed')
               .range(offset, offset + page_size - 1)
               .execute())
        batch = r.data or []
        places.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    print(f"  {len(places)} active places loaded")

    place_names = [p['name'].lower() for p in places]

    matched    = []
    unmatched  = []

    for rec in gov_records:
        gov_name = rec['name'].lower()
        best_idx   = -1
        best_score = 0

        for i, db_name in enumerate(place_names):
            # Exact match first
            if gov_name == db_name:
                best_idx   = i
                best_score = 100
                break
            if HAS_FUZZ:
                score = fuzz.token_sort_ratio(gov_name, db_name)
                if score > best_score:
                    best_score = score
                    best_idx   = i

        if best_idx >= 0 and best_score >= FUZZY_THRESHOLD:
            place = places[best_idx]
            matched.append({
                'id':          place['id'],
                'db_name':     place['name'],
                'gov_name':    rec['name'],
                'score':       best_score,
                'closed_date': rec['closed_date'],
                'district':    place.get('district', ''),
            })
        else:
            unmatched.append(rec)

    print(f"\nMatching results:")
    print(f"  {len(matched):4d} matched  (fuzzy threshold ≥ {FUZZY_THRESHOLD})")
    print(f"  {len(unmatched):4d} unmatched")

    if matched:
        print(f"\nSample matches:")
        for m in matched[:10]:
            print(f"  [{m['score']:3d}] {m['gov_name'][:35]:35s} → {m['db_name'][:35]}")
        if len(matched) > 10:
            print(f"  … and {len(matched) - 10} more")

    if dry_run:
        print("\n[DRY RUN] No DB changes written.")
        _write_unmatched(unmatched)
        return

    # Update matched places in Supabase
    updated = 0
    for m in matched:
        sb.from_('places').update({
            'status':      'closed',
            'closed_date': m['closed_date'],
        }).eq('id', m['id']).execute()
        updated += 1

    print(f"\nUpdated {updated} places → status='closed'")
    _write_unmatched(unmatched)


def _write_unmatched(unmatched: list[dict]) -> None:
    if not unmatched:
        return
    OUTPUT_DIR.mkdir(exist_ok=True)
    out = OUTPUT_DIR / 'unmatched_closures.csv'
    with open(out, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['name', 'city', 'industry', 'closed_date'])
        writer.writeheader()
        writer.writerows(unmatched)
    print(f"Unmatched rows saved → {out}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Fetch Taiwan GCIS closure data and reconcile with Supabase places',
    )
    parser.add_argument('--csv',      help='Path to pre-downloaded GCIS CSV file')
    parser.add_argument('--pages',    type=int, default=20, help='Max GCIS API pages (default 20)')
    parser.add_argument('--dry-run',  action='store_true',  help='Preview without writing to DB')
    args = parser.parse_args()

    print("=" * 60)
    print("GCIS Closure Reconciliation")
    print(f"Source   : {'CSV: ' + args.csv if args.csv else 'GCIS API'}")
    print(f"Dry run  : {args.dry_run}")
    print("=" * 60 + "\n")

    # ── Collect raw records ───────────────────────────────────────────────────
    if args.csv:
        raw_rows = parse_csv(args.csv)
    else:
        print(f"Fetching up to {args.pages} pages from GCIS API …")
        raw_rows = fetch_gcis_api(args.pages)

    if not raw_rows:
        print("No records fetched — nothing to reconcile.")
        return

    # ── Normalise + filter ────────────────────────────────────────────────────
    print(f"\nFiltering {len(raw_rows)} raw records for Taipei F&B …")
    gov_records = [r for r in (normalise(row) for row in raw_rows) if r]
    print(f"  {len(gov_records)} Taipei F&B dissolution records found")

    if not gov_records:
        print("No matching records after filtering.")
        return

    reconcile(gov_records, dry_run=args.dry_run)
    print("\nDone.")


if __name__ == '__main__':
    main()
