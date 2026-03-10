// data.js — loads data.json and builds all indexes
// Exposes: window.DB, window.imgUrl, window.initData

const TMDB_IMG = 'https://image.tmdb.org/t/p';

window.imgUrl = (path, size = 'w185') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;

async function initData() {
  const resp = await fetch('data.json', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`Failed to load data.json: ${resp.status}`);
  const raw = await resp.json();
  window.DB = buildDB(raw);
}

function buildDB(raw) {
  const movies   = raw.filter(d => d.media_type === 'movie');
  const tv       = raw.filter(d => d.media_type === 'tv');
  const episodes = raw.filter(d => d.media_type === 'tv_episode');
  const failed   = raw.filter(d => d.media_type === 'failed');
  const watchable = [...movies, ...tv, ...episodes];
  const people   = buildPeopleIndex(watchable);

  return {
    all: raw, movies, tv, episodes, failed, watchable,
    byId:        new Map(raw.map(d => [String(d.tmdb_id), d])),
    people,
    leaderboards: buildLeaderboards(people),
    genres:      buildGroupIndex(watchable, 'genres'),
    countries:   buildGroupIndex(watchable, 'production_countries'),
    years:       buildYearIndex(watchable),
    stats:       computeStats(watchable, movies, tv, episodes, failed),
  };
}

function buildPeopleIndex(data) {
  const people = new Map();
  const crewRoles = ['directors','writers','composers','cinematographers','editors'];

  function ensure(p) {
    if (!people.has(p.tmdb_person_id)) {
      people.set(p.tmdb_person_id, {
        tmdb_person_id: p.tmdb_person_id,
        name: p.name,
        profile_path: p.profile_path,
        roles: { directors:[], writers:[], composers:[], cinematographers:[], editors:[], cast:[] },
      });
    }
    return people.get(p.tmdb_person_id);
  }

  for (const entry of data) {
    for (const role of crewRoles) {
      for (const person of (entry[role] || [])) {
        ensure(person).roles[role].push({ entry, jobs: person.jobs });
      }
    }
    for (const person of (entry.cast || [])) {
      ensure(person).roles.cast.push({ entry, character: person.character, order: person.order });
    }
  }
  return people;
}

function buildLeaderboards(people) {
  // Pre-sort all people leaderboards once at startup so view functions
  // just read an already-sorted array — no computation at navigation time.
  const crewRoles = ['directors', 'writers', 'composers', 'cinematographers', 'editors'];
  const result = {};

  // Minimum appearances to appear in leaderboard.
  // Cast lists are huge (15k+ unique actors); filtering to 2+ keeps only
  // people who appeared in more than one film — far more meaningful.
  const minAppearances = { cast: 2 };

  for (const role of [...crewRoles, 'cast']) {
    const min = minAppearances[role] || 1;
    result[role] = [...people.values()]
      .filter(p => p.roles[role].length >= min)
      .map(p => {
        const entries = p.roles[role].map(a => a.entry);
        const rated   = entries.filter(e => e.personal_rating > 0);
        return {
          tmdb_person_id: p.tmdb_person_id,
          name:           p.name,
          profile_path:   p.profile_path,
          count:          entries.length,
          avg:            rated.length
            ? (rated.reduce((s, e) => s + e.personal_rating, 0) / rated.length).toFixed(1)
            : null,
          runtime:        entries.reduce((s, e) => s + (e.runtime || 0), 0),
        };
      })
      .sort((a, b) => b.count - a.count || (Number(b.avg) || 0) - (Number(a.avg) || 0));
  }
  return result;
}

function buildGroupIndex(data, field) {
  const index = new Map();
  for (const entry of data) {
    for (const val of (entry[field] || [])) {
      if (!index.has(val)) index.set(val, []);
      index.get(val).push(entry);
    }
  }
  return index;
}

function buildYearIndex(data) {
  const index = new Map();
  for (const entry of data) {
    if (!entry.release_year) continue;
    if (!index.has(entry.release_year)) index.set(entry.release_year, []);
    index.get(entry.release_year).push(entry);
  }
  return index;
}

function computeStats(watchable, movies, tv, episodes, failed) {
  const rated = watchable.filter(d => d.personal_rating > 0);
  const avgRating = rated.length
    ? (rated.reduce((s, d) => s + d.personal_rating, 0) / rated.length).toFixed(1)
    : '—';

  const totalMinutes = watchable.reduce((s, d) => s + (d.runtime || 0), 0);

  const ratingDist = Array.from({ length: 10 }, (_, i) => ({
    rating: i + 1,
    count:  watchable.filter(d => d.personal_rating === i + 1).length,
  }));

  const genreMap = new Map();
  for (const entry of watchable) {
    for (const g of (entry.genres || [])) genreMap.set(g, (genreMap.get(g) || 0) + 1);
  }
  const topGenres = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  const decadeMap = new Map();
  for (const entry of watchable) {
    if (!entry.release_year) continue;
    const decade = Math.floor(entry.release_year / 10) * 10;
    decadeMap.set(decade, (decadeMap.get(decade) || 0) + 1);
  }
  const byDecade = [...decadeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, count }));

  return {
    totalMovies: movies.length, totalTV: tv.length,
    totalEpisodes: episodes.length, totalFailed: failed.length,
    totalWatchable: watchable.length,
    avgRating, totalMinutes,
    totalHours: Math.floor(totalMinutes / 60),
    totalDays: (totalMinutes / 60 / 24).toFixed(1),
    ratingDist, topGenres, byDecade,
  };
}

window.initData = initData;
