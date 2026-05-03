#!/usr/bin/env python3
"""
Fetch all LTA bus stops and compute bus_stops_400m per Singapore place.

LTA DataMall API key required (free, instant):
  https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html

Usage:
  LTA_API_KEY=your_key python3 fetch_lta_busstops.py
  LTA_API_KEY=your_key python3 fetch_lta_busstops.py --dry-run
  LTA_API_KEY=your_key python3 fetch_lta_busstops.py --skip-update   # import stops only
"""

import argparse
import os
import sys
import time
import requests
import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")
LTA_API_KEY  = os.environ.get("LTA_API_KEY", "")
LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice"


def fetch_bus_stops() -> list:
    """Paginate through LTA Bus Stops — returns in batches of 500."""
    if not LTA_API_KEY:
        print("[ERROR] LTA_API_KEY environment variable not set", file=sys.stderr)
        print("  Get a free key at: https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html")
        sys.exit(1)

    headers = {"AccountKey": LTA_API_KEY, "accept": "application/json"}
    stops   = []
    skip    = 0

    print("Fetching LTA bus stops...")
    while True:
        url  = f"{LTA_BASE_URL}/BusStops?$skip={skip}"
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        batch = resp.json().get("value", [])
        if not batch:
            break
        stops.extend(batch)
        print(f"  Fetched {len(stops)} stops", end="\r")
        skip += 500
        time.sleep(0.5)

    print(f"\n  Total: {len(stops)} bus stops")
    return stops


def load_bus_stops(conn, stops: list, dry_run: bool):
    rows = []
    for s in stops:
        code = s.get("BusStopCode", "")
        road = s.get("RoadName", "")
        desc = s.get("Description", "")
        lat  = s.get("Latitude")
        lng  = s.get("Longitude")
        if not code or not lat or not lng:
            continue
        rows.append((code, road, desc, float(lat), float(lng)))

    print(f"  Valid stops: {len(rows)}")
    if dry_run:
        print("  [DRY RUN] Skipping DB write")
        for r in rows[:5]:
            print(f"    {r}")
        return

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO sg_bus_stops (stop_code, road_name, description, lat, lng, location)
            VALUES %s
            ON CONFLICT (stop_code) DO UPDATE SET
              road_name   = EXCLUDED.road_name,
              description = EXCLUDED.description,
              lat         = EXCLUDED.lat,
              lng         = EXCLUDED.lng,
              location    = EXCLUDED.location
        """, [
            (code, road, desc, lat, lng, f"SRID=4326;POINT({lng} {lat})")
            for code, road, desc, lat, lng in rows
        ])
    conn.commit()
    print(f"  Upserted {len(rows)} bus stops")


def update_place_counts(conn, dry_run: bool):
    """Compute bus_stops_400m for each Singapore place using PostGIS ST_DWithin."""
    print("\nUpdating bus_stops_400m for Singapore places...")
    if dry_run:
        print("  [DRY RUN] Skipping UPDATE")
        return

    with conn.cursor() as cur:
        cur.execute("""
            UPDATE places
            SET bus_stops_400m = (
              SELECT COUNT(*)::smallint
              FROM sg_bus_stops
              WHERE ST_DWithin(
                sg_bus_stops.location::geography,
                places.location::geography,
                400
              )
            )
            WHERE lat BETWEEN 1.15 AND 1.48
              AND lng BETWEEN 103.60 AND 104.10
        """)
        updated = cur.rowcount
    conn.commit()
    print(f"  Updated {updated} Singapore places with bus stop counts")


def main():
    parser = argparse.ArgumentParser(description="Fetch LTA bus stops + update foot traffic proxy")
    parser.add_argument("--dry-run",     action="store_true")
    parser.add_argument("--skip-update", action="store_true",
                        help="Import bus stops but skip updating places.bus_stops_400m")
    args = parser.parse_args()

    print(f"Connecting to: {DATABASE_URL[:40]}...")
    conn = psycopg2.connect(DATABASE_URL)

    stops = fetch_bus_stops()
    load_bus_stops(conn, stops, args.dry_run)

    if not args.skip_update:
        update_place_counts(conn, args.dry_run)

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
