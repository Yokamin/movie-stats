// app.js — router, navigation, all views

// ============================================================
// CHART REGISTRY
// ============================================================
const charts = new Map();

function mkChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (charts.has(id)) { try { charts.get(id).destroy(); } catch(e) {} }
  const chart = new Chart(el, config);
  charts.set(id, chart);
  return chart;
}

Chart.defaults.color = '#a8a8a8';
Chart.defaults.borderColor = '#2e2e2e';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 12;

function chartOpts({ xTitle, yTitle } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y ?? ctx.parsed.x}` } } },
    scales: {
      x: { grid: { color: '#2a2a2a' }, ticks: { color: '#a8a8a8' }, ...(xTitle ? { title: { display: true, text: xTitle, color: '#666' } } : {}) },
      y: { grid: { color: '#2a2a2a' }, ticks: { color: '#a8a8a8' }, ...(yTitle ? { title: { display: true, text: yTitle, color: '#666' } } : {}) },
    },
  };
}

// ============================================================
// UTILITIES
// ============================================================
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatRuntime(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function avgRating(entries) {
  const rated = entries.filter(e => e.personal_rating > 0);
  if (!rated.length) return null;
  return (rated.reduce((s, e) => s + e.personal_rating, 0) / rated.length).toFixed(1);
}

function totalRuntime(entries) {
  return entries.reduce((s, e) => s + (e.runtime || 0), 0);
}

function posterCard(entry) {
  const poster = imgUrl(entry.poster_path, 'w185');
  const title  = entry.title || entry.show_title || entry.imdb_id || '?';
  const year   = entry.release_year || '';
  const rating = entry.personal_rating;
  const mtype  = entry.media_type;

  let href;
  if (mtype === 'tv_episode') href = `#show-${entry.show_tmdb_id}`;
  else if (mtype === 'tv') href = `#show-${entry.tmdb_id}`;
  else href = `#movie-${entry.tmdb_id}`;

  const imgHtml = poster
    ? `<img src="${poster}" alt="${esc(title)}" loading="lazy" class="card-poster-img">`
    : `<div class="card-poster-placeholder"><span>${esc(title.slice(0,2).toUpperCase())}</span></div>`;

  const mediaTag = mtype === 'tv'
    ? `<span class="media-tag media-tag--tv">TV</span>`
    : mtype === 'tv_episode'
    ? `<span class="media-tag media-tag--tv_episode">EP</span>`
    : '';

  const genre = (entry.genres || [])[0] || '';

  return `<a href="${href}" class="movie-card">
    <div class="card-poster">
      ${imgHtml}
      ${rating ? `<div class="card-rating">${rating}</div>` : ''}
      ${mediaTag}
    </div>
    <div class="card-info">
      <div class="card-title">${esc(title)}</div>
      <div class="card-meta">${year}${genre ? ` · ${esc(genre)}` : ''}</div>
    </div>
  </a>`;
}

function backBtn() {
  return `<button class="icon-btn" onclick="history.back()" aria-label="Back">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
  </button>`;
}

// ============================================================
// NAVIGATION
// ============================================================
function initNav() {
  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-link').forEach(l => l.addEventListener('click', closeDrawer));
}

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}

function setTitle(t) { document.getElementById('topbarTitle').textContent = t; }
function setAction(h) { document.getElementById('topbarAction').innerHTML = h; }

function setActiveNav(view) {
  document.querySelectorAll('.drawer-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('href') === '#' + view);
  });
}

// ============================================================
// ROUTER
// ============================================================
function navigate(hash) { window.location.hash = hash; window.scrollTo(0, 0); }

function handleRoute() {
  const raw  = window.location.hash.slice(1) || 'home';
  const dash = raw.indexOf('-');
  const view = dash > -1 ? raw.slice(0, dash) : raw;
  const param = dash > -1 ? raw.slice(dash + 1) : null;

  setActiveNav(raw);
  setAction('');
  document.getElementById('mainContent').innerHTML = '';
  charts.forEach(c => { try { c.destroy(); } catch(e) {} });
  charts.clear();

  switch (view) {
    case 'home':             return viewHome();
    case 'movies':           return viewMovies();
    case 'tv':               return viewTV();
    case 'genres':           return viewGenres();
    case 'directors':        return viewPeople('directors', 'Directors');
    case 'actors':           return viewPeople('cast', 'Actors');
    case 'writers':          return viewPeople('writers', 'Writers');
    case 'composers':        return viewPeople('composers', 'Composers');
    case 'cinematographers': return viewPeople('cinematographers', 'Cinematographers');
    case 'timeline':         return viewTimeline();
    case 'countries':        return viewCountries();
    case 'failed':           return viewFailed();
    case 'movie':            return viewMovieDetail(param);
    case 'show':             return viewShowDetail(param);
    case 'person':           return viewPersonDetail(param);
    case 'genre':            return viewGenreDetail(decodeURIComponent(param));
    case 'country':          return viewCountryDetail(decodeURIComponent(param));
    case 'decade':           return viewDecadeDetail(param);
    default:                 return viewHome();
  }
}

