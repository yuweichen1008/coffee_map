#!/usr/bin/env python3
"""
Fetch SFA (Singapore Food Agency) licensed food establishments from data.gov.sg.

This gives you every officially licensed F&B outlet in Singapore with its
license type, address, and expiry date — a superset of what Google Places
returns and a strong signal for "is this business still operating?"

License types discovered → mapped to StorePulse categories:
  RESTAURANT          → restaurant
  EATING HOUSE        → restaurant
  SNACK COUNTER       → cafe
  CANTEEN             → hawker
  FOOD COURT          → hawker
  HAWKER STALL        → hawker
  CATERER             → restaurant
  FOOD FACTORY        → (skipped — not a consumer store)
  BAKERY              → bakery

Data source: data.gov.sg
  Dataset : "Listing of Licensed Food Establishments"
  API     : https://data.gov.sg/api/action/datastore_search?resource_id=<id>

  ⚠ Resource IDs change when datasets are refreshed. If you get a 404:
    1. Go to: https://data.gov.sg/dataset/listing-of-licensed-food-establishments
    2. Click "Export" → copy the resource_id from the API URL
    3. Update SFA_RESOURCE_ID below

Usage:
  python fetch_sfa_licenses.py
  python fetch_sfa_licenses.py --dry-run
  python fetch_sfa_licenses.py --match-places    # also fuzzy-match to places table
"""

import argparse
import os
import re
import sys
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from govdata_client import fetch_dataset_csv, DATASET_IDS

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

LICENSE_TO_CATEGORY = {
    'RESTAURANT':       'restaurant',
    'EATING HOUSE':     'restaurant',
    'SNACK COUNTER':    'cafe',
    'CANTEEN':          'hawker',
    'FOOD COURT':       'hawker',
    'HAWKER STALL':     'hawker',
    'MARKET STALL':     'hawker',
    'CATERER':          'restaurant',
    'BAKERY':           'bakery',
    'CONFECTIONERY':    'bakery',
    'FOOD KIOSK':       'cafe',
    'COFFEE SHOP':      'cafe',
}

SKIP_LICENSE_TYPES = {'FOOD FACTORY', 'COLD STORE', 'CENTRAL KITCHEN', 'SLAUGHTERHOUSE'}

