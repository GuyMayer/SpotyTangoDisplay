#!/usr/bin/env python3
"""
enrich-tango-db.py — Add singer field to data/tango-db.json

Two complementary enrichment modes, run in order:

  1. CSV mode (precise, per-track):
     Downloads elrecodo.csv from galanakis/tangomusicdb (or reads a local copy)
     and adds "s": "Singer Name" to each matched entry.
     Skip this mode with --no-csv, or it is skipped automatically if download
     fails and no local file is provided.

  2. Orchestra fallback (offline, always available):
     Reads data/orchestras.json and fills remaining gaps using the orchestra's
     notable_singers list. Useful when running offline — covers the ~25
     prominent orchestras that account for most of the DB.
     Disable with --no-fallback.

Usage:
    python3 tools/enrich-tango-db.py            # try CSV, fill gaps from local data
    python3 tools/enrich-tango-db.py --no-csv   # offline only (orchestras.json)
    python3 tools/enrich-tango-db.py --csv /path/to/elrecodo.csv  # local CSV file
    python3 tools/enrich-tango-db.py --dry-run  # preview, no writes

The script is idempotent. It never overwrites an existing "s" value.
A .bak of tango-db.json is written before any changes.
"""

import argparse
import json
import os
import shutil
import sys
import unicodedata
import urllib.request


CSV_URL = (
    "https://raw.githubusercontent.com/galanakis/tangomusicdb/master/elrecodo.csv"
)
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "tango-db.json")
ORCH_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "orchestras.json")


# ── Normalisation ─────────────────────────────────────────────────────────────

def normalise(text):
    """
    Normalise text to match tango-db.json key format:
      - strip whitespace, lowercase
      - NFKD decomposition strips accents (á→a, ñ→n, ü→u)
      - strip apostrophes and other punctuation (d'Arienzo → darienzo)
      - collapse multiple spaces

    This matches the normalisation used when tango-db.json was originally built.
    Verified: DB keys are pure ASCII, punctuation-free.
    """
    if not text:
        return ""
    text = text.strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(c for c in text if c.isalnum() or c == " ")
    return " ".join(text.split())


# ── CSV mode ──────────────────────────────────────────────────────────────────

def download_csv(url, dest):
    print(f"  Downloading CSV from GitHub ...")
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"  Downloaded: {os.path.getsize(dest):,} bytes")
        return True
    except Exception as exc:
        print(f"  Download failed: {exc}")
        return False


def load_csv(path):
    import csv

    with open(path, encoding="utf-8", errors="replace") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t|")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(fh, dialect=dialect)
        rows = [{k.strip().lower(): v.strip() for k, v in row.items()}
                for row in reader]
    return rows


def find_col(rows, candidates):
    if not rows:
        return None
    keys = set(rows[0].keys())
    for c in candidates:
        if c in keys:
            return c
    return None


def build_csv_lookup(rows):
    """
    Returns dict: "normalised_title|normalised_orchestra" → singer string.
    Multiple vocalists on the same key are joined with " / ".
    Blank singers (instrumentals) are skipped.
    """
    title_col  = find_col(rows, ["title", "titulo", "name", "track"])
    orch_col   = find_col(rows, ["orchestra", "orquesta", "artist", "band",
                                  "orchestra_name"])
    singer_col = find_col(rows, ["singer", "vocalist", "cantante", "vocal",
                                  "vocals", "voz"])

    if not title_col or not orch_col or not singer_col:
        print(f"  WARNING: Could not detect required columns in CSV.")
        print(f"  Available columns: {list(rows[0].keys())}")
        return {}

    print(f"  CSV columns — title: {title_col!r}  orchestra: {orch_col!r}  "
          f"singer: {singer_col!r}")

    lookup = {}
    skipped_blank = 0
    for row in rows:
        title  = normalise(row.get(title_col, ""))
        orch   = normalise(row.get(orch_col, ""))
        singer = row.get(singer_col, "").strip()
        if not title or not orch:
            continue
        if not singer:
            skipped_blank += 1
            continue
        key = f"{title}|{orch}"
        if key in lookup:
            if singer not in lookup[key]:
                lookup[key] += " / " + singer
        else:
            lookup[key] = singer

    print(f"  {len(lookup):,} keyed CSV entries with singer "
          f"({skipped_blank:,} instrumentals skipped)")
    return lookup


def enrich_from_csv(db, lookup, dry_run=False):
    matched = 0
    for key, val in db.items():
        if val.get("s"):
            continue
        singer = lookup.get(key)
        if singer:
            if not dry_run:
                val["s"] = singer
            matched += 1
    return matched


# ── Orchestra fallback ────────────────────────────────────────────────────────

def build_orchestra_lookup(orch_path):
    """
    Returns dict: normalised_orchestra_name → "Singer A / Singer B / ..."
    Reads data/orchestras.json. Skips orchestras with no notable_singers.
    """
    if not os.path.exists(orch_path):
        print(f"  WARNING: orchestras.json not found at {orch_path}")
        return {}

    with open(orch_path, encoding="utf-8") as fh:
        data = json.load(fh)

    lookup = {}
    for raw_key, orch in data.items():
        singers = orch.get("notable_singers", [])
        if not singers:
            continue
        norm_key = normalise(raw_key)
        if norm_key:
            lookup[norm_key] = " / ".join(singers)

    print(f"  orchestras.json: {len(lookup)} orchestras with vocalist data")
    return lookup


