#!/usr/bin/env python3
"""
Load Singapore resident population by planning area into sg_population.

Powers the sg_area_opportunity view:
  stores_per_1k_residents → planning areas with high population but low
  commercial density — the "white space" signal for investor pitches.

Data sources (in priority order):
  1. --csv path/to/file.csv  — Singstat CSV downloaded from data.gov.sg
       Dataset: "Singapore Residents By Planning Area And Type Of Dwelling"
       https://data.gov.sg/datasets?query=resident+population+planning+area
  2. govdata_client          — auto-download via data.gov.sg API if dataset ID is set
  3. Census 2020 fallback    — hardcoded (always works, slightly stale)

Usage:
  python fetch_population.py                      # uses Census 2020 fallback
  python fetch_population.py --csv residents.csv  # load Singstat CSV
  python fetch_population.py --dry-run
"""

import argparse
import csv
import os
import sys
import psycopg2
import psycopg2.extras
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

# Fallback: hardcoded 2020 Census population by planning area (from SingStat)
# Used if the API resource is unavailable or returns no data.
# Source: https://www.singstat.gov.sg/publications/reference/cop2020
CENSUS_2020_FALLBACK = {
    'Ang Mo Kio':       176800,
    'Bedok':            278800,
    'Bishan':            95600,
    'Boon Lay':          71100,
    'Bukit Batok':      134200,
    'Bukit Merah':      145500,
    'Bukit Panjang':    130600,
    'Bukit Timah':       85500,
    'Central Water Catchment': 100,
    'Changi':             2400,
    'Choa Chu Kang':    186500,
    'Clementi':         155700,
    'Downtown Core':      5200,
    'Geylang':          100800,
    'Hougang':          220100,
    'Jurong East':      100200,
    'Jurong West':      267000,
    'Kallang':           97100,
    'Lim Chu Kang':        700,
    'Mandai':             4700,
    'Marina East':           0,
    'Marina South':        700,
    'Marine Parade':     82200,
    'Museum':             2600,
    'Newton':            21600,
    'Novena':            82800,
    'Orchard':            8900,
    'Outram':            18300,
    'Pasir Ris':        133600,
    'Paya Lebar':        12100,
    'Pioneer':           23200,
    'Punggol':          185600,
    'Queenstown':       103200,
    'River Valley':      18900,
    'Rochor':            21200,
    'Seletar':            4300,
    'Sembawang':        111800,
    'Sengkang':         248600,
    'Serangoon':        107700,
    'Simpang':            1700,
    'Singapore River':    6600,
    'Southern Islands':   2700,
    'Straits View':          0,
    'Sungei Kadut':      10100,
    'Tampines':         268500,
    'Tanglin':           31400,
    'Tengah':             1400,
    'Toa Payoh':        142600,
    'Tuas':               3100,
    'Western Islands':    2900,
    'Western Water Catchment': 200,
    'Woodlands':        262800,
    'Yishun':           228800,
}


def fetch_all_pages(resource_id, page_size=500):
    records = []
    offset  = 0
    while True:
        url  = f"{GOVDATA_BASE}?resource_id={resource_id}&limit={page_size}&offset={offset}"
        resp = requests.get(url, timeout=20)
        if resp.status_code == 404:
            return None   # signal to use fallback
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            return None
        rows = data["result"]["records"]
        if not rows:
            break
        records.extend(rows)
        total = data["result"]["total"]
        print(f"  Fetched {len(records):,} / {total:,} records", end="\r")
        if len(records) >= total:
            break
        offset += page_size
        time.sleep(0.3)
    print()
    return records


def aggregate_by_area(records, target_year):
    """Sum resident count per planning area for the target year."""
    totals = defaultdict(int)
    year_found = set()

    for r in records:
        year = str(r.get('year') or r.get('Year') or '').strip()
        if target_year and year != str(target_year):
            continue
        year_found.add(year)

        area = (r.get('pa') or r.get('planning_area') or r.get('Planning Area') or '').strip().title()
        pop  = r.get('pop') or r.get('total') or r.get('resident_count') or 0
        try:
            totals[area] += int(str(pop).replace(',', '') or 0)
        except (ValueError, TypeError):
            pass

    if not totals and year_found:
        # Year filter too strict — use most recent year in data
        latest = max(year_found)
        print(f"  [WARN] No data for year {target_year}. Using {latest}.")
        for r in records:
            year = str(r.get('year') or r.get('Year') or '').strip()
            if year != latest:
                continue
            area = (r.get('pa') or r.get('planning_area') or r.get('Planning Area') or '').strip().title()
            pop  = r.get('pop') or r.get('total') or r.get('resident_count') or 0
            try:
                totals[area] += int(str(pop).replace(',', '') or 0)
            except (ValueError, TypeError):
                pass

    return dict(totals)


