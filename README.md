# Movie Stats

A personal movie and TV statistics dashboard built from an IMDB watchlist, enriched with data from TMDB. Hosted on GitHub Pages, mobile-first, IMDB-inspired dark theme.

**Live:** https://yokamin.github.io/movie-stats/

---

## What it shows

~1674 watched films, TV shows, and individually logged TV episodes across:

- **Home** — key stats, ratings distribution, top genres, films by decade, recently added
- **Watchlist** — searchable/filterable/sortable list of everything watched, grid or list view
- **Genres, Directors, Actors, Writers, Composers, Cinematographers** — leaderboards with sorting, search, pagination, and drill-down detail pages
- **Timeline** — films by decade and year (scrollable)
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
├── index.html              # App shell
├── style.css               # All styles — IMDB dark theme, mobile-first
├── js/
│   ├── data.js             # Loads data.json, builds all indexes
│   └── app.js              # Router, navigation, all views
├── scripts/
│   ├── enrich.py           # Fetches data from TMDB API → outputs data.json
│   └── test_input.csv      # Hand-crafted test cases for enrich.py
├── .github/
│   └── workflows/
│       └── enrich.yml      # GitHub Actions: auto-updates data.json when CSV changes
└── data.json               # Generated dataset (committed — needed for GitHub Pages)
```

---

## Data pipeline

1. Source data comes from an IMDB ratings export CSV
2. `enrich.py` fetches full movie/TV data from TMDB API and outputs `data.json`
3. `data.json` is what the web app reads — committed to the repo so GitHub Pages can serve it

### Automated updates (GitHub Actions)

The CSV lives in a separate repo (`movie-stats-data`). When a new CSV is pushed there, a workflow automatically triggers `enrich.py` here, commits the new `data.json`, and Pages redeploys. New entries are fetched from TMDB; existing entries are served from cache (only ratings/dates update).

### Manual enrichment

To run the script yourself:

**1. Get a TMDB API key**

Create a free account at [themoviedb.org](https://www.themoviedb.org/), go to **Settings → API**, and copy the **API Read Access Token** (the long JWT — not the short API key).

**2. Create a `.env` file** (gitignored, never committed)

```
TMDB_BEARER_TOKEN=your_read_access_token_here
```

**3. Set up Python environment**

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install requests python-dotenv
```

**4. Run**

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

---

## Hosting on GitHub Pages

Push the repo to GitHub. In the repo settings, enable **Pages → Deploy from branch → main / (root)**. The app is entirely static — no server needed.

---

## Backlog

- [ ] Manual data entry for unmatched entries ("Not Found" section) — allow adding title/info locally
- [ ] Watch date editor — override `last_modified` per entry, stored in `localStorage`
- [ ] IMDB person links — fetch `nm...` IDs lazily when viewing a person's detail page
- [ ] "Surprise me" button — surface a random film from the watchlist
- [ ] Favicon
- [ ] Writers leaderboard: filter by job type (Screenplay vs Characters vs Story etc.) — relevant for credits like Stan Lee's "Characters" entries
- [ ] World map SVG choropleth for Countries view
- [ ] Additional detail page stats (frequent collaborators on person page, genre breakdown per director, etc.)
- [ ] Posters/images — currently loaded live from TMDB CDN; consider lazy-loading improvements
