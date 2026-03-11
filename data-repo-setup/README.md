# Movie Stats — Data Repo

This repository holds the IMDB ratings export for the [Movie Stats](https://github.com/Yokamin/movie-stats) dashboard.

When you upload a new CSV here, the dashboard updates automatically — no code needed.

---

## How to update your data

1. Export your ratings from [imdb.com](https://www.imdb.com) — go to your ratings page and look for an Export option. You'll get a `.csv` file.
2. Come to this repo on github.com
3. Click **Add file → Upload files**
4. Drag in the new CSV (any filename is fine)
5. Click **Commit changes**

That's it. The dashboard will update within a few minutes.

If you accidentally upload multiple CSV files, the oldest ones are automatically moved to an `_old/` folder and the newest one is used.

---

## What happens in the background

Uploading a CSV triggers a workflow that:
1. Validates the file looks like an IMDB export
2. Notifies the main `movie-stats` repo
3. The main repo fetches the CSV, enriches it with data from TMDB (cast, crew, posters, ratings etc.), and updates the live dashboard

---

---
---

# Setup Guide

*The section below is for whoever is setting this up for the first time. Once it's running, only the "How to update your data" section above is relevant.*

---

## What goes in this repo

Only two things:
- The IMDB export CSV (uploaded by the data owner — no code knowledge needed)
- The workflow file at `.github/workflows/notify.yml` (from this folder)

The `notify.yml` file in this folder is the exact file that goes in the data repo. Copy it to `.github/workflows/notify.yml` in the data repo.

Before using it, update the one line that references the target repo — change `Yokamin/movie-stats` to wherever `movie-stats` actually lives:
```yaml
https://api.github.com/repos/Yokamin/movie-stats/dispatches \
```

## Required secrets

**In this data repo** → Settings → Secrets and variables → Actions → New repository secret:
- `TRIGGER_TOKEN` — a GitHub Personal Access Token (classic, `repo` scope) from the **movie-stats repo owner's** account. This lets the data repo trigger a workflow in movie-stats.

**In the `movie-stats` repo** → Settings → Secrets and variables → Actions → New repository secret:
- `TMDB_BEARER_TOKEN` — the API Read Access Token from [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)

## Creating the Personal Access Token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name it (e.g. `movie-stats trigger`)
4. Select scope: **`repo`**
5. Generate and copy it — use it as the `TRIGGER_TOKEN` secret above

## Testing

Push any `.csv` file to the data repo, then check:
1. **This repo** → Actions tab: `notify.yml` should run green
2. **movie-stats** → Actions tab: `Update data.json from latest CSV` should trigger
3. GitHub Pages redeploys within a few minutes