def upsert(conn, population_map, census_year, dry_run):
    rows = [
        {'planning_area': area, 'total_residents': total, 'census_year': census_year}
        for area, total in population_map.items()
        if total > 0
    ]

    if dry_run:
        print(f"\n[DRY RUN] {len(rows)} planning areas:")
        for r in sorted(rows, key=lambda x: -x['total_residents'])[:15]:
            bar = '█' * (r['total_residents'] // 10000)
            print(f"  {r['planning_area']:25s} {r['total_residents']:>8,}  {bar}")
        return

    SQL = """
        INSERT INTO sg_population (planning_area, total_residents, census_year)
        VALUES (%(planning_area)s, %(total_residents)s, %(census_year)s)
        ON CONFLICT (planning_area) DO UPDATE SET
            total_residents = EXCLUDED.total_residents,
            census_year     = EXCLUDED.census_year,
            updated_at      = now()
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, SQL, rows, page_size=100)
    conn.commit()
    print(f"  Done: {len(rows)} planning areas written to sg_population")


def load_from_csv(path, target_year):
    """Load Singstat CSV (downloaded from data.gov.sg) and aggregate by planning area."""
    records = []
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        for row in csv.DictReader(f):
            records.append(row)
    print(f"  Loaded {len(records):,} rows from {path}")
    return aggregate_by_area(records, target_year)


def main():
    parser = argparse.ArgumentParser(description="Load Singapore population by planning area")
    parser.add_argument('--csv',     help='Path to Singstat residents CSV (from data.gov.sg)')
    parser.add_argument('--year',    type=int, default=2023, help='Year to extract from CSV (default: 2023)')
    parser.add_argument('--dry-run', action='store_true', help='Print data without writing to DB')
    args = parser.parse_args()

    if args.csv:
        if not os.path.exists(args.csv):
            sys.exit(f"[ERROR] CSV not found: {args.csv}")
        population = load_from_csv(args.csv, args.year)
        source = f"CSV (year={args.year})"
    else:
        # Try govdata API, fall back to Census 2020
        try:
            from govdata_client import fetch_dataset_csv, DATASET_IDS
            records = fetch_dataset_csv(DATASET_IDS["population_pa"])
            population = aggregate_by_area(records, args.year)
            source = f"data.gov.sg API (year={args.year})"
        except Exception:
            print("  data.gov.sg API unavailable — using Census 2020 fallback")
            population = CENSUS_2020_FALLBACK
            args.year  = 2020
            source = "Census 2020 fallback"

    print(f"  Planning areas with population data: {len(population)}  [{source}]")

    if not args.dry_run:
        conn = psycopg2.connect(DATABASE_URL)
        upsert(conn, population, args.year, dry_run=False)
        conn.close()

        print("\n  Underserved areas (lowest stores per 1k residents):")
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT planning_area, total_residents, store_count, stores_per_1k_residents
                FROM sg_area_opportunity
                WHERE total_residents > 50000
                ORDER BY stores_per_1k_residents ASC NULLS LAST
                LIMIT 10
            """)
            rows = cur.fetchall()
        conn.close()
        if rows:
            print(f"  {'Area':25s} {'Residents':>10s} {'Stores':>7s} {'per 1k':>7s}")
            print(f"  {'-'*55}")
            for area, residents, stores, per_1k in rows:
                print(f"  {area:25s} {residents or 0:>10,} {stores or 0:>7,} {float(per_1k or 0):>7.2f}")
        else:
            print("  (No sg_area_opportunity data yet — run after places are loaded)")
    else:
        upsert(None, population, args.year, dry_run=True)


if __name__ == '__main__':
    main()