// ============================================================
// VIEW: HOME
// ============================================================
function viewHome() {
  setTitle('MovieStats');
  const { stats } = DB;
  const mc = document.getElementById('mainContent');

  mc.innerHTML = `
    <div class="view-home">
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${stats.totalMovies.toLocaleString()}</div><div class="stat-label">Movies</div></div>
        <div class="stat-card"><div class="stat-value">${(stats.totalTV + stats.totalEpisodes).toLocaleString()}</div><div class="stat-label">TV &amp; Episodes</div></div>
        <div class="stat-card"><div class="stat-value accent">${stats.avgRating}</div><div class="stat-label">Avg Rating</div></div>
        <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">Days Watched</div></div>
      </div>
      <div class="section">
        <h2 class="section-title">Ratings Distribution</h2>
        <div class="chart-wrap chart-wrap--bar"><canvas id="chartRatings"></canvas></div>
      </div>
      <div class="section">
        <h2 class="section-title">Top Genres</h2>
        <div class="chart-wrap chart-wrap--hbar"><canvas id="chartGenres"></canvas></div>
      </div>
      <div class="section">
        <h2 class="section-title">By Decade</h2>
        <div class="chart-wrap chart-wrap--bar"><canvas id="chartDecades"></canvas></div>
      </div>
      <div class="section">
        <h2 class="section-title">Recently Added</h2>
        <div class="poster-grid" id="recentGrid"></div>
      </div>
    </div>`;

  mkChart('chartRatings', {
    type: 'bar',
    data: {
      labels: stats.ratingDist.map(d => d.rating),
      datasets: [{ data: stats.ratingDist.map(d => d.count), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: chartOpts({ xTitle: 'Rating', yTitle: 'Films' }),
  });

  mkChart('chartGenres', {
    type: 'bar',
    data: {
      labels: stats.topGenres.map(d => d.name),
      datasets: [{ data: stats.topGenres.map(d => d.count), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: { ...chartOpts({ yTitle: 'Films' }), indexAxis: 'y' },
  });

  mkChart('chartDecades', {
    type: 'bar',
    data: {
      labels: stats.byDecade.map(d => `${d.decade}s`),
      datasets: [{ data: stats.byDecade.map(d => d.count), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: chartOpts({ xTitle: 'Decade', yTitle: 'Films' }),
  });

  const recent = [...DB.watchable]
    .filter(e => e.last_modified)
    .sort((a, b) => b.last_modified.localeCompare(a.last_modified))
    .slice(0, 12);
  document.getElementById('recentGrid').innerHTML = recent.map(posterCard).join('');
}

// ============================================================
// VIEW: MOVIES
// ============================================================
function viewMovies() {
  setTitle('Movies');
  setAction(`<button class="icon-btn" id="searchToggle" aria-label="Search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  </button>`);

  const mc = document.getElementById('mainContent');
  mc.innerHTML = `
    <div class="view-list">
      <div class="list-controls">
        <div class="search-wrap" id="searchWrap" style="display:none">
          <input type="text" class="search-input" id="searchInput" placeholder="Search titles…" autocomplete="off">
        </div>
        <div class="filter-chips" id="filterChips">
          <button class="chip active" data-filter="all">All (${DB.watchable.length})</button>
          <button class="chip" data-filter="movie">Movies (${DB.movies.length})</button>
          <button class="chip" data-filter="tv">TV (${DB.tv.length})</button>
          <button class="chip" data-filter="tv_episode">Episodes (${DB.episodes.length})</button>
          ${DB.failed.length ? `<button class="chip" data-filter="failed">Not Found (${DB.failed.length})</button>` : ''}
        </div>
        <div class="sort-wrap">
          <select class="sort-select" id="sortSelect">
            <option value="rating">Rating (high first)</option>
            <option value="year_desc">Year (newest)</option>
            <option value="year_asc">Year (oldest)</option>
            <option value="title">Title (A–Z)</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>
      </div>
      <div class="result-count" id="resultCount"></div>
      <div class="poster-grid" id="moviesGrid"></div>
    </div>`;

  let filter = 'all', query = '', sort = 'rating';

  function getFiltered() {
    let src = filter === 'all'    ? DB.watchable
            : filter === 'failed' ? DB.failed
            : DB.all.filter(d => d.media_type === filter);
    if (query) {
      const q = query.toLowerCase();
      src = src.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.original_title || '').toLowerCase().includes(q) ||
        (d.show_title || '').toLowerCase().includes(q)
      );
    }
    return [...src].sort((a, b) => {
      if (sort === 'rating')    return (b.personal_rating || 0) - (a.personal_rating || 0);
      if (sort === 'year_desc') return (b.release_year || 0) - (a.release_year || 0);
      if (sort === 'year_asc')  return (a.release_year || 0) - (b.release_year || 0);
      if (sort === 'title')     return (a.title || '').localeCompare(b.title || '');
      if (sort === 'recent')    return (b.last_modified || '').localeCompare(a.last_modified || '');
      return 0;
    });
  }

  function render() {
    const results = getFiltered();
    document.getElementById('resultCount').textContent = `${results.length} titles`;
    if (filter === 'failed') {
      document.getElementById('moviesGrid').innerHTML = results.map(e => `
        <a href="${e.imdb_url}" target="_blank" rel="noopener" class="movie-card">
          <div class="card-poster"><div class="card-poster-placeholder"><span>?</span></div>
          ${e.personal_rating ? `<div class="card-rating" style="background:#666">${e.personal_rating}</div>` : ''}</div>
          <div class="card-info"><div class="card-title">${esc(e.imdb_id)}</div><div class="card-meta">Open on IMDB</div></div>
        </a>`).join('');
    } else {
      document.getElementById('moviesGrid').innerHTML = results.map(posterCard).join('');
    }
  }

  document.getElementById('searchToggle').addEventListener('click', () => {
    const wrap = document.getElementById('searchWrap');
    const hidden = wrap.style.display === 'none';
    wrap.style.display = hidden ? 'block' : 'none';
    if (hidden) document.getElementById('searchInput').focus();
  });
  document.getElementById('searchInput').addEventListener('input', e => { query = e.target.value.trim(); render(); });
  document.getElementById('filterChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    render();
  });
  document.getElementById('sortSelect').addEventListener('change', e => { sort = e.target.value; render(); });
  render();
}

// ============================================================
// VIEW: TV
// ============================================================
function viewTV() {
  setTitle('TV Shows & Episodes');
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `
    <div class="view-list">
      <div class="filter-chips" id="tvChips">
        <button class="chip active" data-tv="shows">Shows (${DB.tv.length})</button>
        <button class="chip" data-tv="episodes">Episodes (${DB.episodes.length})</button>
      </div>
      <div class="poster-grid" id="tvGrid"></div>
    </div>`;

  function render(f) {
    const src = f === 'shows' ? DB.tv : DB.episodes;
    document.getElementById('tvGrid').innerHTML = [...src]
      .sort((a, b) => (b.personal_rating || 0) - (a.personal_rating || 0))
      .map(posterCard).join('');
  }

  document.getElementById('tvChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#tvChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    render(chip.dataset.tv);
  });
  render('shows');
}

// ============================================================
// VIEW: GENRES
// ============================================================
function viewGenres() {
  setTitle('Genres');
  const genres = [...DB.genres.entries()]
    .map(([name, entries]) => ({ name, count: entries.length, avg: avgRating(entries) }))
    .sort((a, b) => b.count - a.count);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-list">
      <div class="people-list">
        ${genres.map((g, i) => `
          <a href="#genre-${encodeURIComponent(g.name)}" class="people-row">
            <div class="people-rank-col">
              <span class="people-rank">${i + 1}</span>
              <span class="people-name">${esc(g.name)}</span>
            </div>
            <div class="people-stats-col">
              ${g.avg ? `<span class="rating-badge">${g.avg}</span>` : ''}
              <span class="people-count">${g.count} titles</span>
            </div>
          </a>`).join('')}
      </div>
    </div>`;
}

// ============================================================
// VIEW: PEOPLE (directors / actors / writers / etc.)
// ============================================================
function viewPeople(role, title) {
  setTitle(title);
  const allRows = DB.leaderboards[role];
  const mc      = document.getElementById('mainContent');
  let query    = '';
  let page     = 1;
  let pageSize = 25;

  mc.innerHTML = `
    <div class="view-list">
      <div class="list-controls">
        <div class="search-wrap">
          <input type="text" class="search-input" id="peopleSearch" placeholder="Search…" autocomplete="off">
        </div>
        <div class="sort-wrap">
          <select class="sort-select" id="pageSizeSelect">
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </div>
      </div>
      <div class="result-count" id="peopleCount"></div>
      <div class="people-list" id="peopleList"></div>
      <div class="pagination" id="pagination"></div>
    </div>`;

  function filtered() {
    if (!query) return allRows;
    const q = query.toLowerCase();
    return allRows.filter(r => r.name.toLowerCase().includes(q));
  }

  function render() {
    const rows       = filtered();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    document.getElementById('peopleCount').textContent =
      `${rows.length} people · page ${page} of ${totalPages}`;

    document.getElementById('peopleList').innerHTML = slice.map((r, i) => {
      const avatar = imgUrl(r.profile_path, 'w45');
      const hours  = Math.round(r.runtime / 60);
      return `
        <a href="#person-${r.tmdb_person_id}" class="people-row">
          <div class="people-rank-col">
            <span class="people-rank">${start + i + 1}</span>
            ${avatar
              ? `<img src="${avatar}" class="people-avatar" alt="${esc(r.name)}" loading="lazy">`
              : `<div class="people-avatar people-avatar--placeholder">${r.name[0]}</div>`}
            <span class="people-name">${esc(r.name)}</span>
          </div>
          <div class="people-stats-col">
            ${r.avg ? `<span class="rating-badge">${r.avg}</span>` : ''}
            <span class="people-count">${r.count} title${r.count !== 1 ? 's' : ''}</span>
            ${hours > 0 ? `<span class="people-time">${hours}h</span>` : ''}
          </div>
        </a>`;
    }).join('');

    document.getElementById('pagination').innerHTML = totalPages > 1 ? `
      <button class="page-btn" id="pagePrev" ${page === 1 ? 'disabled' : ''}>&#8592; Prev</button>
      <span class="page-indicator">${page} / ${totalPages}</span>
      <button class="page-btn" id="pageNext" ${page === totalPages ? 'disabled' : ''}>Next &#8594;</button>
    ` : '';

    document.getElementById('pagePrev')?.addEventListener('click', () => { page--; render(); window.scrollTo(0,0); });
    document.getElementById('pageNext')?.addEventListener('click', () => { page++; render(); window.scrollTo(0,0); });
  }

  document.getElementById('peopleSearch').addEventListener('input', e => {
    query = e.target.value.trim();
    page  = 1;
    render();
  });

  document.getElementById('pageSizeSelect').addEventListener('change', e => {
    pageSize = Number(e.target.value);
    page     = 1;
    render();
  });

  render();
}

// ============================================================
// VIEW: TIMELINE
// ============================================================
function viewTimeline() {
  setTitle('Timeline');
  const years   = [...DB.years.entries()].sort((a, b) => a[0] - b[0]);
  const decadeMap = new Map();
  for (const [year, entries] of years) {
    const d = Math.floor(year / 10) * 10;
    if (!decadeMap.has(d)) decadeMap.set(d, []);
    decadeMap.get(d).push(...entries);
  }
  const decades = [...decadeMap.entries()].sort((a, b) => a[0] - b[0]);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-home">
      <div class="section">
        <h2 class="section-title">By Decade</h2>
        <div class="chart-wrap chart-wrap--bar"><canvas id="chartDecades"></canvas></div>
      </div>
      <div class="section">
        <h2 class="section-title">By Year</h2>
        <div class="chart-wrap chart-wrap--tall"><canvas id="chartYears"></canvas></div>
      </div>
      <div class="section">
        <h2 class="section-title">Browse by Decade</h2>
        <div class="people-list">
          ${decades.map(([decade, entries]) => `
            <a href="#decade-${decade}" class="people-row">
              <div class="people-rank-col"><span class="people-name">${decade}s</span></div>
              <div class="people-stats-col">
                ${avgRating(entries) ? `<span class="rating-badge">${avgRating(entries)}</span>` : ''}
                <span class="people-count">${entries.length} titles</span>
              </div>
            </a>`).join('')}
        </div>
      </div>
    </div>`;

  mkChart('chartDecades', {
    type: 'bar',
    data: {
      labels: decades.map(([d]) => `${d}s`),
      datasets: [{ data: decades.map(([,e]) => e.length), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: chartOpts({ xTitle: 'Decade', yTitle: 'Films' }),
  });
  mkChart('chartYears', {
    type: 'bar',
    data: {
      labels: years.map(([y]) => y),
      datasets: [{ data: years.map(([,e]) => e.length), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: chartOpts({ xTitle: 'Year', yTitle: 'Films' }),
  });
}

// ============================================================
// VIEW: COUNTRIES
// ============================================================
function viewCountries() {
  setTitle('Countries');
  const countries = [...DB.countries.entries()]
    .map(([name, entries]) => ({ name, count: entries.length, avg: avgRating(entries) }))
    .sort((a, b) => b.count - a.count);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-home">
      <div class="section">
        <h2 class="section-title">Top 20 Countries</h2>
        <div class="chart-wrap chart-wrap--hbar"><canvas id="chartCountries"></canvas></div>
      </div>
      <div class="section">
        <div class="people-list">
          ${countries.map((c, i) => `
            <a href="#country-${encodeURIComponent(c.name)}" class="people-row">
              <div class="people-rank-col">
                <span class="people-rank">${i + 1}</span>
                <span class="people-name">${esc(c.name)}</span>
              </div>
              <div class="people-stats-col">
                ${c.avg ? `<span class="rating-badge">${c.avg}</span>` : ''}
                <span class="people-count">${c.count} titles</span>
              </div>
            </a>`).join('')}
        </div>
      </div>
    </div>`;

  const top20 = countries.slice(0, 20);
  mkChart('chartCountries', {
    type: 'bar',
    data: {
      labels: top20.map(c => c.name),
      datasets: [{ data: top20.map(c => c.count), backgroundColor: '#f5c518', borderRadius: 4 }],
    },
    options: { ...chartOpts({ yTitle: 'Titles' }), indexAxis: 'y' },
  });
}

// ============================================================
// VIEW: FAILED
// ============================================================
function viewFailed() {
  setTitle('Not Found');
  document.getElementById('mainContent').innerHTML = `
    <div class="view-list">
      <p class="muted-text">${DB.failed.length} entries could not be matched on TMDB. Click any to open on IMDB.</p>
      <div class="people-list">
        ${DB.failed.map(f => `
          <a href="${f.imdb_url}" target="_blank" rel="noopener" class="people-row">
            <div class="people-rank-col"><span class="people-name">${esc(f.imdb_id)}</span></div>
            <div class="people-stats-col">
              ${f.personal_rating ? `<span class="rating-badge">${f.personal_rating}</span>` : ''}
              <span class="tag tag--external">Open IMDB</span>
            </div>
          </a>`).join('')}
      </div>
    </div>`;
}

// ============================================================
// VIEW: MOVIE DETAIL
// ============================================================
function viewMovieDetail(id) {
  const entry = DB.byId.get(String(id));
  if (!entry) { navigate('movies'); return; }

  const title    = entry.title || '?';
  const poster   = imgUrl(entry.poster_path, 'w342');
  const backdrop = imgUrl(entry.backdrop_path, 'w1280');
  setTitle(title);
  setAction(backBtn());

  const crewGroup = (label, people) => {
    if (!people?.length) return '';
    return `<div class="detail-crew-group">
      <span class="crew-label">${label}</span>
      <span class="crew-names">${people.map(p =>
        `<a href="#person-${p.tmdb_person_id}" class="crew-link">${esc(p.name)}${p.jobs?.length > 1 ? ` <span class="crew-jobs">(${esc(p.jobs.join(', '))})</span>` : ''}</a>`
      ).join(', ')}</span>
    </div>`;
  };

  const cast20 = (entry.cast || []).slice(0, 20);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail">
      ${backdrop ? `<div class="detail-backdrop" style="background-image:url('${backdrop}')"></div>` : ''}
      <div class="detail-body">
        <div class="detail-main">
          <div class="detail-poster-wrap">
            ${poster
              ? `<img src="${poster}" class="detail-poster" alt="${esc(title)}">`
              : `<div class="detail-poster detail-poster--placeholder">${esc(title.slice(0,2).toUpperCase())}</div>`}
          </div>
          <div class="detail-info">
            <h1 class="detail-title">${esc(title)}</h1>
            ${entry.original_title && entry.original_title !== title ? `<p class="detail-original-title">${esc(entry.original_title)}</p>` : ''}
            ${entry.tagline ? `<p class="detail-tagline">"${esc(entry.tagline)}"</p>` : ''}
            <div class="detail-meta-row">
              ${entry.release_year ? `<span>${entry.release_year}</span>` : ''}
              ${entry.runtime ? `<span>${formatRuntime(entry.runtime)}</span>` : ''}
              ${entry.original_language ? `<span class="lang-badge">${entry.original_language.toUpperCase()}</span>` : ''}
            </div>
            <div class="detail-genres">${(entry.genres || []).map(g => `<a href="#genre-${encodeURIComponent(g)}" class="tag">${esc(g)}</a>`).join('')}</div>
            <div class="detail-ratings">
              <div class="rating-block">
                <div class="rating-value accent">${entry.personal_rating || '—'}</div>
                <div class="rating-label">Your Rating</div>
              </div>
              ${entry.vote_average ? `<div class="rating-block">
                <div class="rating-value">${entry.vote_average.toFixed(1)}</div>
                <div class="rating-label">TMDB · ${(entry.vote_count || 0).toLocaleString()}</div>
              </div>` : ''}
            </div>
            ${(entry.budget || entry.revenue) ? `<div class="detail-financial">
              ${entry.budget  ? `<span>Budget: $${(entry.budget /1e6).toFixed(1)}M</span>` : ''}
              ${entry.revenue ? `<span>Revenue: $${(entry.revenue/1e6).toFixed(1)}M</span>` : ''}
            </div>` : ''}
          </div>
        </div>
        ${entry.overview ? `<div class="detail-section"><h2 class="detail-section-title">Overview</h2><p class="detail-overview">${esc(entry.overview)}</p></div>` : ''}
        <div class="detail-section">
          <h2 class="detail-section-title">Crew</h2>
          <div class="detail-crew">
            ${crewGroup('Directed by', entry.directors)}
            ${crewGroup('Written by', entry.writers)}
            ${crewGroup('Music by', entry.composers)}
            ${crewGroup('Cinematography', entry.cinematographers)}
            ${crewGroup('Edited by', entry.editors)}
          </div>
        </div>
        ${cast20.length ? `<div class="detail-section">
          <h2 class="detail-section-title">Cast</h2>
          <div class="cast-grid">
            ${cast20.map(p => {
              const av = imgUrl(p.profile_path, 'w45');
              return `<a href="#person-${p.tmdb_person_id}" class="cast-item">
                ${av ? `<img src="${av}" class="cast-avatar" alt="${esc(p.name)}" loading="lazy">` : `<div class="cast-avatar cast-avatar--placeholder">${p.name[0]}</div>`}
                <span class="cast-name">${esc(p.name)}</span>
                ${p.character ? `<span class="cast-character">${esc(p.character)}</span>` : ''}
              </a>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="detail-links">
          ${entry.imdb_id ? `<a href="https://www.imdb.com/title/${entry.imdb_id}/" target="_blank" rel="noopener" class="btn btn--outline">IMDB</a>` : ''}
          <a href="https://www.themoviedb.org/${entry.media_type === 'tv' ? 'tv' : 'movie'}/${entry.tmdb_id}" target="_blank" rel="noopener" class="btn btn--outline">TMDB</a>
        </div>
      </div>
    </div>`;
}

// ============================================================
// VIEW: SHOW DETAIL
// ============================================================
function viewShowDetail(id) {
  const showEntry   = DB.tv.find(e => String(e.tmdb_id) === String(id));
  const showEpisodes = DB.episodes.filter(e => String(e.show_tmdb_id) === String(id));
  if (!showEntry && !showEpisodes.length) { navigate('tv'); return; }

  const ref    = showEntry || showEpisodes[0];
  const title  = showEntry?.title || showEpisodes[0]?.show_title || 'TV Show';
  const poster   = imgUrl(ref?.poster_path, 'w342');
  const backdrop = imgUrl(ref?.backdrop_path, 'w1280');
  setTitle(title);
  setAction(backBtn());

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail">
      ${backdrop ? `<div class="detail-backdrop" style="background-image:url('${backdrop}')"></div>` : ''}
      <div class="detail-body">
        <div class="detail-main">
          <div class="detail-poster-wrap">
            ${poster ? `<img src="${poster}" class="detail-poster" alt="${esc(title)}">` : ''}
          </div>
          <div class="detail-info">
            <h1 class="detail-title">${esc(title)}</h1>
            ${showEntry ? `
              <div class="detail-meta-row">
                ${showEntry.release_year ? `<span>${showEntry.release_year}</span>` : ''}
                ${showEntry.number_of_seasons ? `<span>${showEntry.number_of_seasons} seasons</span>` : ''}
                ${showEntry.number_of_episodes ? `<span>${showEntry.number_of_episodes} eps</span>` : ''}
              </div>
              <div class="detail-genres">${(showEntry.genres||[]).map(g=>`<a href="#genre-${encodeURIComponent(g)}" class="tag">${esc(g)}</a>`).join('')}</div>
              <div class="detail-ratings">
                <div class="rating-block"><div class="rating-value accent">${showEntry.personal_rating||'—'}</div><div class="rating-label">Your Rating</div></div>
                ${showEntry.vote_average ? `<div class="rating-block"><div class="rating-value">${showEntry.vote_average.toFixed(1)}</div><div class="rating-label">TMDB</div></div>` : ''}
              </div>` : ''}
          </div>
        </div>
        ${showEntry?.overview ? `<div class="detail-section"><h2 class="detail-section-title">Overview</h2><p class="detail-overview">${esc(showEntry.overview)}</p></div>` : ''}
        ${showEpisodes.length ? `
          <div class="detail-section">
            <h2 class="detail-section-title">Logged Episodes (${showEpisodes.length})</h2>
            <div class="people-list">
              ${[...showEpisodes]
                .sort((a,b) => (a.season_number - b.season_number) || (a.episode_number - b.episode_number))
                .map(ep => `
                  <a href="#movie-${ep.tmdb_id}" class="people-row">
                    <div class="people-rank-col">
                      <span class="people-rank">S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}</span>
                      <span class="people-name">${esc(ep.title||'?')}</span>
                    </div>
                    <div class="people-stats-col">
                      ${ep.personal_rating ? `<span class="rating-badge">${ep.personal_rating}</span>` : ''}
                      ${ep.runtime ? `<span class="people-time">${ep.runtime}m</span>` : ''}
                    </div>
                  </a>`).join('')}
            </div>
          </div>` : ''}
        <div class="detail-links">
          <a href="https://www.themoviedb.org/tv/${id}" target="_blank" rel="noopener" class="btn btn--outline">TMDB</a>
        </div>
      </div>
    </div>`;
}

// ============================================================
// VIEW: PERSON DETAIL
// ============================================================
function viewPersonDetail(id) {
  const person = DB.people.get(Number(id));
  if (!person) { history.back(); return; }

  setTitle(person.name);
  setAction(backBtn());

  const roleLabels = { directors:'Director', writers:'Writer', composers:'Composer', cinematographers:'Cinematographer', editors:'Editor', cast:'Actor' };
  const personRoles = [];
  const allEntries = new Map();

  for (const [role, appearances] of Object.entries(person.roles)) {
    if (!appearances.length) continue;
    personRoles.push(roleLabels[role]);
    for (const app of appearances) {
      const key = app.entry.tmdb_id;
      if (!allEntries.has(key)) allEntries.set(key, { entry: app.entry, roles: [] });
      allEntries.get(key).roles.push(roleLabels[role]);
    }
  }

  const entries = [...allEntries.values()].sort((a,b) => (b.entry.personal_rating||0) - (a.entry.personal_rating||0));
  const avg      = avgRating(entries.map(e => e.entry));
  const hours    = Math.round(totalRuntime(entries.map(e => e.entry)) / 60);
  const avatar   = imgUrl(person.profile_path, 'w185');

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail">
      <div class="detail-body">
        <div class="person-header">
          ${avatar
            ? `<img src="${avatar}" class="person-photo" alt="${esc(person.name)}">`
            : `<div class="person-photo person-photo--placeholder">${person.name[0]}</div>`}
          <div class="person-header-info">
            <h1 class="detail-title">${esc(person.name)}</h1>
            <div class="person-role-badges">${personRoles.map(r=>`<span class="tag">${r}</span>`).join('')}</div>
            <div class="detail-ratings">
              <div class="rating-block"><div class="rating-value">${entries.length}</div><div class="rating-label">Titles</div></div>
              ${avg ? `<div class="rating-block"><div class="rating-value accent">${avg}</div><div class="rating-label">Avg Rating</div></div>` : ''}
              ${hours > 0 ? `<div class="rating-block"><div class="rating-value">${hours}h</div><div class="rating-label">Watch Time</div></div>` : ''}
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h2 class="detail-section-title">Filmography (${entries.length})</h2>
          <div class="poster-grid">${entries.map(({entry}) => posterCard(entry)).join('')}</div>
        </div>
        <div class="detail-links">
          <a href="https://www.themoviedb.org/person/${person.tmdb_person_id}" target="_blank" rel="noopener" class="btn btn--outline">View on TMDB</a>
        </div>
      </div>
    </div>`;
}

// ============================================================
// VIEW: GENRE DETAIL
// ============================================================
function viewGenreDetail(genre) {
  const entries = DB.genres.get(genre) || [];
  setTitle(genre);
  setAction(backBtn());
  const sorted = [...entries].sort((a,b) => (b.personal_rating||0) - (a.personal_rating||0));
  const avg = avgRating(entries);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail"><div class="detail-body">
      <div class="genre-header">
        <h1 class="detail-title">${esc(genre)}</h1>
        <div class="detail-ratings">
          <div class="rating-block"><div class="rating-value">${entries.length}</div><div class="rating-label">Titles</div></div>
          ${avg ? `<div class="rating-block"><div class="rating-value accent">${avg}</div><div class="rating-label">Avg Rating</div></div>` : ''}
        </div>
      </div>
      <div class="detail-section"><div class="poster-grid">${sorted.map(posterCard).join('')}</div></div>
    </div></div>`;
}

// ============================================================
// VIEW: COUNTRY DETAIL
// ============================================================
function viewCountryDetail(country) {
  const entries = DB.countries.get(country) || [];
  setTitle(country);
  setAction(backBtn());
  const sorted = [...entries].sort((a,b) => (b.personal_rating||0) - (a.personal_rating||0));
  const avg = avgRating(entries);

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail"><div class="detail-body">
      <div class="genre-header">
        <h1 class="detail-title">${esc(country)}</h1>
        <div class="detail-ratings">
          <div class="rating-block"><div class="rating-value">${entries.length}</div><div class="rating-label">Titles</div></div>
          ${avg ? `<div class="rating-block"><div class="rating-value accent">${avg}</div><div class="rating-label">Avg Rating</div></div>` : ''}
        </div>
      </div>
      <div class="detail-section"><div class="poster-grid">${sorted.map(posterCard).join('')}</div></div>
    </div></div>`;
}

// ============================================================
// VIEW: DECADE DETAIL
// ============================================================
function viewDecadeDetail(decade) {
  const start   = Number(decade);
  const entries = DB.watchable.filter(e => e.release_year >= start && e.release_year < start + 10);
  setTitle(`${start}s`);
  setAction(backBtn());
  const sorted = [...entries].sort((a,b) => (b.personal_rating||0) - (a.personal_rating||0));

  document.getElementById('mainContent').innerHTML = `
    <div class="view-detail"><div class="detail-body">
      <div class="genre-header">
        <h1 class="detail-title">${start}s</h1>
        <div class="detail-ratings">
          <div class="rating-block"><div class="rating-value">${entries.length}</div><div class="rating-label">Titles</div></div>
          ${avgRating(entries) ? `<div class="rating-block"><div class="rating-value accent">${avgRating(entries)}</div><div class="rating-label">Avg Rating</div></div>` : ''}
        </div>
      </div>
      <div class="detail-section"><div class="poster-grid">${sorted.map(posterCard).join('')}</div></div>
    </div></div>`;
}

// ============================================================
// BOOTSTRAP
// ============================================================
async function main() {
  try {
    await initData();
    document.getElementById('loading').classList.add('hidden');
    initNav();
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  } catch (err) {
    console.error(err);
    document.getElementById('loading').innerHTML = `
      <div class="loading-inner">
        <div class="loading-logo">MOVIE<span class="accent">STATS</span></div>
        <p style="color:#f5c518;margin-bottom:8px">Failed to load data</p>
        <p style="color:#a8a8a8;font-size:.85rem">${esc(err.message)}</p>
        <p style="color:#666;font-size:.8rem;margin-top:12px">Tip: serve with<br><code style="color:#f5c518">python3 -m http.server 8000</code></p>
      </div>`;
  }
}

main();
