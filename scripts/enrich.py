"""
enrich.py
Reads the source CSV, fetches full data from TMDB API for movies, TV shows,
and individual TV episodes, and writes data.json to the project root.

For each entry the script tries (in order):
  1. tmdb_id -> /movie/{id}
  2. tmdb_id -> /tv/{id}                     (if movie 404s)
  3. imdb_id -> /find endpoint -> movie/tv    (if no tmdb_id, or above failed)
  4. imdb_id -> /find endpoint -> tv_episode  (individual logged episodes)
  5. Save to failed.json + skip               (if all above fail)

Setup:
    python3 -m venv .venv
    source .venv/bin/activate
    pip install requests python-dotenv

Run from project root:
    python scripts/enrich.py             # full run  -> data.json
    python scripts/enrich.py --limit 10  # test run  -> data_test.json
    python scripts/enrich.py --csv scripts/test_input.csv
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests python-dotenv")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

BEARER_TOKEN = os.environ.get("TMDB_BEARER_TOKEN")
if not BEARER_TOKEN:
    print("ERROR: TMDB_BEARER_TOKEN not found in .env")
    sys.exit(1)

BASE_URL = "https://api.themoviedb.org/3"
CSV_PATH = ROOT / "enriched_imdb_movies_feb 2.csv"

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "accept": "application/json",
}

# Delay between requests (seconds). ~2.8 req/s — well within TMDB's 40/10s limit.
REQUEST_DELAY = 0.35

# Retries per request before giving up.
MAX_RETRIES = 3

# Writing department job titles to capture.
WRITER_JOBS = {
    "Screenplay", "Writer", "Story", "Novel", "Characters",
    "Original Story", "Book", "Comic Book", "Adaptation",
    "Idea", "Original Concept", "Teleplay",
}


# ---------------------------------------------------------------------------
# CSV loading
# ---------------------------------------------------------------------------

def _get(row: dict, *keys: str, default: str = "") -> str:
    """Try multiple column name variants, return first match."""
    for key in keys:
        val = row.get(key, "").strip()
        if val:
            return val
    return default


def load_csv(path: Path) -> list[dict]:
    """
    Load the source CSV. Supports both formats:

    1. Enriched format (friend's file):
         Title ID, Rating, Last Modified Date, imdb_id_extracted, tmdb_id, ...

    2. Raw IMDB export (from imdb.com/list or ratings page):
         Const, Your Rating, Date Rated, Title, URL, Title Type, ...

    The only hard requirement is at least one of:
      - A TMDB ID  (column: 'tmdb_id')
      - An IMDB ID (columns: 'imdb_id_extracted', 'Title ID', or 'Const')
    Everything else is optional and fetched from TMDB.
    """
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            # TMDB ID (enriched format only — raw IMDB exports don't have this)
            tmdb_raw = _get(row, "tmdb_id")
            try:
                tmdb_id = int(tmdb_raw) if tmdb_raw else None
            except ValueError:
                tmdb_id = None

            # IMDB ID — try all known column names across both formats
            imdb_id = _get(row, "imdb_id_extracted", "Title ID", "Const") or None

            # Personal rating
            rating_raw = _get(row, "Rating", "Your Rating", default="0")
            try:
                personal_rating = int(float(rating_raw))  # float() handles "8.0" etc.
            except ValueError:
                personal_rating = 0

            # Watch/log date
            last_modified = _get(row, "Last Modified Date", "Date Rated")

            if not tmdb_id and not imdb_id:
                continue  # Nothing to look up — skip silently

            rows.append({
                "tmdb_id":         tmdb_id,
                "imdb_id":         imdb_id,
                "personal_rating": personal_rating,
                "last_modified":   last_modified,
            })
    return rows


# ---------------------------------------------------------------------------
# TMDB API helpers
# ---------------------------------------------------------------------------

def get(session: requests.Session, url: str) -> requests.Response | None:
    """GET with retries and rate-limit handling."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 10))
                print(f"\n    Rate limited — waiting {wait}s...", end="", flush=True)
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return resp
            print(f"\n    HTTP {resp.status_code} (attempt {attempt}/{MAX_RETRIES})", end="", flush=True)
        except requests.RequestException as e:
            print(f"\n    Request error (attempt {attempt}/{MAX_RETRIES}): {e}", end="", flush=True)
        if attempt < MAX_RETRIES:
            time.sleep(2)
    return None


def fetch_by_tmdb_id(session: requests.Session, tmdb_id: int) -> tuple[dict | None, str | None]:
    """Try /movie/{id} then /tv/{id}. Returns (raw_data, media_type) or (None, None)."""
    resp = get(session, f"{BASE_URL}/movie/{tmdb_id}?append_to_response=credits")
    if resp and resp.status_code == 200:
        return resp.json(), "movie"
    time.sleep(REQUEST_DELAY)

    resp = get(session, f"{BASE_URL}/tv/{tmdb_id}?append_to_response=credits")
    if resp and resp.status_code == 200:
        return resp.json(), "tv"

    return None, None


def find_by_imdb_id(session: requests.Session, imdb_id: str) -> dict | None:
    """
    Use /find endpoint to resolve an IMDB ID.
    Returns a dict with 'media_type' and relevant IDs/data, or None.
    """
    resp = get(session, f"{BASE_URL}/find/{imdb_id}?external_source=imdb_id")
    if not resp or resp.status_code != 200:
        return None

    data = resp.json()

    if data.get("movie_results"):
        return {"media_type": "movie", "tmdb_id": data["movie_results"][0]["id"]}

    if data.get("tv_results"):
        return {"media_type": "tv", "tmdb_id": data["tv_results"][0]["id"]}

    if data.get("tv_episode_results"):
        ep = data["tv_episode_results"][0]
        return {
            "media_type":     "tv_episode",
            "episode_tmdb_id": ep["id"],
            "show_tmdb_id":   ep["show_id"],
            "season_number":  ep["season_number"],
            "episode_number": ep["episode_number"],
            "episode_name":   ep.get("name"),
            "air_date":       ep.get("air_date", ""),
            "runtime":        ep.get("runtime"),
            "overview":       ep.get("overview", ""),
            "vote_average":   ep.get("vote_average"),
            "vote_count":     ep.get("vote_count"),
            "still_path":     ep.get("still_path"),
        }

    return None


def fetch_episode_data(session: requests.Session, find_result: dict) -> tuple[dict, dict]:
    """
    Fetch episode-specific credits and parent show info.
    Returns (episode_raw, show_raw) — either may be empty dict on failure.
    """
    show_id = find_result["show_tmdb_id"]
    season  = find_result["season_number"]
    episode = find_result["episode_number"]

    ep_url   = f"{BASE_URL}/tv/{show_id}/season/{season}/episode/{episode}?append_to_response=credits"
    show_url = f"{BASE_URL}/tv/{show_id}"

    ep_resp   = get(session, ep_url)
    time.sleep(REQUEST_DELAY)
    show_resp = get(session, show_url)
    time.sleep(REQUEST_DELAY)

    ep_raw   = ep_resp.json()   if ep_resp   and ep_resp.status_code   == 200 else {}
    show_raw = show_resp.json() if show_resp and show_resp.status_code == 200 else {}

    return ep_raw, show_raw


# ---------------------------------------------------------------------------
# Crew helpers
# ---------------------------------------------------------------------------

def group_crew(crew: list, *jobs: str) -> list[dict]:
    """
    Filter crew by job titles, group by person, collect all their matching jobs.
    Preserves order of first appearance.
    """
    seen: dict[int, dict] = {}
    for member in crew:
        job = member.get("job", "")
        if job not in jobs:
            continue
        pid = member["id"]
        if pid not in seen:
            seen[pid] = {
                "tmdb_person_id": pid,
                "name":           member["name"],
                "profile_path":   member.get("profile_path"),
                "jobs":           [job],
            }
        elif job not in seen[pid]["jobs"]:
            seen[pid]["jobs"].append(job)
    return list(seen.values())


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def parse_movie(raw: dict, personal_rating: int, last_modified: str) -> dict:
    credits  = raw.get("credits", {})
    cast_raw = credits.get("cast", [])
    crew_raw = credits.get("crew", [])

    return {
        "media_type":           "movie",
        "tmdb_id":              raw["id"],
        "imdb_id":              raw.get("imdb_id"),
        "title":                raw.get("title"),
        "original_title":       raw.get("original_title"),
        "tagline":              raw.get("tagline") or "",
        "overview":             raw.get("overview") or "",
        "release_date":         raw.get("release_date") or "",
        "release_year":         int(raw["release_date"][:4]) if raw.get("release_date") else None,
        "runtime":              raw.get("runtime"),
        "genres":               [g["name"] for g in raw.get("genres", [])],
        "original_language":    raw.get("original_language"),
        "spoken_languages":     [l["english_name"] for l in raw.get("spoken_languages", [])],
        "production_countries": [c["name"] for c in raw.get("production_countries", [])],
        "production_companies": [
            {"name": c["name"], "logo_path": c.get("logo_path")}
            for c in raw.get("production_companies", [])
        ],
        "budget":               raw.get("budget") or 0,
        "revenue":              raw.get("revenue") or 0,
        "vote_average":         raw.get("vote_average"),
        "vote_count":           raw.get("vote_count"),
        "personal_rating":      personal_rating,
        "poster_path":          raw.get("poster_path"),
        "backdrop_path":        raw.get("backdrop_path"),
        "last_modified":        last_modified,
        "directors":            group_crew(crew_raw, "Director", "Co-Director"),
        "writers":              group_crew(crew_raw, *WRITER_JOBS),
        "composers":            group_crew(crew_raw, "Original Music Composer"),
        "cinematographers":     group_crew(crew_raw, "Director of Photography"),
        "editors":              group_crew(crew_raw, "Editor"),
        "cast": [
            {
                "tmdb_person_id": p["id"],
                "name":           p["name"],
                "character":      p.get("character"),
                "order":          p.get("order"),
                "profile_path":   p.get("profile_path"),
            }
            for p in cast_raw
        ],
    }


def parse_tv(raw: dict, personal_rating: int, last_modified: str) -> dict:
    credits  = raw.get("credits", {})
    cast_raw = credits.get("cast", [])
    crew_raw = credits.get("crew", [])
    first_air = raw.get("first_air_date") or ""
    runtimes  = raw.get("episode_run_time", [])

    return {
        "media_type":           "tv",
        "tmdb_id":              raw["id"],
        "imdb_id":              None,
        "title":                raw.get("name"),
        "original_title":       raw.get("original_name"),
        "tagline":              raw.get("tagline") or "",
        "overview":             raw.get("overview") or "",
        "release_date":         first_air,
        "release_year":         int(first_air[:4]) if first_air else None,
        "runtime":              runtimes[0] if runtimes else None,
        "number_of_seasons":    raw.get("number_of_seasons"),
        "number_of_episodes":   raw.get("number_of_episodes"),
        "genres":               [g["name"] for g in raw.get("genres", [])],
        "original_language":    raw.get("original_language"),
        "spoken_languages":     [l["english_name"] for l in raw.get("spoken_languages", [])],
        "production_countries": [c["name"] for c in raw.get("production_countries", [])],
        "production_companies": [
            {"name": c["name"], "logo_path": c.get("logo_path")}
            for c in raw.get("production_companies", [])
        ],
        "budget":               0,
        "revenue":              0,
        "vote_average":         raw.get("vote_average"),
        "vote_count":           raw.get("vote_count"),
        "personal_rating":      personal_rating,
        "poster_path":          raw.get("poster_path"),
        "backdrop_path":        raw.get("backdrop_path"),
        "last_modified":        last_modified,
        "directors":            group_crew(crew_raw, "Director", "Co-Director"),
        "writers":              group_crew(crew_raw, *WRITER_JOBS),
        "composers":            group_crew(crew_raw, "Original Music Composer"),
        "cinematographers":     group_crew(crew_raw, "Director of Photography"),
        "editors":              group_crew(crew_raw, "Editor"),
        "cast": [
            {
                "tmdb_person_id": p["id"],
                "name":           p["name"],
                "character":      p.get("character"),
                "order":          p.get("order"),
                "profile_path":   p.get("profile_path"),
            }
            for p in cast_raw
        ],
    }


def parse_episode(
    find_result: dict,
    ep_raw: dict,
    show_raw: dict,
    personal_rating: int,
    last_modified: str,
    imdb_id: str | None,
) -> dict:
    """
    Parse a single TV episode entry.
    Episode-specific crew (director, writer of that episode) comes from ep_raw.
    Show-level info (poster, genres, show title) comes from show_raw.
    """
    credits  = ep_raw.get("credits", {})
    cast_raw = credits.get("cast", [])
    crew_raw = credits.get("crew", [])

    air_date = find_result.get("air_date") or ep_raw.get("air_date") or ""

    return {
        "media_type":           "tv_episode",
        "tmdb_id":              find_result["episode_tmdb_id"],
        "show_tmdb_id":         find_result["show_tmdb_id"],
        "imdb_id":              imdb_id,
        "title":                find_result.get("episode_name") or ep_raw.get("name"),
        "original_title":       ep_raw.get("name"),
        "show_title":           show_raw.get("name"),
        "show_original_title":  show_raw.get("original_name"),
        "season_number":        find_result["season_number"],
        "episode_number":       find_result["episode_number"],
        "tagline":              "",
        "overview":             find_result.get("overview") or ep_raw.get("overview") or "",
        "release_date":         air_date,
        "release_year":         int(air_date[:4]) if air_date else None,
        "runtime":              find_result.get("runtime") or ep_raw.get("runtime"),
        "genres":               [g["name"] for g in show_raw.get("genres", [])],
        "original_language":    show_raw.get("original_language"),
        "spoken_languages":     [l["english_name"] for l in show_raw.get("spoken_languages", [])],
        "production_countries": [c["name"] for c in show_raw.get("production_countries", [])],
        "production_companies": [
            {"name": c["name"], "logo_path": c.get("logo_path")}
            for c in show_raw.get("production_companies", [])
        ],
        "budget":               0,
        "revenue":              0,
        "vote_average":         find_result.get("vote_average") or ep_raw.get("vote_average"),
        "vote_count":           find_result.get("vote_count")   or ep_raw.get("vote_count"),
        "personal_rating":      personal_rating,
        "poster_path":          show_raw.get("poster_path"),    # show poster (no episode poster)
        "backdrop_path":        show_raw.get("backdrop_path"),
        "still_path":           find_result.get("still_path") or ep_raw.get("still_path"),
        "last_modified":        last_modified,
        # Episode-specific crew — who directed/wrote THIS episode
        "directors":            group_crew(crew_raw, "Director", "Co-Director"),
        "writers":              group_crew(crew_raw, *WRITER_JOBS),
        "composers":            group_crew(crew_raw, "Original Music Composer"),
        "cinematographers":     group_crew(crew_raw, "Director of Photography"),
        "editors":              group_crew(crew_raw, "Editor"),
        "cast": [
            {
                "tmdb_person_id": p["id"],
                "name":           p["name"],
                "character":      p.get("character"),
                "order":          p.get("order"),
                "profile_path":   p.get("profile_path"),
            }
            for p in cast_raw
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Fetch movie/TV data from TMDB and produce data.json for the web app.\n\n"
            "Authentication:\n"
            "  Requires a TMDB 'API Read Access Token' (the long Bearer token).\n"
            "  Get one free at: https://www.themoviedb.org/settings/api\n"
            "  Pass it via --token or store it in a .env file as TMDB_BEARER_TOKEN=...\n"
            "  Note: this is NOT the short API key — it's the long JWT token."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--token", type=str, default=None,
        metavar="BEARER_TOKEN",
        help=(
            "TMDB API Read Access Token (the long JWT). "
            "If omitted, read from TMDB_BEARER_TOKEN in .env"
        ),
    )
    parser.add_argument(
        "--csv", type=Path, default=CSV_PATH,
        metavar="PATH",
        help=(
            f"Path to input CSV (default: '{CSV_PATH.name}'). "
            "Supports the enriched format (tmdb_id, Rating, Last Modified Date, ...) "
            "and raw IMDB exports (Const, Your Rating, Date Rated, ...). "
            "Only requirement: each row must have a TMDB ID or IMDB ID (tt...) — "
            "everything else is fetched from TMDB."
        ),
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        metavar="N",
        help="Only process the first N rows — writes to data_test.json (useful for testing)",
    )
    args = parser.parse_args()

    # Allow token to be passed directly, overriding .env
    if args.token:
        global BEARER_TOKEN
        BEARER_TOKEN = args.token
        HEADERS["Authorization"] = f"Bearer {BEARER_TOKEN}"

    if not BEARER_TOKEN:
        parser.error(
            "No TMDB token found. Pass --token YOUR_TOKEN or add "
            "TMDB_BEARER_TOKEN=... to a .env file in the project root."
        )

    csv_path = args.csv
    print(f"Loading CSV: {csv_path.name}")
    rows = load_csv(csv_path)

    if args.limit:
        rows = rows[:args.limit]

    total   = len(rows)
    is_test  = args.csv != CSV_PATH or args.limit is not None
    out_path = ROOT / ("data_test.json" if is_test else "data.json")

    print(f"Processing {total} entries -> {out_path.name}\n")

    results = []
    failed  = []
    counts  = {"movie": 0, "tv": 0, "tv_episode": 0, "recovered": 0}

    with requests.Session() as session:
        for i, row in enumerate(rows, 1):
            tmdb_id         = row["tmdb_id"]
            imdb_id         = row["imdb_id"]
            personal_rating = row["personal_rating"]
            last_modified   = row["last_modified"]

            label = f"tmdb={tmdb_id}" if tmdb_id else f"imdb={imdb_id}"
            print(f"[{i}/{total}] {label}", end=" ... ", flush=True)

            entry      = None
            recovered  = False

            # --- Step 1: fetch by tmdb_id (movie or tv) ---
            if tmdb_id:
                raw, media_type = fetch_by_tmdb_id(session, tmdb_id)
                time.sleep(REQUEST_DELAY)
                if raw:
                    entry = parse_movie(raw, personal_rating, last_modified) \
                            if media_type == "movie" \
                            else parse_tv(raw, personal_rating, last_modified)

            # --- Step 2: fall back to IMDB ID lookup ---
            if entry is None and imdb_id:
                find_result = find_by_imdb_id(session, imdb_id)
                time.sleep(REQUEST_DELAY)

                if find_result:
                    recovered = True
                    mtype = find_result["media_type"]

                    if mtype == "tv_episode":
                        ep_raw, show_raw = fetch_episode_data(session, find_result)
                        if ep_raw or show_raw:
                            entry = parse_episode(
                                find_result, ep_raw, show_raw,
                                personal_rating, last_modified, imdb_id
                            )

                    else:
                        raw, media_type = fetch_by_tmdb_id(session, find_result["tmdb_id"])
                        time.sleep(REQUEST_DELAY)
                        if raw:
                            entry = parse_movie(raw, personal_rating, last_modified) \
                                    if media_type == "movie" \
                                    else parse_tv(raw, personal_rating, last_modified)

            # --- Step 3: log failure ---
            if entry is None:
                print("FAILED")
                failed.append({
                    "tmdb_id":         tmdb_id,
                    "imdb_id":         imdb_id,
                    "imdb_url":        f"https://www.imdb.com/title/{imdb_id}/" if imdb_id else None,
                    "personal_rating": personal_rating,
                    "last_modified":   last_modified,
                })
                continue

            mtype = entry["media_type"]
            counts[mtype] += 1
            if recovered:
                counts["recovered"] += 1

            results.append(entry)
            tag  = " [recovered]" if recovered else ""
            name = entry.get("title", "?")
            if mtype == "tv_episode":
                name = f"{entry.get('show_title','?')} S{entry['season_number']:02d}E{entry['episode_number']:02d} \"{name}\""
            print(f"OK  [{mtype}] {name}{tag}")

    # Append failed entries that have an IMDB ID into data.json as media_type="failed"
    # so the app can show them with a link for manual lookup.
    # Entries with no IMDB ID are skipped — nothing useful to show.
    failed_with_id    = [f for f in failed if f.get("imdb_id")]
    failed_without_id = [f for f in failed if not f.get("imdb_id")]

    for f in failed_with_id:
        results.append({
            "media_type":      "failed",
            "tmdb_id":         f["tmdb_id"],
            "imdb_id":         f["imdb_id"],
            "imdb_url":        f["imdb_url"],
            "personal_rating": f["personal_rating"],
            "last_modified":   f["last_modified"],
        })

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Saved to: {out_path.name}")
    print(f"  Movies:              {counts['movie']}")
    print(f"  TV shows:            {counts['tv']}")
    print(f"  TV episodes:         {counts['tv_episode']}")
    print(f"  Recovered via IMDB:  {counts['recovered']}")
    print(f"  Failed (with IMDB):  {len(failed_with_id)}  <- included in data.json with IMDB links")
    if failed_without_id:
        print(f"  Failed (no ID):      {len(failed_without_id)}  <- skipped entirely, nothing to show")


if __name__ == "__main__":
    main()
