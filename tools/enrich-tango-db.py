#!/usr/bin/env python3
"""
enrich-tango-db.py — Add singer field to data/tango-db.json

Downloads elrecodo.csv from galanakis/tangomusicdb (or reads a local copy),
matches entries by normalised "title|orchestra" key, and adds "s": "Singer Name"
to matched entries in data/tango-db.json.

Usage:
    # Download CSV automatically:
    python3 tools/enrich-tango-db.py

    # Use a local CSV file:
    python3 tools/enrich-tango-db.py --csv /path/to/elrecodo.csv

    # Dry-run (print stats, don't write):
    python3 tools/enrich-tango-db.py --dry-run

The script is idempotent — safe to re-run. It only adds "s" where missing
and the CSV has a non-blank singer. It never overwrites an existing "s" value.
"""

import argparse
import json
import os
import sys
import unicodedata
import urllib.request


CSV_URL = (
    "https://raw.githubusercontent.com/galanakis/tangomusicdb/master/elrecodo.csv"
)
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "tango-db.json")


def normalise(text):
    """
    Normalise a string to match tango-db.json key format:
      - Strip leading/trailing whitespace
      - Lowercase
      - Decompose Unicode and strip combining characters (accents → ASCII)
      - Collapse multiple spaces to one

    The existing tango-db keys are pure ASCII (verified), so this matches
    the normalisation applied when the DB was originally built.
    """
    if not text:
        return ""
    text = text.strip().lower()
    # NFKD decomposition strips accents: á→a, ñ→n, ü→u, etc.
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    # Collapse multiple whitespace
    text = " ".join(text.split())
    return text


def load_csv(path):
    """
    Parse elrecodo.csv. Expected columns (tab-separated or comma-separated):
    Tries to detect delimiter from header row.

    Returns list of dicts with at least: title, orchestra, singer
    """
    import csv

    rows = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        # Sniff delimiter
        sample = fh.read(4096)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t|")
        except csv.Error:
            dialect = csv.excel  # fallback to comma

        reader = csv.DictReader(fh, dialect=dialect)
        # Normalise header names to lowercase
        for row in reader:
            rows.append({k.strip().lower(): v.strip() for k, v in row.items()})

    return rows


def download_csv(url, dest):
    print(f"Downloading CSV from {url} ...")
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f"  Downloaded: {dest}  ({size:,} bytes)")
    except Exception as exc:
        sys.exit(f"ERROR: Download failed: {exc}\n"
                 "Use --csv to provide a local file instead.")


def find_singer_column(sample_rows):
    """
    Detect which CSV column holds the singer/vocalist name.
    Common names: singer, vocalist, cantante, vocal
    """
    if not sample_rows:
        return None
    candidates = ["singer", "vocalist", "cantante", "vocal", "vocals", "voz"]
    keys = list(sample_rows[0].keys())
    for c in candidates:
        if c in keys:
            return c
    # Partial match
    for key in keys:
        if any(c in key for c in candidates):
            return key
    return None


