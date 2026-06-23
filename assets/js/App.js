/* ═══════════════════════════════════════════════════════
   MUNDIAL 2026 — App Logic
   Data source: /data/*.json (fetched by GitHub Actions)
   Live refresh: every 60s (5s if live match detected)
   ═══════════════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────
const DATA_PATH      = './data';
const REFRESH_NORMAL = 60_000;   // 1 min
const REFRESH_LIVE   = 10_000;   // 10s during live matches
const NOTIF_HOUR_AM  = 9;        // 09:00 local
const NOTIF_HOUR_PM  = 22;       // 22:00 local

// Códigos ISO2 por nombre de país
const ISO_MAP = {
  'United States': 'us', 'USA': 'us', 'Mexico': 'mx', 'Canada': 'ca',
  'Brazil': 'br', 'Argentina': 'ar', 'Germany': 'de', 'France': 'fr',
  'Spain': 'es', 'England': 'gb-eng', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Italy': 'it', 'Uruguay': 'uy', 'Colombia': 'co',
  'Ecuador': 'ec', 'Chile': 'cl', 'Peru': 'pe', 'Venezuela': 've',
  'Paraguay': 'py', 'Bolivia': 'bo', 'Japan': 'jp', 'South Korea': 'kr',
  'Australia': 'au', 'Iran': 'ir', 'Saudi Arabia': 'sa', 'Morocco': 'ma',
  'Senegal': 'sn', 'Cameroon': 'cm', 'Ghana': 'gh', 'Nigeria': 'ng',
  'Egypt': 'eg', 'Tunisia': 'tn', 'Algeria': 'dz', 'Croatia': 'hr',
  'Serbia': 'rs', 'Poland': 'pl', 'Switzerland': 'ch', 'Denmark': 'dk',
  'Austria': 'at', 'Wales': 'gb-wls', 'Scotland': 'gb-sct', 'Turkey': 'tr',
  'Czech Republic': 'cz', 'Ukraine': 'ua', 'Hungary': 'hu', 'Greece': 'gr',
  'Romania': 'ro', 'Slovakia': 'sk', 'Slovenia': 'si', 'Albania': 'al',
  'Costa Rica': 'cr', 'Panama': 'pa', 'Honduras': 'hn', 'El Salvador': 'sv',
  'Jamaica': 'jm', 'Iceland': 'is', 'Norway': 'no', 'Sweden': 'se',
  'Finland': 'fi', 'Qatar': 'qa', 'South Africa': 'za', 'Guatemala': 'gt',
  'New Zealand': 'nz', 'China': 'cn', 'India': 'in', 'Morocco': 'ma',
  'Portugal': 'pt', 'Netherlands': 'nl', 'Trinidad and Tobago': 'tt',
};

function getFlag(name, size = 32) {
  const code = ISO_MAP[name];
  if (!code) return `<span style="font-size:1.4rem">🏳️</span>`;
  return `<img 
    src="https://flagcdn.com/w${size}/${code}.png"
    srcset="https://flagcdn.com/w${size * 2}/${code}.png 2x"
    alt="${name}"
    class="flag-img"
    onerror="this.replaceWith(document.createTextNode('🏳️'))"
  >`;
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth()    === d2.getMonth()    &&
         d1.getDate()     === d2.getDate();
}

// ─── STATE ───────────────────────────────────────────
let state = {
  matches:   [],
  standings: [],
  scorers:   [],
  meta:      null,
  activeSection: 'today',
  refreshTimer: null,
};

// ─── DATA FETCHING ────────────────────────────────────
async function fetchJSON(path) {
  const r = await fetch(path + '?t=' + Date.now());
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return r.json();
}

async function loadData() {
  try {
    const [matches, standings, scorers, meta] = await Promise.all([
      fetchJSON(`${DATA_PATH}/matches.json`),
      fetchJSON(`${DATA_PATH}/standings.json`),
      fetchJSON(`${DATA_PATH}/scorers.json`),
      fetchJSON(`${DATA_PATH}/meta.json`),
    ]);
    state.matches   = matches.matches   || [];
    state.standings = standings.standings || [];
    state.scorers   = scorers.scorers   || [];
    state.meta      = meta;

    updateLastUpdated(meta.updated);
    render();
    scheduleRefresh();
  } catch (err) {
    console.warn('Data load error:', err);
    // Show demo/placeholder data
    loadDemoData();
  }
}

function loadDemoData() {
  // Minimal demo so the page renders beautifully even before real data
  state.matches = generateDemoMatches();
  state.standings = generateDemoStandings();
  state.scorers = generateDemoScorers();
  state.meta = { updated: new Date().toISOString() };
  updateLastUpdated(state.meta.updated);
  render();
  showToast('Mostrando datos de demostración — configura tu API key en GitHub Secrets', 'info');
}

// ─── RENDERING ROUTER ─────────────────────────────────
function render() {
  renderToday();
  renderFixtures();
  renderGroups();
  renderBracket();
  renderScorers();
  renderTicker();
  checkLiveMatches();
}

// ─── TODAY ────────────────────────────────────────────
function renderToday() {
  const container  = document.getElementById('todayMatches');
  const heroWrap   = document.getElementById('nextMatchHero');
  const today      = new Date();
  const todayM = state.matches.filter(m => isSameDay(new Date(m.utcDate), today));

  if (todayM.length === 0) {
    container.innerHTML = '';
    heroWrap.hidden = false;
    renderNextMatchHero();
    return;
  }

  heroWrap.hidden = true;
  container.innerHTML = todayM.map(renderMatchCard).join('');
}

function renderMatchCard(m) {
  const home   = m.homeTeam?.name || 'TBD';
  const away   = m.awayTeam?.name || 'TBD';
  const hScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home;
  const aScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away;
  const status = m.status;
  const isLive = status === 'IN_PLAY' || status === 'PAUSED' || status === 'HALFTIME';
  const isDone = status === 'FINISHED';
  const minute = m.minute || '';

  const statusLabel = isLive ? (status === 'HALFTIME' ? 'Medio Tiempo' : `${minute}'`)
                    : isDone ? 'Final'
                    : formatTime(m.utcDate);

  const scoreHTML = (hScore !== null && hScore !== undefined)
    ? `<span class="score-display">${hScore} – ${aScore}</span>`
    : `<span class="score-display" style="font-size:1.2rem;color:var(--text-lo)">${formatTime(m.utcDate)}</span>`;

  return `
    <article class="match-card ${isLive ? 'live' : isDone ? 'finished' : ''}">
      <div class="match-meta">
        <span class="match-group">${m.stage ? fmtStage(m.stage) : ''} ${m.group ? '· ' + m.group : ''}</span>
        <span class="match-status ${isLive ? 'live' : isDone ? 'finished' : 'scheduled'}">${statusLabel}</span>
      </div>
      <div class="match-teams">
        <div class="team team--home">
          <span class="team-flag">${getFlag(home)}</span>
          <span class="team-name">${home}</span>
        </div>
        <div class="score-block">
          ${scoreHTML}
        </div>
        <div class="team team--away">
          <span class="team-flag">${getFlag(away)}</span>
          <span class="team-name">${away}</span>
        </div>
      </div>
      ${m.venue ? `<p class="match-venue">📍 ${m.venue}</p>` : ''}
    </article>`;
}

function renderNextMatchHero() {
  const upcoming = state.matches
    .filter(m => new Date(m.utcDate) > new Date() && m.status === 'TIMED')
    .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate))[0];

  const hero = document.getElementById('nextMatchHero');
  const teamsEl = document.getElementById('nextMatchTeams');
  const countEl = document.getElementById('countdown');

  if (!upcoming) {
    hero.hidden = true;
    document.getElementById('todayMatches').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚽</div>
        <h3>Sin Partidos Hoy</h3>
        <p>No hay encuentros programados para hoy.</p>
      </div>`;
    return;
  }

  const h = upcoming.homeTeam?.name || 'TBD';
  const a = upcoming.awayTeam?.name || 'TBD';
  teamsEl.textContent = `${getFlag(h)} ${h}  vs  ${a} ${getFlag(a)}`;

  // Countdown ticker
  function tick() {
    const diff = new Date(upcoming.utcDate) - new Date();
    if (diff <= 0) { location.reload(); return; }
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    const secs  = Math.floor((diff % 60000)    / 1000);
    countEl.innerHTML = [
      ['días', days], ['hrs', hours], ['min', mins], ['seg', secs]
    ].map(([lbl, val]) => `
      <div class="countdown-unit">
        <span class="countdown-num">${String(val).padStart(2,'0')}</span>
        <span class="countdown-lbl">${lbl}</span>
      </div>`).join('');
  }
  tick();
  setInterval(tick, 1000);
}

// ─── FIXTURES ─────────────────────────────────────────
function renderFixtures() {
  const container = document.getElementById('fixturesList');
  const phase     = document.getElementById('fixturePhaseFilter')?.value || '';
  let matches = [...state.matches].sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
  if (phase) matches = matches.filter(m => m.stage === phase);

  if (matches.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>Sin partidos</h3></div>';
    return;
  }

  // Group by date
  const byDay = {};
  for (const m of matches) {
    const key = m.utcDate?.slice(0,10) || 'TBD';
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(m);
  }

  container.innerHTML = Object.entries(byDay).map(([date, ms]) => {
    const label = date !== 'TBD'
      ? formatDate(date + 'T12:00:00Z')
      : 'Fecha por confirmar';
    return `
      <div class="fixture-day">
        <div class="fixture-date-header">${label}</div>
        ${ms.map(renderFixtureRow).join('')}
      </div>`;
  }).join('');
}

function renderFixtureRow(m) {
  const home   = m.homeTeam?.name || 'TBD';
  const away   = m.awayTeam?.name || 'TBD';
  const hScore = m.score?.fullTime?.home;
  const aScore = m.score?.fullTime?.away;
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'HALFTIME';
  const isDone = m.status === 'FINISHED';
  const hasScore = hScore !== null && hScore !== undefined;

  return `
    <div class="fixture-row ${isLive ? 'live' : ''}">
      <span class="fx-team fx-team-home">${getFlag(home)} ${home}</span>
      <span class="fx-score ${!hasScore ? 'pending' : ''}">${hasScore ? `${hScore}–${aScore}` : formatTime(m.utcDate)}</span>
      <span class="fx-team">${away} ${getFlag(away)}</span>
      <span class="fx-status ${isLive ? 'live' : ''}">${isLive ? `${m.minute || 'EN VIVO'}'` : isDone ? 'Final' : ''}</span>
    </div>`;
}

// ─── GROUPS ───────────────────────────────────────────
function renderGroups() {
  const grid = document.getElementById('groupsGrid');

  if (!state.standings || state.standings.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>Tabla no disponible</h3><p>Las posiciones aparecerán cuando inicie la fase de grupos.</p></div>';
    return;
  }

  grid.innerHTML = state.standings.map(group => {
    const letter = group.group?.replace('GROUP_','') || group.stage || '?';
    const rows = (group.table || []).map((t, i) => `
      <tr>
        <td><span class="gt-pos">${i + 1}</span></td>
        <td><span class="gt-flag">${getFlag(t.team?.name || '')}</span><span class="gt-team">${t.team?.name || '—'}</span></td>
        <td>${t.playedGames || 0}</td>
        <td>${t.won || 0}</td>
        <td>${t.draw || 0}</td>
        <td>${t.lost || 0}</td>
        <td>${t.goalsFor || 0}:${t.goalsAgainst || 0}</td>
        <td class="gt-pts">${t.points || 0}</td>
      </tr>`).join('');

    return `
      <div class="group-card">
        <div class="group-card-header">
          <span class="group-letter">${letter}</span>
          <span class="group-label">Grupo ${letter}</span>
        </div>
        <table class="group-table">
          <thead>
            <tr>
              <th>#</th><th style="text-align:left">Selección</th>
              <th>J</th><th>G</th><th>E</th><th>P</th><th>GD</th><th>Pts</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
}

// ─── BRACKET ──────────────────────────────────────────
function renderBracket() {
  const container = document.getElementById('bracketContainer');
  const PHASES = [
    { key: 'ROUND_OF_32',    label: 'Octavos' },
    { key: 'ROUND_OF_16',    label: 'Dieciseisavos' },
    { key: 'QUARTER_FINALS', label: 'Cuartos' },
    { key: 'SEMI_FINALS',    label: 'Semifinales' },
    { key: 'FINAL',          label: 'Final' },
  ];

  const byPhase = {};
  for (const m of state.matches) {
    const s = m.stage;
    if (!byPhase[s]) byPhase[s] = [];
    byPhase[s].push(m);
  }

  const rounds = PHASES.filter(p => byPhase[p.key]);

  if (rounds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <h3>Fase Eliminatoria Pendiente</h3>
        <p>Las llaves se mostrarán una vez que termine la fase de grupos.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="bracket-scroll">
      ${rounds.map(phase => {
        const ms = byPhase[phase.key] || [];
        return `
          <div class="bracket-round">
            <div class="bracket-round-label">${phase.label}</div>
            ${ms.map(m => renderBracketMatch(m)).join('')}
          </div>`;
      }).join('')}
    </div>`;
}

function renderBracketMatch(m) {
  const h  = m.homeTeam?.name || 'TBD';
  const a  = m.awayTeam?.name || 'TBD';
  const hs = m.score?.fullTime?.home;
  const as_ = m.score?.fullTime?.away;
  const hWin = hs !== null && hs !== undefined && hs > as_;
  const aWin = as_ !== null && as_ !== undefined && as_ > hs;

  return `
    <div class="bracket-match">
      <div class="bracket-team ${hWin ? 'winner' : ''}">
        <span class="bt-name">${getFlag(h)} ${h}</span>
        <span class="bt-score ${hWin ? 'winner' : ''}">${hs !== null && hs !== undefined ? hs : '–'}</span>
      </div>
      <div class="bracket-team ${aWin ? 'winner' : ''}">
        <span class="bt-name">${getFlag(a)} ${a}</span>
        <span class="bt-score ${aWin ? 'winner' : ''}">${as_ !== null && as_ !== undefined ? as_ : '–'}</span>
      </div>
    </div>`;
}

// ─── SCORERS ──────────────────────────────────────────
function renderScorers() {
  const wrap = document.getElementById('scorersTable');
  if (!state.scorers || state.scorers.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><h3>Sin datos</h3><p>La tabla de goleadores estará disponible cuando inicien los partidos.</p></div>';
    return;
  }

  const rows = state.scorers.map((s, i) => `
    <tr>
      <td class="scorer-rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
      <td>
        <div class="scorer-name">${getFlag(s.team?.name || '')} ${s.player?.name || '—'}</div>
        <div class="scorer-team">${s.team?.name || ''}</div>
      </td>
      <td>${s.penalties || 0} pen</td>
      <td class="scorer-goals">${s.goals || 0}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="scorers-table">
      <thead>
        <tr><th>#</th><th>Jugador</th><th>Pen.</th><th>Goles</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── LIVE TICKER ──────────────────────────────────────
function renderTicker() {
  const ticker  = document.getElementById('liveTicker');
  const content = document.getElementById('tickerContent');
  const live = state.matches.filter(m =>
    m.status === 'IN_PLAY' || m.status === 'HALFTIME' || m.status === 'PAUSED'
  );

  if (live.length === 0) {
    ticker.hidden = true;
    return;
  }

  ticker.hidden = false;
  const items = live.map(m => {
    const h  = m.homeTeam?.name || 'TBD';
    const a  = m.awayTeam?.name || 'TBD';
    const hs = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? '?';
    const as_ = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? '?';
    return `${getFlag(h)} ${h} ${hs} – ${as_} ${a} ${getFlag(a)}  ${m.minute ? m.minute+"'" : ''}`;
  }).join('     ·     ');

  // Duplicate for seamless loop
  content.textContent = items + '     ·     ' + items;
}

// ─── LIVE CHECK & AUTO REFRESH ────────────────────────
function checkLiveMatches() {
  const hasLive = state.matches.some(m =>
    m.status === 'IN_PLAY' || m.status === 'HALFTIME' || m.status === 'PAUSED'
  );
  scheduleRefresh(hasLive ? REFRESH_LIVE : REFRESH_NORMAL);
}

function scheduleRefresh(delay = REFRESH_NORMAL) {
  if (state.refreshTimer) clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    await loadData();
  }, delay);
}

function updateLastUpdated(iso) {
  const el = document.getElementById('lastUpdated');
  const footer = document.getElementById('footerUpdated');
  if (!iso) return;
  const d = new Date(iso);
  const txt = `Actualizado ${d.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit' })}`;
  if (el) el.textContent = txt;
  if (footer) footer.textContent = txt;
}

// ─── NAVIGATION ───────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('section-' + sec)?.classList.add('active');
      state.activeSection = sec;
    });
  });

  // Fixture phase filter
  document.getElementById('fixturePhaseFilter')?.addEventListener('change', renderFixtures);
}

// ─── NOTIFICATIONS ────────────────────────────────────
function initNotifications() {
  const btn = document.getElementById('notifBtn');
  const perm = localStorage.getItem('notifEnabled') === 'true';
  if (perm) btn.classList.add('active');

  btn.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      showToast('Las notificaciones no están disponibles en tu navegador.', 'error');
      return;
    }

    if (Notification.permission === 'denied') {
      showToast('Bloqueaste las notificaciones. Habilítalas en la configuración del navegador.', 'error');
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('notifEnabled', 'true');
      btn.classList.add('active');
      showToast('🔔 Recibirás alertas a las 9 AM y 10 PM con los partidos del día', 'success');
      scheduleNotifications();
    }
  });

  if (Notification.permission === 'granted' && localStorage.getItem('notifEnabled') === 'true') {
    scheduleNotifications();
  }
}

function scheduleNotifications() {
  // Check every minute if it's time to send a notification
  setInterval(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (m === 0 && (h === NOTIF_HOUR_AM || h === NOTIF_HOUR_PM)) {
      sendDailyMatchNotification();
    }
  }, 60_000);
}

function sendDailyMatchNotification() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowMatches = state.matches.filter(m =>
    isSameDay(new Date(m.utcDate), tomorrow)
  );

  if (tomorrowMatches.length === 0) return;

  const body = tomorrowMatches.slice(0,3).map(m => {
    const h = m.homeTeam?.name || 'TBD';
    const a = m.awayTeam?.name || 'TBD';
    return `${getFlag(h)} ${h} vs ${a} ${getFlag(a)} · ${formatTime(m.utcDate)}`;
  }).join('\n') + (tomorrowMatches.length > 3 ? `\n+${tomorrowMatches.length - 3} más` : '');

  new Notification(`⚽ Mundial 2026 — Mañana hay ${tomorrowMatches.length} partido${tomorrowMatches.length > 1 ? 's' : ''}`, {
    body,
    icon: './assets/icon-192.png',
    badge: './assets/icon-72.png',
    tag: 'wc2026-daily',
  });
}

// ─── TOAST ────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ─── STAGE FORMATTER ──────────────────────────────────
function fmtStage(stage) {
  const map = {
    GROUP_STAGE:    'Grupos',
    ROUND_OF_32:    'Octavos',
    ROUND_OF_16:    'Dieciseisavos',
    QUARTER_FINALS: 'Cuartos',
    SEMI_FINALS:    'Semis',
    FINAL:          'Final',
  };
  return map[stage] || stage;
}

// ─── DEMO DATA ────────────────────────────────────────
function generateDemoMatches() {
  const today = new Date();
  const fmt = d => d.toISOString();

  function match(home, away, hg, ag, status, minsAgo, group) {
    const d = new Date(today);
    if (minsAgo !== undefined) d.setMinutes(d.getMinutes() - minsAgo);
    return {
      utcDate: fmt(d), status, stage: 'GROUP_STAGE', group,
      homeTeam: { name: home }, awayTeam: { name: away },
      score: { fullTime: { home: hg, away: ag }, halfTime: { home: null, away: null } },
      minute: status === 'IN_PLAY' ? String(Math.max(1, 90 - minsAgo)) : null,
      venue: 'Estadio Demo',
    };
  }

  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  return [
    match('Mexico', 'Brazil',    1, 1, 'IN_PLAY',  34, 'GROUP_A'),
    match('USA',    'Argentina', null, null, 'TIMED', undefined, 'GROUP_B'),
    match('Spain',  'Germany',   2, 1, 'FINISHED', 200, 'GROUP_C'),
    match('France', 'England',   0, 0, 'FINISHED', 300, 'GROUP_D'),
    {
      utcDate: tomorrow.toISOString(), status: 'TIMED', stage: 'GROUP_STAGE', group: 'GROUP_E',
      homeTeam: { name: 'Canada' }, awayTeam: { name: 'Portugal' },
      score: { fullTime: { home: null, away: null } }, venue: 'Vancouver Stadium',
    },
    {
      utcDate: tomorrow.toISOString(), status: 'TIMED', stage: 'GROUP_STAGE', group: 'GROUP_F',
      homeTeam: { name: 'Netherlands' }, awayTeam: { name: 'Morocco' },
      score: { fullTime: { home: null, away: null } }, venue: 'Philadelphia Arena',
    },
    {
      utcDate: yesterday.toISOString(), status: 'FINISHED', stage: 'GROUP_STAGE', group: 'GROUP_A',
      homeTeam: { name: 'Japan' }, awayTeam: { name: 'South Korea' },
      score: { fullTime: { home: 2, away: 1 } }, venue: 'SoFi Stadium',
    },
  ];
}

function generateDemoStandings() {
  const groups = [
    { letter: 'A', teams: [['Mexico','🇲🇽',3,1,0,0,2,0,3],['Brazil','🇧🇷',3,1,1,1,3,2,4],['Japan','🇯🇵',3,1,0,2,2,3,3],['Ecuador','🇪🇨',3,0,1,2,1,3,1]] },
    { letter: 'B', teams: [['USA','🇺🇸',2,2,0,0,4,1,6],['Argentina','🇦🇷',2,1,0,1,2,2,3],['Canada','🇨🇦',2,1,0,1,3,3,3],['Bolivia','🇧🇴',2,0,0,2,0,3,0]] },
    { letter: 'C', teams: [['Spain','🇪🇸',2,2,0,0,5,1,6],['Germany','🇩🇪',2,1,0,1,2,2,3],['Portugal','🇵🇹',2,1,0,1,3,3,3],['Morocco','🇲🇦',2,0,0,2,0,4,0]] },
    { letter: 'D', teams: [['France','🇫🇷',2,1,1,0,2,1,4],['England','🏴󠁧󠁢󠁥󠁮󠁧󠁿',2,1,1,0,3,2,4],['Netherlands','🇳🇱',2,0,1,1,1,2,1],['Senegal','🇸🇳',2,0,1,1,1,2,1]] },
  ];

  return groups.map(g => ({
    group: `GROUP_${g.letter}`,
    stage: 'GROUP_STAGE',
    table: g.teams.map(t => ({
      team: { name: t[0] },
      playedGames: t[2], won: t[3], draw: t[4], lost: t[5],
      goalsFor: t[6], goalsAgainst: t[7], points: t[8],
    })),
  }));
}

function generateDemoScorers() {
  return [
    { player: { name: 'Lionel Messi' },   team: { name: 'Argentina' }, goals: 4, penalties: 1 },
    { player: { name: 'Erling Haaland' }, team: { name: 'Norway' },    goals: 3, penalties: 0 },
    { player: { name: 'Kylian Mbappé' },  team: { name: 'France' },    goals: 3, penalties: 1 },
    { player: { name: 'Vinicius Jr.' },   team: { name: 'Brazil' },    goals: 2, penalties: 0 },
    { player: { name: 'Harry Kane' },     team: { name: 'England' },   goals: 2, penalties: 1 },
    { player: { name: 'Pedri' },          team: { name: 'Spain' },     goals: 2, penalties: 0 },
    { player: { name: 'Christian Pulisic'}, team: { name: 'USA' },     goals: 2, penalties: 0 },
  ];
}

// ─── BOOT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNotifications();
  loadData();
});