#!/usr/bin/env python3
"""
Discover newly registered F&B and retail businesses from ACRA data.

Uses the same ACRA CSV as fetch_acra.py (download from data.gov.sg):
  https://data.gov.sg/dataset/entities-with-unique-entity-number

Filters for businesses registered in the last N months with SSIC codes
covering F&B, retail, gyms, and personal services — the store types
relevant to StorePulse's category matrix.

Output:
  - Populates sg_new_businesses table
  - Prints a trend summary: top SSIC categories by new registration count
  - Highlights which districts are seeing the most new openings

Usage:
  python fetch_new_businesses.py --csv sg_bizfile.csv
  python fetch_new_businesses.py --csv sg_bizfile.csv --months 6
  python fetch_new_businesses.py --csv sg_bizfile.csv --dry-run
"""

import argparse
import csv
import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

# ── SSIC code → StorePulse category ──────────────────────────────────────────
# Singapore Standard Industrial Classification (SSIC) 2020
# Only the prefixes relevant to StorePulse's 14-category matrix
SSIC_CATEGORY = {
    '5610': 'restaurant',      # Restaurants and mobile food service
    '5611': 'restaurant',      # Full-service restaurants
    '5619': 'restaurant',      # Other food service NEC
    '5621': 'hawker',          # Event catering
    '5629': 'hawker',          # Other food service (incl. hawker stalls)
    '5630': 'beverage_store',  # Beverage serving activities
    '5631': 'cafe',            # Cafes and coffee shops
    '1071': 'bakery',          # Bread, pastry, cake manufacture/retail
    '1072': 'bakery',          # Sugar confectionery
    '4711': 'grocery',         # Supermarket-type non-specialised retail
    '4719': 'grocery',         # Other non-specialised stores
    '4721': 'grocery',         # Fruit, vegetables, meat retail
    '4722': 'beverage_store',  # Specialist beverage retail
    '4726': 'pharmacy',        # Pharmaceutical retail
    '4781': 'hawker',          # Retail stalls and markets (food)
    '9311': 'gym',             # Sports facilities
    '9312': 'gym',             # Fitness centres
    '9319': 'gym',             # Other sports activities
    '9601': 'laundromat',      # Laundry / dry-cleaning
    '9602': 'laundromat',      # Hairdressing (service-adjacent)
    '8810': 'childcare',       # Child day-care activities
    '8891': 'childcare',       # Educational support, enrichment
    '6810': 'coworking',       # Real estate / co-working adjacent
}

# Singapore postal sector (first 2 digits) → district name
POSTAL_TO_DISTRICT = {
    '01': 'Tanjong_Pagar', '02': 'Tanjong_Pagar', '03': 'Tanjong_Pagar',
    '04': 'Chinatown',     '05': 'Chinatown',     '06': 'Chinatown',
    '07': 'Bugis',         '08': 'Bugis',
    '09': 'Orchard',       '10': 'Orchard',
    '11': 'Novena',        '12': 'Novena',        '13': 'Novena',
    '14': 'Geylang',       '15': 'Geylang',       '16': 'Bedok',
    '17': 'Changi',        '18': 'Tampines',       '19': 'Serangoon',
    '20': 'Bishan',        '21': 'Clementi',
    '22': 'Jurong_East',   '23': 'Jurong_East',
    '24': 'Woodlands',     '25': 'Woodlands',     '26': 'Woodlands',
    '27': 'Woodlands',     '28': 'Sengkang',
    '29': 'Ang_Mo_Kio',   '30': 'Ang_Mo_Kio',
    '31': 'Toa_Payoh',    '32': 'Toa_Payoh',     '33': 'Toa_Payoh',
    '34': 'Novena',        '35': 'Novena',         '36': 'Novena',
    '37': 'Queenstown',   '38': 'Queenstown',     '39': 'Queenstown',
    '40': 'Queenstown',   '41': 'Queenstown',
    '42': 'Clementi',     '43': 'Clementi',       '44': 'Clementi',
    '45': 'Clementi',     '46': 'Jurong_East',    '47': 'Jurong_East',
    '48': 'Jurong_East',  '49': 'Clementi',       '50': 'Clementi',
    '51': 'Jurong_East',  '52': 'Jurong_East',
    '53': 'Ang_Mo_Kio',  '54': 'Ang_Mo_Kio',    '55': 'Ang_Mo_Kio',
    '56': 'Bishan',       '57': 'Bishan',
    '58': 'Queenstown',   '59': 'Queenstown',
    '60': 'Toa_Payoh',   '61': 'Toa_Payoh',     '62': 'Toa_Payoh',
    '63': 'Toa_Payoh',   '64': 'Toa_Payoh',
    '65': 'Geylang',     '66': 'Geylang',        '67': 'Geylang',
    '68': 'Geylang',
    '69': 'Tampines',    '70': 'Tampines',       '71': 'Tampines',
    '72': 'Tampines',    '73': 'Tampines',
    '74': 'Bedok',       '75': 'Bedok',          '76': 'Bedok',
    '77': 'Bedok',       '78': 'Bedok',
    '79': 'Sengkang',    '80': 'Punggol',        '81': 'Punggol',
    '82': 'Punggol',
    '83': 'Serangoon',   '84': 'Serangoon',      '85': 'Serangoon',
    '86': 'Yishun',      '87': 'Yishun',         '88': 'Yishun',
    '89': 'Woodlands',   '90': 'Woodlands',      '91': 'Woodlands',
}

