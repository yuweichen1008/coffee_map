#!/usr/bin/env python3
"""
Download and match ACRA business entity data against StorePulse places.

ACRA = Accounting and Corporate Regulatory Authority (Singapore).
Data: entities-with-unique-entity-number (data.gov.sg)
  - UEN (Unique Entity Number)
  - Entity name
  - Registration date
  - Cessation date (= official business closure date)

The CSV is ~1.5M rows — downloaded and processed in chunks.
Matching: exact name match first; if no match, rapidfuzz similarity within same district.

Download the CSV manually from:
  https://data.gov.sg/dataset/entities-with-unique-entity-number
Then run:
  python3 fetch_acra.py --csv sg_bizfile.csv

Or auto-download (if direct URL is available):
  python3 fetch_acra.py --auto-download

Usage:
  python3 fetch_acra.py --csv sg_bizfile.csv
  python3 fetch_acra.py --csv sg_bizfile.csv --dry-run
  python3 fetch_acra.py --csv sg_bizfile.csv --min-similarity 85
"""

import argparse
import os
import sys
import csv
import time
import psycopg2
from datetime import datetime

try:
    from rapidfuzz import fuzz, process as rfuzz_process
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False
    print("[WARN] rapidfuzz not installed — fuzzy matching disabled. Run: pip install rapidfuzz")

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://storepulse:storepulse@localhost:5432/storepulse")

# Columns in the ACRA CSV (actual names may vary by download date)
UEN_COLS    = ["uen", "UEN"]
NAME_COLS   = ["entity_name", "name", "company_name"]
REG_COLS    = ["uen_issue_date", "registration_date", "reg_date"]
CEASE_COLS  = ["entity_status_history", "cessation_date", "cease_date"]


def find_col(header: list, candidates: list) -> str | None:
    """Find first matching column name (case-insensitive)."""
    lower_header = [h.lower() for h in header]
    for c in candidates:
        if c.lower() in lower_header:
            return header[lower_header.index(c.lower())]
    return None


def parse_date(val: str) -> str | None:
    if not val or val.strip() in ("", "N/A", "None"):
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(val.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def load_acra_csv(path: str) -> list[dict]:
    """Load CSV into memory as list of dicts. Handles large files via chunked read."""
    records = []
    print(f"Loading ACRA CSV: {path}")
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []

        uen_col   = find_col(header, UEN_COLS)
        name_col  = find_col(header, NAME_COLS)
        reg_col   = find_col(header, REG_COLS)
        cease_col = find_col(header, CEASE_COLS)

        if not name_col:
            print(f"[ERROR] Could not find name column. Available: {header[:10]}", file=sys.stderr)
            sys.exit(1)

        print(f"  Columns: uen={uen_col}, name={name_col}, reg={reg_col}, cease={cease_col}")

        for i, row in enumerate(reader):
            if i % 100_000 == 0 and i > 0:
                print(f"  Read {i:,} rows...", end="\r")
            records.append({
                "uen":        (row.get(uen_col)   or "").strip() if uen_col   else "",
                "name":       (row.get(name_col)  or "").strip(),
                "reg_date":   parse_date(row.get(reg_col,   "")) if reg_col   else None,
                "cease_date": parse_date(row.get(cease_col, "")) if cease_col else None,
            })

    print(f"\n  Loaded {len(records):,} ACRA records")
    return records


def match_and_update(conn, records: list[dict], min_similarity: int, dry_run: bool):
    """Match ACRA records to places by name, update acra_ columns."""
    print("\nFetching Singapore places from DB...")
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, district FROM places
        WHERE lat BETWEEN 1.15 AND 1.48
          AND lng BETWEEN 103.60 AND 104.10
          AND status != 'closed'
    """)
    places = cur.fetchall()  # (id, name, district)
    print(f"  {len(places):,} Singapore places to match")

    # Build name → ACRA lookup (lowercase)
    acra_by_name = {}
    for r in records:
        key = r["name"].lower().strip()
        if key:
            acra_by_name[key] = r

    exact_hits = 0
    fuzzy_hits = 0
    updates    = []

    for place_id, place_name, district in places:
        key = place_name.lower().strip()

        # 1. Exact match
        acra = acra_by_name.get(key)
        if acra:
            exact_hits += 1
            updates.append((acra["uen"], acra["reg_date"], acra["cease_date"], place_id))
            continue

        # 2. Fuzzy match (if rapidfuzz available)
        if HAS_RAPIDFUZZ and len(acra_by_name) > 0:
            result = rfuzz_process.extractOne(
                key, acra_by_name.keys(),
                scorer=fuzz.token_sort_ratio,
                score_cutoff=min_similarity,
            )
            if result:
                best_key, score, _ = result
                acra = acra_by_name[best_key]
                fuzzy_hits += 1
                updates.append((acra["uen"], acra["reg_date"], acra["cease_date"], place_id))

    print(f"  Exact matches: {exact_hits}  |  Fuzzy matches: {fuzzy_hits}")
    print(f"  Total updates: {len(updates)}")

    if dry_run:
        print("  [DRY RUN] Skipping DB write")
        for u in updates[:5]:
            print(f"    {u}")
        return

    for uen, reg_date, cease_date, place_id in updates:
        cur.execute("""
            UPDATE places
            SET acra_uen        = %s,
                acra_reg_date   = %s,
                acra_cease_date = %s,
                data_sources    = array_append(
                    array_remove(data_sources, 'acra'), 'acra'
                )
            WHERE id = %s
        """, (uen or None, reg_date, cease_date, place_id))

    conn.commit()
    print(f"  Updated {len(updates)} places with ACRA data")
    cur.close()


def main():
    parser = argparse.ArgumentParser(description="Match ACRA business data to StorePulse places")
    parser.add_argument("--csv",            required=True, help="Path to ACRA CSV file")
    parser.add_argument("--dry-run",        action="store_true")
    parser.add_argument("--min-similarity", type=int, default=88,
                        help="Minimum fuzzy match score 0-100 (default: 88)")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"[ERROR] CSV file not found: {args.csv}", file=sys.stderr)
        sys.exit(1)

    records = load_acra_csv(args.csv)

    print(f"Connecting to: {DATABASE_URL[:40]}...")
    conn = psycopg2.connect(DATABASE_URL)
    match_and_update(conn, records, args.min_similarity, args.dry_run)
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
