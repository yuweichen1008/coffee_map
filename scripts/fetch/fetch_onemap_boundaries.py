#!/usr/bin/env python3
"""
Fetch Singapore planning area GeoJSON polygons from OneMap API.

OneMap is Singapore's official geocoding platform (free, no key for polygon queries).
Polygons are stored in sg_planning_areas and used to render district overlays on the map.

Usage:
  python3 fetch_onemap_boundaries.py
  python3 fetch_onemap_boundaries.py --dry-run
  python3 fetch_onemap_boundaries.py --update-districts   # re-assign places.district from polygon
"""

from __future__ import annotations
import argparse
import os
import sys
import json
import time
import requests
import psycopg2
from psycopg2.extras import Json

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

ONEMAP_BASE = "https://www.onemap.gov.sg/api/public/popapi"

# All 55 Singapore URA planning areas
PLANNING_AREAS = [
    "ANG MO KIO", "BEDOK", "BISHAN", "BOON LAY", "BUKIT BATOK",
    "BUKIT MERAH", "BUKIT PANJANG", "BUKIT TIMAH", "CENTRAL WATER CATCHMENT",
    "CHANGI", "CHANGI BAY", "CHOA CHU KANG", "CLEMENTI", "DOWNTOWN CORE",
    "GEYLANG", "HOUGANG", "JURONG EAST", "JURONG WEST", "KALLANG",
    "LAM CHUAN RESERVOIR", "LENG KANG", "LENG KANG (EAST)", "LENG KANG (WEST)",
    "MANDAI", "MARINA EAST", "MARINA SOUTH", "MARINE PARADE", "MUSEUM",
    "NEWTON", "NOVENA", "ORCHARD", "OUTRAM", "PASIR RIS", "PAYA LEBAR",
    "PIONEER", "PUNGGOL", "QUEENSTOWN", "RIVER VALLEY", "ROCHOR",
    "SELETAR", "SEMBAWANG", "SENGKANG", "SERANGOON", "SIMPANG",
    "SINGAPORE RIVER", "SOUTHERN ISLANDS", "STRAITS VIEW", "TANGLIN",
    "TENGAH", "TOA PAYOH", "TUAS", "WESTERN ISLANDS", "WESTERN WATER CATCHMENT",
    "WOODLANDS", "YISHUN",
]


def fetch_polygon(area: str) -> dict | None:
    url = f"{ONEMAP_BASE}/getPlanningAreaPolygon"
    params = {"planningArea": area, "year": 2019}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        # OneMap returns {"geojson": "...stringified JSON..."}
        raw = data.get("geojson") or data.get("planningBoundary") or data
        if isinstance(raw, str):
            return json.loads(raw)
        return raw
    except Exception as e:
        print(f"  [WARN] {area}: {e}", file=sys.stderr)
        return None


def compute_area_sqkm(geojson: dict) -> float:
    """Rough area estimate — bounding box of the polygon coordinates."""
    try:
        coords = geojson.get("coordinates", [[]])[0]
        lats   = [c[1] for c in coords]
        lngs   = [c[0] for c in coords]
        dlat   = (max(lats) - min(lats)) * 111.0
        dlng   = (max(lngs) - min(lngs)) * 111.0 * 0.85  # ~latitude correction
        return round(dlat * dlng, 2)
    except Exception:
        return 0.0


def main():
    parser = argparse.ArgumentParser(description="Fetch Singapore planning area boundaries from OneMap")
    parser.add_argument("--dry-run",         action="store_true")
    parser.add_argument("--update-districts", action="store_true",
                        help="After loading polygons, re-assign places.district using ST_Within")
    args = parser.parse_args()

    print(f"Connecting to: {DATABASE_URL[:40]}...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    loaded = 0
    for area in PLANNING_AREAS:
        print(f"  Fetching: {area}...", end=" ")
        geojson = fetch_polygon(area)
        if not geojson:
            print("SKIP")
            continue

        area_sqkm = compute_area_sqkm(geojson)
        print(f"OK ({area_sqkm:.1f} km²)")

        if not args.dry_run:
            cur.execute("""
                INSERT INTO sg_planning_areas (name, geojson, area_sqkm)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) DO UPDATE SET
                  geojson    = EXCLUDED.geojson,
                  area_sqkm  = EXCLUDED.area_sqkm,
                  updated_at = now()
            """, (area, Json(geojson), area_sqkm))
            loaded += 1

        time.sleep(0.4)

    if not args.dry_run:
        conn.commit()
        print(f"\nLoaded {loaded} planning area polygons")

    if args.update_districts and not args.dry_run:
        print("\nRe-assigning places.district from polygon containment...")
        cur.execute("""
            UPDATE places p
            SET district = sg.name
            FROM sg_planning_areas sg
            WHERE ST_Within(
              ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
              ST_SetSRID(ST_GeomFromGeoJSON(sg.geojson::text), 4326)
            )
            AND p.lat BETWEEN 1.15 AND 1.48
            AND p.lng BETWEEN 103.60 AND 104.10
        """)
        updated = cur.rowcount
        conn.commit()
        print(f"  Re-assigned {updated} Singapore places to planning areas")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