SSIC_PREFIXES = set(SSIC_CATEGORY.keys())


def ssic_to_category(code):
    if not code:
        return None
    code = str(code).strip()
    return (
        SSIC_CATEGORY.get(code[:4])        # exact 4-digit match first
        or SSIC_CATEGORY.get(code[:3])     # 3-digit prefix fallback
    )


def postal_to_district(address):
    """Extract postal sector from a SG address string → district name."""
    import re
    m = re.search(r'\b(S|Singapore)?\(?(\d{6})\)?', address or '', re.IGNORECASE)
    if not m:
        return None, None
    postal = m.group(2)
    sector = postal[:2]
    return sector, POSTAL_TO_DISTRICT.get(sector)


def parse_date(val):
    from datetime import datetime
    if not val or str(val).strip() in ('', 'N/A', 'None', '-'):
        return None
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%Y%m%d'):
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            pass
    return None


def load_and_filter(csv_path, cutoff_date):
    """Read ACRA CSV, return rows matching SSIC and registered after cutoff."""
    results = []
    skipped = 0

    print(f"Reading {csv_path}  (cutoff: {cutoff_date})…")
    with open(csv_path, encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        headers = [h.lower() for h in (reader.fieldnames or [])]

        def col(*candidates):
            for c in candidates:
                if c.lower() in headers:
                    return reader.fieldnames[headers.index(c.lower())]
            return None

        uen_col     = col('uen', 'UEN')
        name_col    = col('entity_name', 'name', 'company_name')
        ssic_col    = col('primary_ssic_code', 'ssic_code', 'ssic')
        ssic_desc   = col('primary_ssic_description', 'ssic_description')
        reg_col     = col('uen_issue_date', 'registration_date', 'reg_date')
        cease_col   = col('entity_status_history', 'cessation_date', 'cease_date')
        addr_col    = col('registered_address', 'address', 'reg_address')

        if not name_col or not ssic_col:
            print(f"[ERROR] Missing columns. Found: {reader.fieldnames[:10]}")
            sys.exit(1)

        print(f"  Columns: uen={uen_col}, name={name_col}, ssic={ssic_col}, reg={reg_col}")

        for i, row in enumerate(reader):
            if i % 200_000 == 0 and i > 0:
                print(f"  Scanned {i:,} rows, {len(results)} matched…", end='\r')

            ssic = (row.get(ssic_col) or '').strip()
            if not ssic or ssic[:4] not in SSIC_PREFIXES and ssic[:3] not in SSIC_PREFIXES:
                skipped += 1
                continue

            reg_date = parse_date(row.get(reg_col, '')) if reg_col else None
            if reg_date and reg_date < cutoff_date:
                skipped += 1
                continue

            cease_raw  = row.get(cease_col, '') if cease_col else ''
            is_ceased  = 'cessation' in str(cease_raw).lower() or parse_date(cease_raw) is not None

            address    = (row.get(addr_col) or '') if addr_col else ''
            sector, district = postal_to_district(address)

            results.append({
                'uen':              (row.get(uen_col) or '').strip() if uen_col else '',
                'entity_name':      (row.get(name_col) or '').strip(),
                'ssic_code':        ssic[:4],
                'ssic_description': (row.get(ssic_desc) or ssic).strip() if ssic_desc else ssic,
                'category':         ssic_to_category(ssic),
                'reg_date':         reg_date,
                'postal_sector':    sector,
                'district':         district,
                'status':           'ceased' if is_ceased else 'active',
            })

    print(f"\n  Matched {len(results):,} businesses  |  skipped {skipped:,}")
    return results


def print_trends(results):
    from collections import Counter

    active = [r for r in results if r['status'] == 'active']
    print(f"\n{'═' * 60}")
    print(f"  NEW BUSINESS REGISTRATIONS  (last {len(results):,} matched)")
    print(f"  Active: {len(active):,}   Ceased: {len(results) - len(active):,}")
    print(f"{'═' * 60}")

    print("\n  TOP CATEGORIES (active registrations):")
    for cat, n in Counter(r['category'] for r in active if r['category']).most_common(12):
        bar = '█' * min(40, n // max(1, len(active) // 40))
        print(f"  {cat or 'unknown':20s}  {bar}  {n:,}")

    print("\n  TOP SSIC DESCRIPTIONS (active):")
    for desc, n in Counter(r['ssic_description'] for r in active).most_common(10):
        print(f"  {n:5,}  {desc[:60]}")

    print("\n  HOTTEST DISTRICTS (active, by new biz count):")
    for dist, n in Counter(r['district'] for r in active if r['district']).most_common(10):
        print(f"  {dist:20s}  {n:,}")


def upsert(conn, results, dry_run):
    if dry_run:
        print("\n[DRY RUN] Sample rows:")
        for r in results[:8]:
            print(f"  {r['status']:6} | {r['category'] or '?':15} | {r['district'] or '?':15} | {r['entity_name'][:40]}")
        return

    SQL = """
        INSERT INTO sg_new_businesses
            (uen, entity_name, ssic_code, ssic_description, category,
             reg_date, postal_sector, district, status)
        VALUES
            (%(uen)s, %(entity_name)s, %(ssic_code)s, %(ssic_description)s, %(category)s,
             %(reg_date)s, %(postal_sector)s, %(district)s, %(status)s)
        ON CONFLICT (uen) DO UPDATE SET
            entity_name      = EXCLUDED.entity_name,
            ssic_code        = EXCLUDED.ssic_code,
            ssic_description = EXCLUDED.ssic_description,
            category         = EXCLUDED.category,
            reg_date         = EXCLUDED.reg_date,
            postal_sector    = EXCLUDED.postal_sector,
            district         = EXCLUDED.district,
            status           = EXCLUDED.status
    """
    BATCH = 500
    total = 0
    with conn.cursor() as cur:
        for i in range(0, len(results), BATCH):
            batch = results[i:i + BATCH]
            psycopg2.extras.execute_batch(cur, SQL, batch, page_size=BATCH)
            total += len(batch)
            print(f"  Upserted {total:,}/{len(results):,}…", end='\r')
    conn.commit()
    print(f"\n  Done: {total:,} rows upserted to sg_new_businesses")


def main():
    parser = argparse.ArgumentParser(description="Discover newly registered F&B/retail businesses from ACRA CSV")
    parser.add_argument('--csv',     required=True, help='Path to ACRA CSV (download from data.gov.sg)')
    parser.add_argument('--months',  type=int, default=12, help='Look back N months (default: 12)')
    parser.add_argument('--dry-run', action='store_true', help='Print trends without writing to DB')
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        sys.exit(f"[ERROR] CSV not found: {args.csv}")

    cutoff = date.today() - timedelta(days=args.months * 30)
    results = load_and_filter(args.csv, cutoff)

    if not results:
        print("No matching businesses found. Check SSIC codes or cutoff date.")
        return

    print_trends(results)

    if not args.dry_run:
        conn = psycopg2.connect(DATABASE_URL)
        upsert(conn, results, dry_run=False)
        conn.close()
    else:
        upsert(None, results, dry_run=True)


if __name__ == '__main__':
    main()
