"""
data.gov.sg v2 API client.

The old CKAN API (data.gov.sg/api/action/datastore_search) was retired.
The new API uses a poll-download pattern that returns a signed S3 CSV URL.

Flow:
  1. GET /v1/public/api/datasets/{datasetId}/poll-download  → S3 URL
  2. GET {S3 URL}                                           → CSV bytes

Dataset IDs are visible in the URL when you browse data.gov.sg:
  https://data.gov.sg/datasets/{datasetId}/view
  e.g. https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view

Usage:
  from govdata_client import fetch_dataset_csv, parse_csv

  rows = fetch_dataset_csv("d_8884b6aa4bce14fb1b5db13f39c84c978")
  # rows is a list of dicts, one per CSV row
"""

import csv
import io
import json
import sys
import time
import urllib.request

POLL_DOWNLOAD_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets/{dataset_id}/poll-download"

# data.gov.sg blocks Python's default User-Agent
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def _get_json(url, retries=3, backoff=2.0):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if e.code == 429 or e.code >= 500:
                if attempt < retries - 1:
                    time.sleep(backoff * (attempt + 1))
                    continue
            raise
    return None


def get_download_url(dataset_id):
    """Resolve the signed S3 download URL for a dataset."""
    poll_url = POLL_DOWNLOAD_BASE.format(dataset_id=dataset_id)
    try:
        data = _get_json(poll_url)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[govdata] Dataset not found: {dataset_id}", file=sys.stderr)
            print(f"  Find the ID at: https://data.gov.sg/datasets/{dataset_id}/view", file=sys.stderr)
            print(f"  Or search: https://data.gov.sg/ and copy the ID from the URL.", file=sys.stderr)
        raise

    if not data or data.get("code") != 0:
        raise RuntimeError(f"[govdata] Unexpected response: {data}")

    return data["data"]["url"]


def fetch_dataset_csv(dataset_id, encoding="utf-8-sig"):
    """
    Download a data.gov.sg dataset and return it as a list of row dicts.

    Args:
        dataset_id: The d_* ID from the dataset URL on data.gov.sg
        encoding:   CSV file encoding (default utf-8-sig handles BOM)

    Returns:
        list of dicts, one per CSV row

    Raises:
        urllib.error.HTTPError if dataset_id is wrong or API is down
    """
    print(f"[govdata] Resolving download URL for {dataset_id}…")
    s3_url = get_download_url(dataset_id)

    print(f"[govdata] Downloading CSV…")
    req = urllib.request.Request(s3_url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()

    text   = raw.decode(encoding, errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows   = list(reader)
    print(f"[govdata] {len(rows):,} rows fetched  (columns: {', '.join(reader.fieldnames or [])})")
    return rows


# ── Known dataset IDs ────────────────────────────────────────────────────────
# Find these by visiting data.gov.sg and copying the ID from the dataset URL.
# IDs change when datasets are re-published — check if you get a 404.
DATASET_IDS = {
    # HDB resale prices (confirmed 2026-05)
    "hdb_resale":       "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",

    # NEA hawker centres — GeoJSON with locations, stall counts, status (confirmed 2026-05)
    "hawker_centres":   "d_4a086da0a5553be1d89383cd90d07ecd",

    # NEA tabular hawker centre list with addresses (confirmed 2026-05)
    "hawker_centres_list": "d_68a42f09f350881996d83f9cd73ab02f",

    # NEA licensed eating establishments — 36k+ individual premises with address,
    # licence number, grade, demerit points (confirmed 2026-05)
    # Replaces old SFA dataset which was reorganised
    "sfa_food_license": "d_227473e811b09731e64725f140b77697",

    # Singstat Census 2020 — resident population by planning area + subzone + dwelling type
    "population_pa":    "d_7f243956483d5901f237e6f87b096636",
}
