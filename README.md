# Movie Stats

A personal movie and TV statistics dashboard built from an IMDB watchlist, enriched with data from TMDB. Hosted on GitHub Pages, mobile-first, IMDB-inspired dark theme.

**Live:** https://yokamin.github.io/movie-stats/

---

## What it shows

All films, TV shows, and individually logged TV episodes from an IMDB ratings export, across:

- **Home** — key stats, ratings distribution, top genres, films by decade, recently added
- **Watchlist** — searchable/filterable/sortable list of everything watched, grid or list view
- **Genres, Directors, Actors, Writers, Composers, Cinematographers** — leaderboards with sorting, search, pagination, and drill-down detail pages
- **Timeline** — films by decade and year
- **Countries** — bar chart with counts and percentages, sortable list
- **Not Found** — entries that couldn't be matched on TMDB, with IMDB links

Every item is clickable and cross-linked — a director's page shows their films, frequent collaborators, average ratings; a genre page shows its films, top directors, decade breakdown, etc.

---

## Running locally

The app loads `data.json` via `fetch()`, which requires an HTTP server (browsers block `fetch` on `file://` URLs).

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Project structure

```
movie-stats/
├── index.html                  # App shell
├── style.css                   # All styles
├── js/
│   ├── data.js                 # Loads data.json, builds all indexes
│   └── app.js                  # Router, navigation, all views
├── scripts/
│   ├── enrich.py               # Fetches data from TMDB API → outputs data.json
│   └── test_input.csv          # Hand-crafted test cases for enrich.py
├── .github/
│   └── workflows/
│       └── enrich.yml          # Auto-updates data.json when CSV changes
├── data-repo-setup/            # Setup files for the companion data repo (see below)
│   ├── notify.yml              # Workflow that goes in the data repo
│   └── README.md               # Full setup guide for the data repo
└── data.json                   # Generated dataset (committed — needed for GitHub Pages)
```

---

## How data updates work

This app is designed so that the person whose data it is can update it themselves, without touching this repo or knowing anything about code.

A separate **data repo** (owned by whoever supplies the data) holds only the IMDB export CSV. When they upload a new CSV there, a workflow automatically:

1. Validates the file looks like an IMDB export
2. Pings this repo
3. This repo fetches the CSV, runs `enrich.py`, and commits a new `data.json`
4. GitHub Pages redeploys with the updated data

Existing entries are served from cache — only genuinely new entries hit the TMDB API, so updates are fast. A "Force re-fetch" option in the Actions tab triggers a full refresh from TMDB if ever needed.

**Full setup instructions for the data repo** are in [`data-repo-setup/README.md`](data-repo-setup/README.md).

---

## Running the enrichment script manually

### 1. Get a TMDB API key

Create a free account at [themoviedb.org](https://www.themoviedb.org/), go to **Settings → API**, and copy the **API Read Access Token** (the long JWT — not the short API key).

### 2. Create a `.env` file (gitignored, never committed)

```
TMDB_BEARER_TOKEN=your_read_access_token_here
```

### 3. Set up Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install requests python-dotenv
```

### 4. Run

```bash
# Test on a small input first
python scripts/enrich.py --csv scripts/test_input.csv

# Full run
python scripts/enrich.py

# Force re-fetch everything from TMDB (ignore cache)
python scripts/enrich.py --force

# Pass token directly without .env
python scripts/enrich.py --token YOUR_TOKEN
```

Supports both the enriched CSV format and a raw IMDB export directly.

---

## Hosting on GitHub Pages

Push the repo to GitHub. In the repo settings, enable **Pages → Deploy from branch → main / (root)**. The app is entirely static — no server needed.

---

## Backlog

- [ ] Manual data entry for unmatched entries — allow adding title/info for the ~21 entries that couldn't be found on TMDB
- [ ] Watch date editor — override the logged date per entry, stored in `localStorage`
- [ ] IMDB person links — fetch `nm...` IDs lazily when viewing a person's detail page
- [ ] "Surprise me" button — surface a random film from the watchlist
- [ ] Favicon
- [ ] Writers: filter leaderboard by specific job type (Screenplay vs Characters vs Story etc.)
- [ ] World map SVG choropleth for the Countries view
- [ ] Additional detail page stats (frequent collaborators on person page, etc.)
