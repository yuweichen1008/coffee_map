#!/usr/bin/env python3
"""
Fetch Singapore government open data and load into StorePulse DB.

Datasets:
  hawker  — 114 official hawker centres from data.gov.sg
  nea     — NEA food hygiene grades (A/B/C) from data.gov.sg
  all     — both of the above

Usage:
  python3 fetch_sg_govdata.py --dataset all
  python3 fetch_sg_govdata.py --dataset hawker --dry-run
"""

import argparse
import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

# data.gov.sg resource IDs
HAWKER_RESOURCE_ID  = "8884b6aa-bce1-4fb1-b5db-13f39c84c978"
NEA_HYGIENE_URL     = "https://data.gov.sg/api/action/datastore_search"
# NEA hygiene resource ID (food hygiene rating scheme results)
NEA_RESOURCE_ID     = "4a291f8e-f5d9-4b1d-b62c-ffdfbfd0a7bb"

GOVDATA_BASE = "https://data.gov.sg/api/action/datastore_search"


def fetch_all_pages(resource_id: str, page_size: int = 100) -> list:
    """Paginate through a data.gov.sg datastore resource."""
    records = []
    offset  = 0
    while True:
        url = f"{GOVDATA_BASE}?resource_id={resource_id}&limit={page_size}&offset={offset}"
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            print(f"  [WARN] API returned success=false for {resource_id}", file=sys.stderr)
            break
        rows = data["result"]["records"]
        if not rows:
            break
        records.extend(rows)
        print(f"  Fetched {len(records)} / {data['result']['total']} records", end="\r")
        if len(records) >= data["result"]["total"]:
            break
        offset += page_size
        time.sleep(0.3)
    print()
    return records


def fetch_hawker_centres(conn, dry_run: bool):
    print("\n=== Hawker Centres (data.gov.sg) ===")
    records = fetch_all_pages(HAWKER_RESOURCE_ID)
    print(f"  Fetched {len(records)} hawker centre records")

    rows = []
    for r in records:
        name        = r.get("name_of_centre") or r.get("name") or ""
        address     = r.get("location_of_centre") or r.get("address") or ""
        lat_str     = r.get("latitude_hc") or r.get("latitude") or ""
        lng_str     = r.get("longitude_hc") or r.get("longitude") or ""
        stall_count = r.get("no_of_food_stalls") or r.get("stall_count") or 0

        try:
            lat = float(lat_str)
            lng = float(lng_str)
        except (ValueError, TypeError):
            print(f"  [SKIP] Bad coords for: {name}")
            continue

        rows.append((name, address, lat, lng, int(stall_count or 0)))

    print(f"  Valid rows: {len(rows)}")
    if dry_run:
        print("  [DRY RUN] Skipping DB write")
        for r in rows[:5]:
            print(f"    {r}")
        return

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO sg_hawker_centres (name, address, lat, lng, location, stall_count)
            VALUES %s
            ON CONFLICT DO NOTHING
        """, [
            (name, addr, lat, lng, f"SRID=4326;POINT({lng} {lat})", stalls)
            for name, addr, lat, lng, stalls in rows
        ])
    conn.commit()
    print(f"  Inserted {len(rows)} hawker centres")


def fetch_nea_hygiene(conn, dry_run: bool):
    print("\n=== NEA Food Hygiene Grades (data.gov.sg) ===")
    try:
        records = fetch_all_pages(NEA_RESOURCE_ID)
    except Exception as e:
        print(f"  [WARN] Could not fetch NEA hygiene data: {e}")
        print("  Trying alternative endpoint...")
        # Some resource IDs change — skip gracefully
        return

    print(f"  Fetched {len(records)} hygiene records")

    updated = 0
    if dry_run:
        print("  [DRY RUN] Skipping DB write")
        for r in records[:5]:
            print(f"    {r}")
        return

    with conn.cursor() as cur:
        for r in records:
            name        = r.get("business_name") or r.get("name") or ""
            grade       = (r.get("grade") or r.get("hygiene_grade") or "").upper().strip()
            inspected   = r.get("date") or r.get("date_of_inspection") or None
            postal_code = r.get("postal_code") or r.get("postal") or None

            if not name or grade not in ("A", "B", "C"):
                continue

            # Match by name similarity — exact match first, then fuzzy
            cur.execute("""
                UPDATE places
                SET nea_grade     = %s,
                    nea_inspected = %s,
                    data_sources  = array_append(
                        array_remove(data_sources, 'nea'), 'nea'
                    )
                WHERE LOWER(name) = LOWER(%s)
                  AND category IN ('hawker', 'restaurant', 'cafe', 'beverage_store')
                  AND status != 'closed'
                  AND lat BETWEEN 1.15 AND 1.48
            """, (grade, inspected, name))
            if cur.rowcount:
                updated += cur.rowcount

    conn.commit()
    print(f"  Updated {updated} places with NEA hygiene grades")


def main():
    parser = argparse.ArgumentParser(description="Fetch Singapore government data into StorePulse DB")
    parser.add_argument("--dataset",  choices=["hawker", "nea", "all"], default="all")
    parser.add_argument("--dry-run",  action="store_true", help="Fetch data but don't write to DB")
    args = parser.parse_args()

    print(f"Connecting to: {DATABASE_URL[:40]}...")
    conn = psycopg2.connect(DATABASE_URL)

    if args.dataset in ("hawker", "all"):
        fetch_hawker_centres(conn, args.dry_run)

    if args.dataset in ("nea", "all"):
        fetch_nea_hygiene(conn, args.dry_run)

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