def enrich_from_orchestras(db, orch_lookup, dry_run=False):
    """
    Fill entries that still have no "s" field using the orchestra-level
    notable_singers from orchestras.json. This is an approximation — the
    singers listed are the prominent vocalists for the orchestra but are
    not guaranteed to appear on any specific track.
    """
    filled = 0
    for db_key, val in db.items():
        if val.get("s"):
            continue
        if "|" not in db_key:
            continue
        orch_part = db_key.split("|", 1)[1]
        singers = orch_lookup.get(orch_part)
        if singers:
            if not dry_run:
                val["s"] = singers
            filled += 1
    return filled


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Enrich tango-db.json with singer data"
    )
    parser.add_argument("--csv", metavar="PATH",
                        help="Path to local elrecodo.csv (tries GitHub download if omitted)")
    parser.add_argument("--no-csv", action="store_true",
                        help="Skip CSV mode entirely (offline / orchestra fallback only)")
    parser.add_argument("--no-fallback", action="store_true",
                        help="Skip orchestra fallback (CSV only)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print stats without modifying tango-db.json")
    parser.add_argument("--db", default=DB_PATH, metavar="PATH",
                        help=f"Path to tango-db.json (default: {DB_PATH})")
    parser.add_argument("--orchestras", default=ORCH_PATH, metavar="PATH",
                        help=f"Path to orchestras.json (default: {ORCH_PATH})")
    args = parser.parse_args()

    # ── Load DB ───────────────────────────────────────────────────────────────
    db_path = os.path.abspath(args.db)
    if not os.path.exists(db_path):
        sys.exit(f"ERROR: tango-db.json not found at {db_path}")

    print(f"\nLoading {db_path} ...")
    with open(db_path, encoding="utf-8") as fh:
        db = json.load(fh)

    total = len(db)
    already = sum(1 for v in db.values() if v.get("s"))
    print(f"  {total:,} entries  ({already:,} already have singer, "
          f"{total - already:,} need filling)")

    csv_matched  = 0
    orch_filled  = 0
    tmp_csv_path = None

    # ── Mode 1: CSV ───────────────────────────────────────────────────────────
    if not args.no_csv:
        print(f"\n── CSV mode ──")
        csv_path = args.csv

        if csv_path:
            csv_path = os.path.abspath(csv_path)
            if not os.path.exists(csv_path):
                sys.exit(f"ERROR: CSV not found at {csv_path}")
            print(f"  Using local CSV: {csv_path}")
        else:
            # Try downloading
            tmp_csv_path = os.path.join(os.path.dirname(db_path), "_elrecodo_tmp.csv")
            ok = download_csv(CSV_URL, tmp_csv_path)
            if ok:
                csv_path = tmp_csv_path
            else:
                print("  CSV unavailable — skipping CSV mode, will use orchestra fallback.")
                csv_path = None

        if csv_path:
            rows = load_csv(csv_path)
            print(f"  {len(rows):,} rows in CSV")
            if rows:
                lookup = build_csv_lookup(rows)
                csv_matched = enrich_from_csv(db, lookup, dry_run=args.dry_run)
                print(f"  CSV matched: {csv_matched:,} entries enriched")
    else:
        print("\n── CSV mode skipped (--no-csv) ──")

    # ── Mode 2: Orchestra fallback ────────────────────────────────────────────
    if not args.no_fallback:
        print(f"\n── Orchestra fallback mode ──")
        orch_lookup = build_orchestra_lookup(os.path.abspath(args.orchestras))
        orch_filled = enrich_from_orchestras(db, orch_lookup, dry_run=args.dry_run)
        print(f"  Fallback filled: {orch_filled:,} entries "
              f"(orchestra-level vocalist data)")
    else:
        print("\n── Orchestra fallback skipped (--no-fallback) ──")

    # ── Summary ───────────────────────────────────────────────────────────────
    total_new  = csv_matched + orch_filled
    total_with = already + total_new
    print(f"\n── Summary ──")
    print(f"  CSV matches     : {csv_matched:,}")
    print(f"  Fallback fills  : {orch_filled:,}")
    print(f"  Already had 's' : {already:,}")
    print(f"  Still missing   : {total - total_with:,}")
    print(f"  Total coverage  : {total_with:,} / {total:,} "
          f"({100 * total_with / total:.1f}%)")

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return

    if total_new == 0:
        print("\nNo new data to write — tango-db.json unchanged.")
        return

    # ── Write ─────────────────────────────────────────────────────────────────
    backup_path = db_path + ".bak"
    shutil.copy2(db_path, backup_path)
    print(f"\nBackup: {backup_path}")

    with open(db_path, "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"Written: {db_path}  ({os.path.getsize(db_path):,} bytes)")

    # Cleanup temp download
    if tmp_csv_path and os.path.exists(tmp_csv_path):
        os.remove(tmp_csv_path)

    print(f"\nDone. {total_new:,} entries enriched.")
    if orch_filled > 0 and not args.no_fallback:
        print("Note: fallback entries list all notable singers for the orchestra,")
        print("not necessarily the vocalist on each specific track.")


if __name__ == "__main__":
    main()