def find_column(sample_rows, candidates):
    if not sample_rows:
        return None
    keys = list(sample_rows[0].keys())
    for c in candidates:
        if c in keys:
            return c
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Enrich tango-db.json with singer fields from elrecodo.csv"
    )
    parser.add_argument(
        "--csv",
        metavar="PATH",
        help="Path to local elrecodo.csv (downloads from GitHub if omitted)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print stats without modifying tango-db.json",
    )
    parser.add_argument(
        "--db",
        default=DB_PATH,
        metavar="PATH",
        help=f"Path to tango-db.json (default: {DB_PATH})",
    )
    args = parser.parse_args()

    # ── Load tango-db.json ────────────────────────────────────────────────────
    db_path = os.path.abspath(args.db)
    if not os.path.exists(db_path):
        sys.exit(f"ERROR: tango-db.json not found at {db_path}")

    print(f"Loading {db_path} ...")
    with open(db_path, encoding="utf-8") as fh:
        db = json.load(fh)
    print(f"  {len(db):,} entries loaded")

    already_has_singer = sum(1 for v in db.values() if v.get("s"))
    print(f"  {already_has_singer:,} already have singer field")

    # ── Get CSV ───────────────────────────────────────────────────────────────
    if args.csv:
        csv_path = os.path.abspath(args.csv)
        if not os.path.exists(csv_path):
            sys.exit(f"ERROR: CSV not found at {csv_path}")
    else:
        csv_path = os.path.join(os.path.dirname(db_path), "_elrecodo_tmp.csv")
        download_csv(CSV_URL, csv_path)

    print(f"\nParsing CSV ...")
    rows = load_csv(csv_path)
    print(f"  {len(rows):,} rows in CSV")

    if not rows:
        sys.exit("ERROR: CSV appears empty or failed to parse.")

    # ── Detect columns ────────────────────────────────────────────────────────
    singer_col = find_singer_column(rows)
    title_col  = find_column(rows, ["title", "titulo", "name", "track"])
    orch_col   = find_column(rows, ["orchestra", "orquesta", "artist", "band",
                                    "orchestra_name"])

    print(f"  Detected columns — title: '{title_col}'  orchestra: '{orch_col}'  "
          f"singer: '{singer_col}'")

    if not title_col or not orch_col or not singer_col:
        print("\nAvailable columns:", list(rows[0].keys()))
        sys.exit(
            "ERROR: Could not auto-detect required columns.\n"
            "Please check the CSV header and update the script if needed."
        )

    # ── Build lookup from CSV ─────────────────────────────────────────────────
    # key: "normalised_title|normalised_orchestra" → singer string
    csv_lookup = {}
    blank_singer = 0
    for row in rows:
        title  = normalise(row.get(title_col, ""))
        orch   = normalise(row.get(orch_col, ""))
        singer = row.get(singer_col, "").strip()

        if not title or not orch:
            continue
        if not singer:
            blank_singer += 1
            continue  # instrumental — skip

        key = f"{title}|{orch}"
        # If multiple rows for same key, join with " / " (common for alternating
        # vocalists on the same recording)
        if key in csv_lookup:
            existing = csv_lookup[key]
            if singer not in existing:
                csv_lookup[key] = existing + " / " + singer
        else:
            csv_lookup[key] = singer

    print(f"  {len(csv_lookup):,} unique keyed entries with singer")
    print(f"  {blank_singer:,} instrumental rows (no singer — skipped)")

    # ── Match and enrich ──────────────────────────────────────────────────────
    matched   = 0
    skipped   = 0  # already had singer
    not_found = 0

    for key, val in db.items():
        if val.get("s"):
            skipped += 1
            continue
        singer = csv_lookup.get(key)
        if singer:
            if not args.dry_run:
                val["s"] = singer
            matched += 1
        else:
            not_found += 1

    print(f"\nResults:")
    print(f"  Matched + added singer : {matched:,}")
    print(f"  Already had singer     : {skipped:,}")
    print(f"  No match in CSV        : {not_found:,}")
    print(f"  Total entries          : {len(db):,}")

    if args.dry_run:
        print("\n[dry-run] No changes written.")
        return

    # ── Write updated DB ──────────────────────────────────────────────────────
    # Backup original
    backup_path = db_path + ".bak"
    import shutil
    shutil.copy2(db_path, backup_path)
    print(f"\nBackup written: {backup_path}")

    with open(db_path, "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(",", ":"))

    new_size = os.path.getsize(db_path)
    print(f"Updated: {db_path}  ({new_size:,} bytes)")

    # ── Cleanup temp CSV ──────────────────────────────────────────────────────
    if not args.csv and os.path.exists(csv_path):
        os.remove(csv_path)
        print("Temp CSV removed.")

    print(f"\nDone. {matched:,} entries enriched with singer data.")
    print("Run with --dry-run to preview without writing.")


if __name__ == "__main__":
    main()