POSTAL_SECTOR_DISTRICT = {
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


def parse_postal(address):
    m = re.search(r'\b(\d{6})\b', address or '')
    if not m:
        return None, None
    postal = m.group(1)
    return postal, POSTAL_SECTOR_DISTRICT.get(postal[:2])


def parse_date(val):
    from datetime import datetime
    if not val or str(val).strip() in ('', '-', 'N/A'):
        return None
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            pass
    return None


def transform(records):
    rows = []
    skipped = 0
    for r in records:
        # Current NEA dataset columns (2026):
        #   licensee_name, licence_number, premises_address, grade, demerit_points,
        #   suspension_start_date, suspension_end_date
        # Older SFA versions used: licensee_type, address, latitude, longitude
        name    = (r.get('licensee_name') or r.get('business_name') or r.get('name') or '').strip()
        lic_no  = (r.get('licence_number') or r.get('license_no') or r.get('lic_no') or '').strip()
        address = (r.get('premises_address') or r.get('address') or r.get('registered_address') or '').strip()
        grade_raw = (r.get('grade') or '').strip().upper()
        grade = grade_raw if grade_raw in ('A', 'B', 'C') else None

        # license_type not in current dataset — all records are eating establishments
        lic_type = (
            r.get('licensee_type') or r.get('license_type') or r.get('type_of_licence') or 'EATING HOUSE'
        ).upper().strip()

        if lic_type in SKIP_LICENSE_TYPES:
            skipped += 1
            continue

        expiry  = parse_date(r.get('expiry_date') or r.get('licence_expiry_date')
                             or r.get('suspension_end_date'))
        postal, district = parse_postal(address)

        lat_raw = r.get('latitude') or r.get('lat')
        lng_raw = r.get('longitude') or r.get('lng')
        try:
            lat = float(lat_raw) if lat_raw else None
            lng = float(lng_raw) if lng_raw else None
        except (ValueError, TypeError):
            lat = lng = None

        category = None
        for key, cat in LICENSE_TO_CATEGORY.items():
            if key in lic_type:
                category = cat
                break
        if not category:
            category = 'restaurant'  # default for all NEA eating establishments

        if not name:
            skipped += 1
            continue

        rows.append({
            'license_no':    lic_no or None,
            'business_name': name,
            'license_type':  lic_type,
            'category':      category,
            'address':       address,
            'postal_code':   postal,
            'district':      district,
            'lat':           lat,
            'lng':           lng,
            'expiry_date':   expiry,
            'nea_grade':     grade,
        })

    print(f"  Transformed: {len(rows):,} rows  |  skipped {skipped:,} (factory/industrial)")
    return rows


def upsert(conn, rows, dry_run):
    if dry_run:
        print("\n[DRY RUN] Sample rows:")
        for r in rows[:10]:
            print(f"  {r['license_type']:20s} | {r['category'] or '?':15s} | {r['district'] or '?':15s} | {r['business_name'][:40]}")
        from collections import Counter
        print("\n  License type breakdown:")
        for lt, n in Counter(r['license_type'] for r in rows).most_common(15):
            print(f"    {n:6,}  {lt}")
        return

    SQL = """
        INSERT INTO sg_sfa_licenses
            (license_no, business_name, license_type, category, address,
             postal_code, district, lat, lng, expiry_date, nea_grade)
        VALUES
            (%(license_no)s, %(business_name)s, %(license_type)s, %(category)s, %(address)s,
             %(postal_code)s, %(district)s, %(lat)s, %(lng)s, %(expiry_date)s, %(nea_grade)s)
        ON CONFLICT (license_no) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            license_type  = EXCLUDED.license_type,
            category      = EXCLUDED.category,
            address       = EXCLUDED.address,
            postal_code   = EXCLUDED.postal_code,
            district      = EXCLUDED.district,
            lat           = EXCLUDED.lat,
            lng           = EXCLUDED.lng,
            expiry_date   = EXCLUDED.expiry_date,
            nea_grade     = EXCLUDED.nea_grade,
            updated_at    = now()
        WHERE %(license_no)s IS NOT NULL
    """
    # Rows without a license_no get plain INSERT (no conflict key)
    SQL_NO_KEY = """
        INSERT INTO sg_sfa_licenses
            (business_name, license_type, category, address,
             postal_code, district, lat, lng, expiry_date, nea_grade)
        VALUES
            (%(business_name)s, %(license_type)s, %(category)s, %(address)s,
             %(postal_code)s, %(district)s, %(lat)s, %(lng)s, %(expiry_date)s, %(nea_grade)s)
    """
    keyed   = [r for r in rows if r['license_no']]
    keyless = [r for r in rows if not r['license_no']]

    with conn.cursor() as cur:
        if keyed:
            psycopg2.extras.execute_batch(cur, SQL, keyed, page_size=500)
        if keyless:
            psycopg2.extras.execute_batch(cur, SQL_NO_KEY, keyless, page_size=500)
    conn.commit()
    print(f"  Done: {len(rows):,} rows upserted to sg_sfa_licenses")


def match_to_places(conn):
    """Fuzzy-match SFA licenses to existing places by name + district."""
    print("\nMatching SFA licenses to places table…")
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE sg_sfa_licenses sfa
            SET place_id = p.id
            FROM places p
            WHERE sfa.place_id IS NULL
              AND p.city = 'singapore'
              AND p.status = 'active'
              AND sfa.district = p.district
              AND LOWER(p.name) = LOWER(sfa.business_name)
        """)
        exact = cur.rowcount
        conn.commit()
        print(f"  Exact matches: {exact:,}")

        # Rough postal proximity match where names are close enough
        cur.execute("""
            UPDATE sg_sfa_licenses sfa
            SET place_id = p.id
            FROM places p
            WHERE sfa.place_id IS NULL
              AND p.city = 'singapore'
              AND p.status = 'active'
              AND sfa.district = p.district
              AND (
                LOWER(p.name) LIKE '%' || LOWER(SPLIT_PART(sfa.business_name, ' ', 1)) || '%'
                AND LENGTH(SPLIT_PART(sfa.business_name, ' ', 1)) >= 4
              )
        """)
        fuzzy = cur.rowcount
        conn.commit()
        print(f"  Prefix matches: {fuzzy:,}")


def main():
    parser = argparse.ArgumentParser(description="Fetch SFA licensed food establishments from data.gov.sg")
    parser.add_argument('--dry-run',       action='store_true', help='Fetch and transform without writing to DB')
    parser.add_argument('--match-places',  action='store_true', help='After upsert, match licenses to places table')
    args = parser.parse_args()

    print("Fetching SFA licensed food establishments from data.gov.sg…")
    try:
        records = fetch_dataset_csv(DATASET_IDS["sfa_food_license"])
    except Exception as e:
        print(f"[ERROR] {e}")
        print("  Update DATASET_IDS['sfa_food_license'] in govdata_client.py")
        print("  Find the ID at: https://data.gov.sg/datasets?query=food+establishment")
        sys.exit(1)
    print(f"Fetched {len(records):,} raw SFA records")

    rows = transform(records)

    if not args.dry_run:
        conn = psycopg2.connect(DATABASE_URL)
        upsert(conn, rows, dry_run=False)
        if args.match_places:
            match_to_places(conn)
        conn.close()
    else:
        upsert(None, rows, dry_run=True)


if __name__ == '__main__':
    main()
