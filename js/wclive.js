// ============================================================
// WC 2026 – Live Prediction Game | app.js
// ============================================================

// ── YOUR APPS SCRIPT WEB APP URL ─────────────────────────────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzpmfwqcJBkf12gD7ikyxTZt4bhby2XzWQf2zo_0dbqASEUPYevqYGI9IcxGuo9F82mmQ/exec';

// ── Player visual config ──────────────────────────────────────
const PLAYER_COLORS = {
  'Amit':      { color: '#5b6cf6', bg: '#eeedfe', textc: '#3C3489', initials: 'AM' },
  'Barun':     { color: '#1a6b3a', bg: '#e8f5ee', textc: '#0f4a27', initials: 'BA' },
  'Prashanna': { color: '#d97706', bg: '#faeeda', textc: '#633806', initials: 'PR' },
  'Rishav':    { color: '#e05252', bg: '#fcebeb', textc: '#791f1f', initials: 'RI' },
  'Sweastik':  { color: '#7c3aed', bg: '#eeedfe', textc: '#26215C', initials: 'SW' }
};

// ── App state ─────────────────────────────────────────────────
let PLAYERS      = [];
let MATCHES      = [];
let activeGroup  = 'All';
let activeStatus = 'upcoming';
let activePlayer = '';

// =============================================================
// DATE HELPERS
// =============================================================

/** Returns the current moment expressed in America/Los_Angeles timezone
 * as a plain (timezone-naive) Date so comparisons work correctly. */
function getCurrentPacificDate() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(now);
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return new Date(`${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`);
}

/** Parse "June 11 - 12:00" → Date in 2026 (Pacific, treated as naive). */
function parseMatchDateTime(str) {
  if (!str || typeof str !== 'string') return new Date(0);
  try {
    const clean  = str.replace('-', '').replace(/\s+/g, ' ').trim(); // "June 11 12:00"
    const parts  = clean.split(' ');
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const month  = months[parts[0].substring(0, 3)];
    const day    = parseInt(parts[1], 10);
    const [h, m] = parts[2].split(':');
    return new Date(2026, month, day, parseInt(h, 10), parseInt(m, 10), 0, 0);
  } catch (e) {
    console.error('Date parse error:', str, e);
    return new Date(0);
  }
}

/** True if the match's date (Pacific) is the same calendar day as today. */
function isToday(str) {
  const now   = getCurrentPacificDate();
  const match = parseMatchDateTime(str);
  return match.getFullYear() === now.getFullYear()
      && match.getMonth()    === now.getMonth()
      && match.getDate()     === now.getDate();
}

// =============================================================
// SCORING
// =============================================================
function calcPoints(homeScore, awayScore, predH, predA) {
  if (homeScore === null || awayScore === null) return null;
  if (predH    === null || predA    === null)  return null;
  if (predH === homeScore && predA === awayScore) return 3;
  return Math.sign(homeScore - awayScore) === Math.sign(predH - predA) ? 1 : 0;
}

// =============================================================
// DATA LOADING  (GET from Apps Script)
// =============================================================
async function loadData() {
  const loadingMsg = document.getElementById('loadingMsg');
  const appContent = document.getElementById('appContent');
  loadingMsg.style.display = 'block';
  appContent.style.display = 'none';
  loadingMsg.innerHTML = '<div>Loading data from Google Sheets…</div>';

  try {
    const res  = await fetch(SCRIPT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) throw new Error('Sheet returned no data');
    parseSheetData(data);
    loadingMsg.style.display = 'none';
    appContent.style.display = 'block';
    buildAllUI();
  } catch (err) {
    console.error('loadData error:', err);
    loadingMsg.innerHTML = `
      <div class="error">
        <strong>Failed to load data from Google Sheets</strong><br><br>
        ${err.message}<br><br>
        Open the console (F12) for details.
      </div>`;
  }
}

function parseSheetData(rows) {
  if (!rows || rows.length < 3)
    throw new Error('Not enough rows: ' + (rows?.length ?? 0));

  // ── Discover player names from row 0 at indices 5,8,11,14,17 ──
  const headerRow     = rows[0] || [];
  const playerIndices = [5, 8, 11, 14, 17];
  const playerNames   = playerIndices
    .map(i => headerRow[i]?.toString().trim())
    .filter(Boolean);

  console.log('Players:', playerNames);

  PLAYERS = playerNames.map(name => ({
    name,
    color:    PLAYER_COLORS[name]?.color    || '#888',
    bg:       PLAYER_COLORS[name]?.bg       || '#e0e0e0',
    textc:    PLAYER_COLORS[name]?.textc    || '#333',
    initials: PLAYER_COLORS[name]?.initials || name.slice(0, 2).toUpperCase(),
    pts: 0
  }));

  if (PLAYERS.length) activePlayer = PLAYERS[0].name;

  // ── Parse match rows (skip rows[0] header and rows[1] sub-header) ──
  MATCHES = [];
  const parse = v => (v === '' || v == null) ? null : parseInt(v, 10);

  rows.slice(2).forEach((cols, r) => {
    if (!cols || !cols[0] || cols[0] === '') return;

    const predictions = PLAYERS.map((pl, i) => {
      const base = 5 + i * 3;
      const h = parse(cols[base]);
      const a = parse(cols[base + 1]);
      return { p: pl.name, h: isNaN(h) ? null : h, a: isNaN(a) ? null : a, pts: null };
    });

    MATCHES.push({
      id:           r + 1,
      rowIndex:     r + 2, // 0-based index in the full rows[] array  (rows[2] = first data row)
      dateTimeRaw:  String(cols[0]),
      dateDisplay:  String(cols[0]),
      group:        cols[1] || '',
      matchup:      cols[2] || '',
      homeScoreRaw: parse(cols[3]),
      awayScoreRaw: parse(cols[4]),
      homeScore:    null,
      awayScore:    null,
      preds:        predictions
    });
  });

  console.log('Matches parsed:', MATCHES.length);

  // Only expose scores for matches that have already kicked off
  const now = getCurrentPacificDate();
  MATCHES.forEach(m => {
    if (now >= parseMatchDateTime(m.dateTimeRaw)) {
      m.homeScore = m.homeScoreRaw;
      m.awayScore = m.awayScoreRaw;
    }
  });

  // Calculate per-prediction and total points
  MATCHES.forEach(m => {
    m.preds.forEach(pr => { pr.pts = calcPoints(m.homeScore, m.awayScore, pr.h, pr.a); });
  });
  PLAYERS.forEach(p => {
    p.pts = MATCHES.reduce((s, m) => s + (m.preds.find(pr => pr.p === p.name)?.pts || 0), 0);
  });
}

// =============================================================
// SAVE PREDICTION  (POST to Apps Script)
// =============================================================
async function savePrediction(matchRowIndex, playerName, home, away) {
  const payload = JSON.stringify({
    action:        'savePrediction',
    matchRowIndex,
    playerName,
    home,
    away
  });

  await fetch(SCRIPT_URL, {
    method:  'POST',
    mode:    'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body:    payload
  });
}

// =============================================================
// TIMER & GRACE PERIOD (5 min after kickoff)
// =============================================================

/** Get the lock deadline (match start + 5 minutes) as a Date object */
function getMatchLockDeadline(match) {
  const start = parseMatchDateTime(match.dateTimeRaw);
  return new Date(start.getTime() + 5 * 60 * 1000);
}

/** Format milliseconds to MM:SS countdown */
function formatCountdown(ms) {
  if (ms <= 0) return "🔒 Locked";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  return `⏱️ ${timeStr} mins until lock`;
}

/** Update all timers and lock states in the Add PRED section */
function updateAddPredTimers() {
  const addPredSection = document.getElementById('addpred');
  if (!addPredSection || !addPredSection.classList.contains('active')) return;

  const now = getCurrentPacificDate();
  const matchCards = document.querySelectorAll('#addPredContent .pred-match-card');

  matchCards.forEach(card => {
    const rowIndex = parseInt(card.getAttribute('data-rowindex'), 10);
    const match = MATCHES.find(m => m.rowIndex === rowIndex);
    if (!match) return;

    const lockTime = getMatchLockDeadline(match);
    const isLocked = now > lockTime;
    const remainingMs = lockTime - now;

    // Update timer display
    const timerSpan = card.querySelector('.match-lock-timer');
    if (timerSpan) {
      timerSpan.textContent = isLocked ? '🔒 Locked' : formatCountdown(remainingMs);
      timerSpan.style.color = isLocked ? '#e05252' : '';

      // Add/remove urgent class when remaining time ≤ 2 minutes (120,000 ms)
      if (!isLocked && remainingMs <= 120000) {
        timerSpan.classList.add('urgent');
      } else {
        timerSpan.classList.remove('urgent');
      }
    }

    // Enable/disable inputs and save button
    const inputs = card.querySelectorAll('.score-input');
    const saveBtns = card.querySelectorAll('.save-pred-btn');
    inputs.forEach(inp => inp.disabled = isLocked);
    saveBtns.forEach(btn => btn.disabled = isLocked);
  });
}

let addPredTimerInterval = null;

function startAddPredTimer() {
  if (addPredTimerInterval) clearInterval(addPredTimerInterval);
  addPredTimerInterval = setInterval(() => {
    updateAddPredTimers();
  }, 1000);
}

function stopAddPredTimer() {
  if (addPredTimerInterval) {
    clearInterval(addPredTimerInterval);
    addPredTimerInterval = null;
  }
}

// =============================================================
// BUILD ALL UI (Standings reordered: carousel, leaderboard, overview, all upcoming)
// =============================================================
function buildAllUI() {
  // Standings page sections (order as requested)
  buildTodayCarousel();       // 1. Swipe tile (today's matches, including completed)
  buildLeaderboard();           // 2. Leaderboard
  buildOverviewStats();         // 3. Overview
  buildAllUpcomingGames();      // 4. All upcoming games (full list)

  // Other tabs
  buildStatusTabs();
  buildGroupTabs();
  renderMatchList();
  buildPlayerBtns();
  renderPlayerDetail();
  buildAddPredSection();
}

// ── Standings: Today's Carousel (swipe tile – shows all matches from today) ──
function buildTodayCarousel() {
  // Get all matches that occur today (regardless of completion status)
  const list = MATCHES
    .filter(m => isToday(m.dateTimeRaw))
    .sort((a, b) => parseMatchDateTime(a.dateTimeRaw) - parseMatchDateTime(b.dateTimeRaw));

  const track = document.getElementById('upcomingCarousel');
  if (!list.length) {
    track.innerHTML = '<p class="no-pred" style="padding:16px;">No matches scheduled for today</p>';
    return;
  }

  track.innerHTML = list.map(m => {
    const isCompleted = (m.homeScore !== null && m.awayScore !== null);
    // Show actual score if match is completed
    const scoreHtml = isCompleted
      ? `<span class="score-badge" style="background:var(--gold); color:var(--malachite-dark);">${m.homeScore} – ${m.awayScore}</span>`
      : `<span class="cg-time-badge">${m.dateDisplay.includes(' - ') ? m.dateDisplay.split(' - ')[1] : m.dateDisplay}</span>`;

    return `
    <div class="carousel-card">
      <div class="cc-head">
        <div class="cg-head-title"><i class="ti ti-calendar"></i> ${m.group}</div>
        ${scoreHtml}
      </div>
      <div class="cc-body">
        <div class="cc-matchup-title">${m.matchup}</div>
        <div class="preds-list">
          ${m.preds.map(pr => {
            const col = PLAYERS.find(p => p.name === pr.p)?.color || '#888';
            // Determine points earned (if match completed, otherwise no badge)
            let pointsHtml = '';
            if (isCompleted) {
              // If no prediction made, they get 0 points
              const pts = (pr.h !== null && pr.pts !== null) ? pr.pts : 0;
              pointsHtml = ` ${ptsBadge(pts)}`;
            }
            if (pr.h === null) {
              return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">No prediction${pointsHtml ? ' ' + pointsHtml : ''}</span></div>`;
            } else {
              return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="pred-score">${pr.h}–${pr.a}${pointsHtml}</span></div>`;
            }
          }).join('')}
        </div>
        ${isCompleted ? `<div class="final-tag" style="text-align:center; margin-top:8px; font-size:10px; color:var(--text-tertiary);"><i class="ti ti-check"></i> Final</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Standings: All Upcoming Games (full list) ─────────────────────────────
function buildAllUpcomingGames() {
  const now = getCurrentPacificDate();
  const upcoming = MATCHES
    .filter(m => parseMatchDateTime(m.dateTimeRaw) > now)
    .sort((a, b) => parseMatchDateTime(a.dateTimeRaw) - parseMatchDateTime(b.dateTimeRaw));

  const container = document.getElementById('allUpcomingGamesContainer');
  if (!container) return;

  if (!upcoming.length) {
    container.innerHTML = '<p class="no-pred" style="text-align:center;padding:24px;">No upcoming matches scheduled.</p>';
    return;
  }

  container.innerHTML = upcoming.map(m => {
    const timeOnly = m.dateTimeRaw.includes(' - ') ? m.dateTimeRaw.split(' - ')[1] : m.dateTimeRaw;
    const predsHtml = m.preds.map(pr => {
      const col = PLAYERS.find(p => p.name === pr.p)?.color || '#888';
      if (pr.h === null)
        return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
      return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score" style="margin-left:4px;">${pr.h}–${pr.a}</span></div></div>`;
    }).join('');

    return `<div class="match-card">
      <div class="match-head">
        <div class="match-head-left">
          <span class="grp-pill">${m.group}</span>
          <span class="match-time"><i class="ti ti-clock"></i> ${timeOnly}</span>
        </div>
        <span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span>
      </div>
      <div class="match-body">
        <div class="matchup-name">${m.matchup}</div>
        <div class="preds-list">${predsHtml}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Leaderboard ───────────────────────────────────────────────
function buildLeaderboard() {
  const sorted  = [...PLAYERS].sort((a, b) => b.pts - a.pts);
  const maxPts  = sorted[0]?.pts || 1;
  const labels  = ['1st','2nd','3rd','4th','5th'];
  const colors  = ['var(--gold-dark)','#888780','#a0522d','#888','#888'];

  document.getElementById('leaderboard').innerHTML = sorted.map((p, i) => {
    const w = Math.round((p.pts / maxPts) * 100);
    return `<div class="player-row" onclick="switchToPlayer('${p.name}')">
      <span class="rank-badge" style="color:${colors[i]}">${labels[i]}</span>
      <div class="avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div>
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${p.color}"></div></div>
      </div>
      <div class="pts-col"><div class="pts-big">${p.pts}</div><div class="pts-unit">pts</div></div>
    </div>`;
  }).join('');
}

// ── Overview Stats ────────────────────────────────────────────
function buildOverviewStats() {
  const now       = getCurrentPacificDate();
  const completed = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) <= now);
  const upcoming  = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) > now);
  const sorted    = [...PLAYERS].sort((a, b) => b.pts - a.pts);
  const top       = sorted[0];
  const mostExact = Math.max(0, ...PLAYERS.map(p =>
    completed.reduce((s, m) => s + (m.preds.find(pr => pr.p === p.name)?.pts === 3 ? 1 : 0), 0)
  ));

  document.getElementById('overviewStats').innerHTML = `
    <div class="stat-box"><div class="sv">${completed.length}</div><div class="sl">matches scored</div></div>
    <div class="stat-box"><div class="sv">${upcoming.length}</div><div class="sl">upcoming</div></div>
    <div class="stat-box"><div class="sv" style="color:${top?.color}">${top?.pts || 0}</div><div class="sl">leader pts · ${top?.name || '–'}</div></div>
    <div class="stat-box"><div class="sv">${mostExact}</div><div class="sl">most exact scores</div></div>`;

  document.getElementById('headerSub').innerText =
    `${completed.length} match${completed.length !== 1 ? 'es' : ''} scored · ${upcoming.length} upcoming`;
}

// ── Matches Tab ───────────────────────────────────────────────
function buildStatusTabs() {
  document.getElementById('statusTabs').innerHTML = `
    <button class="pill-btn ${activeStatus === 'upcoming' ? 'active' : ''}" onclick="setMatchStatus('upcoming',this)">
      <i class="ti ti-calendar-time"></i> Upcoming Games</button>
    <button class="pill-btn ${activeStatus === 'previous' ? 'active' : ''}" onclick="setMatchStatus('previous',this)">
      <i class="ti ti-history"></i> Previous Results</button>`;
}

window.setMatchStatus = function(s, btn) {
  activeStatus = s;
  document.querySelectorAll('#statusTabs .pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMatchList();
};

function buildGroupTabs() {
  const groups = ['All', ...new Set(MATCHES.map(m => m.group))];
  document.getElementById('groupTabs').innerHTML = groups.map((g, i) => `
    <button class="pill-btn ${i === 0 ? 'active' : ''}" onclick="filterGroup('${g}',this)">
      ${g === 'All' ? '<i class="ti ti-list"></i> All' : g}
      <span class="pill-count">${g === 'All' ? MATCHES.length : MATCHES.filter(m => m.group === g).length}</span>
    </button>`).join('');
}

window.filterGroup = function(g, btn) {
  activeGroup = g;
  document.querySelectorAll('#groupTabs .pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMatchList();
};

function renderMatchList() {
  const now     = getCurrentPacificDate();
  let filtered  = (activeGroup === 'All') ? MATCHES : MATCHES.filter(m => m.group === activeGroup);
  filtered = filtered.filter(m => {
    const d = parseMatchDateTime(m.dateTimeRaw);
    return activeStatus === 'upcoming' ? d > now : d <= now;
  });

  const el = document.getElementById('matchList');
  if (!filtered.length) {
    el.innerHTML = '<p class="no-pred" style="text-align:center;padding:24px;">No matches in this category</p>';
    return;
  }

  el.innerHTML = filtered.map(m => {
    const isPending = m.homeScore === null;
    const predsHtml = m.preds.map(pr => {
      const col = PLAYERS.find(p => p.name === pr.p)?.color || '#888';
      if (pr.h === null)
        return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
      const cls = isPending ? '' : (pr.pts === 3 ? 'correct' : pr.pts === 1 ? 'partial' : 'wrong');
      return `<div class="pred-row ${cls}"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score" style="margin-left:4px;">${pr.h}–${pr.a}</span></div>${ptsBadge(isPending ? null : pr.pts)}</div>`;
    }).join('');

    return `<div class="match-card">
      <div class="match-head">
        <div class="match-head-left">
          <span class="grp-pill">${m.group}</span>
          <span class="match-time">${m.dateDisplay}</span>
        </div>
        ${isPending ? '<span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span>' : `<span class="score-badge">${m.homeScore} – ${m.awayScore}</span>`}
      </div>
      <div class="match-body">
        <div class="matchup-name">${m.matchup}</div>
        <div class="preds-list">${predsHtml}</div>
      </div></div>`;
  }).join('');
}

// ── Player Tab ────────────────────────────────────────────────
function buildPlayerBtns() {
  document.getElementById('playerBtns').innerHTML = PLAYERS.map(p => `
    <button class="player-btn ${p.name === activePlayer ? 'active' : ''}"
            style="${p.name === activePlayer ? `background:${p.color};border-color:${p.color};color:#fff` : ''}"
            onclick="selectPlayer('${p.name}',this)">
      ${p.initials} ${p.name}
    </button>`).join('');
}

window.selectPlayer = function(name, btn) {
  activePlayer = name;
  document.querySelectorAll('#playerBtns .player-btn').forEach(b => { b.classList.remove('active'); b.style.cssText = ''; });
  const p = PLAYERS.find(x => x.name === name);
  btn.classList.add('active');
  btn.style.background  = p.color;
  btn.style.borderColor = p.color;
  btn.style.color       = '#fff';
  renderPlayerDetail();
};

function renderPlayerDetail() {
  const p = PLAYERS.find(x => x.name === activePlayer);
  if (!p) return;

  const now          = getCurrentPacificDate();
  const done         = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) <= now);
  const myPreds      = done.map(m => ({ m, pr: m.preds.find(pr => pr.p === p.name) }))
                           .filter(x => x.pr && x.pr.pts !== null);
  const exact        = myPreds.filter(x => x.pr.pts === 3).length;
  const correct      = myPreds.filter(x => x.pr.pts === 1).length;
  const wrong        = myPreds.filter(x => x.pr.pts === 0).length;
  const pending      = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) > now && m.preds.find(pr => pr.p === p.name)?.h !== null);
  const accuracy     = myPreds.length ? Math.round(((exact + correct) / myPreds.length) * 100) : 0;
  const sorted       = [...PLAYERS].sort((a, b) => b.pts - a.pts);
  const rankPos      = sorted.findIndex(x => x.name === p.name);
  const rankSuffix   = ['st','nd','rd','th','th'][rankPos];

  const av = document.getElementById('playerAvatar');
  av.style.background = p.bg;
  av.style.color      = p.textc;
  av.innerText        = p.initials;

  document.getElementById('playerName').innerText       = p.name;
  document.getElementById('playerRank').innerText       = `${rankPos + 1}${rankSuffix} place`;
  document.getElementById('playerPtsNum').innerText     = p.pts;
  document.getElementById('playerPtsNum').style.color   = p.color;

  document.getElementById('playerStats').innerHTML = `
    <div class="stat-box"><div class="sv" style="color:var(--green)">${exact}</div><div class="sl">exact scores (+3)</div></div>
    <div class="stat-box"><div class="sv" style="color:var(--gold-dark)">${correct}</div><div class="sl">correct result (+1)</div></div>
    <div class="stat-box"><div class="sv" style="color:#e05252">${wrong}</div><div class="sl">wrong predictions</div></div>
    <div class="stat-box"><div class="sv">${pending.length}</div><div class="sl">predictions pending</div></div>`;

  const accBar = document.getElementById('playerAccuracyBar');
  if (myPreds.length) {
    accBar.style.display = 'flex';
    document.getElementById('playerAccuracyVal').innerText  = `${accuracy}%`;
    document.getElementById('playerAccuracyVal').style.color = p.color;
  } else {
    accBar.style.display = 'none';
  }

  document.getElementById('playerMatchPreds').innerHTML = MATCHES.map(m => {
    const pr        = m.preds.find(x => x.p === p.name);
    const isPending = m.homeScore === null;
    if (!pr || pr.h === null)
      return `<div class="match-pred-row"><div><div class="match-pred-name">${m.matchup}</div><div class="no-pred" style="font-size:12px;margin-top:2px">No prediction</div></div></div>`;
    const cls = isPending ? '' : (pr.pts === 3 ? 'correct' : pr.pts === 1 ? 'partial' : 'wrong');
    return `<div class="match-pred-row ${cls}">
      <div style="flex:1">
        <div class="match-pred-name">${m.matchup}</div>
        <div class="match-pred-score">${pr.h} – ${pr.a}${isPending ? '<span class="upcoming-inline"><i class="ti ti-clock"></i></span>' : ''}</div>
      </div>
      <div class="match-pred-right">
        ${isPending ? '<span class="no-pred">TBD</span>' : ptsBadge(pr.pts)}
        ${!isPending ? `<div class="actual-result">${m.homeScore}–${m.awayScore} actual</div>` : ''}
      </div></div>`;
  }).join('');
}

// =============================================================
// ADD PRED TAB (with timer and grace period)
// =============================================================
function buildAddPredSection() {
  const el = document.getElementById('addPredContent');
  if (!el) return;

  const todayMatches = MATCHES
    .filter(m => isToday(m.dateTimeRaw))
    .sort((a, b) => parseMatchDateTime(a.dateTimeRaw) - parseMatchDateTime(b.dateTimeRaw));

  if (!todayMatches.length) {
    el.innerHTML = `
      <div class="no-games-today">
        <i class="ti ti-calendar-off"></i>
        <p>No games today — check back tomorrow!</p>
      </div>`;
    return;
  }

  const now = getCurrentPacificDate();
  el.innerHTML = todayMatches.map(m => {
    const timeOnly = m.dateTimeRaw.includes(' - ') ? m.dateTimeRaw.split(' - ')[1] : m.dateTimeRaw;
    const lockTime = getMatchLockDeadline(m);
    const isInitiallyLocked = now > lockTime;

    const playerRows = PLAYERS.map(pl => {
      const existing = m.preds.find(pr => pr.p === pl.name);
      const hVal = existing?.h ?? '';
      const aVal = existing?.a ?? '';
      const uid = `pred_${m.id}_${pl.name.replace(/\s+/g, '_')}`;

      return `<div class="pred-player-row">
        <div class="pred-player-avatar" style="background:${pl.bg};color:${pl.textc}">${pl.initials}</div>
        <div class="pred-player-name">${pl.name}</div>
        <div class="score-inputs">
          <input class="score-input" type="number" min="0" max="20"
                 id="${uid}_h" value="${hVal}" placeholder="–"
                 aria-label="${pl.name} home score" ${isInitiallyLocked ? 'disabled' : ''}>
          <span class="score-sep">:</span>
          <input class="score-input" type="number" min="0" max="20"
                 id="${uid}_a" value="${aVal}" placeholder="–"
                 aria-label="${pl.name} away score" ${isInitiallyLocked ? 'disabled' : ''}>
          <button class="save-pred-btn" id="${uid}_btn" ${isInitiallyLocked ? 'disabled' : ''}
                  onclick="handleSavePred(${m.rowIndex},'${pl.name}','${uid}')">
            <i class="ti ti-device-floppy"></i> Save
          </button>
        </div>
        <span class="pred-save-status" id="${uid}_status"></span>
      </div>`;
    }).join('');

    return `<div class="pred-match-card" data-rowindex="${m.rowIndex}">
      <div class="pred-match-head">
        <div class="pred-match-title">${m.matchup}</div>
        <div class="pred-match-meta">${m.group} · ${timeOnly}</div>
        <div class="match-lock-timer">${isInitiallyLocked ? '🔒 Locked' : '⏱️ Loading...'}</div>
      </div>
      <div class="pred-player-section">
        <div class="pred-player-label">Enter / update predictions</div>
        ${playerRows}
      </div>
    </div>`;
  }).join('');

  // Initial timer update
  updateAddPredTimers();
}

window.handleSavePred = async function(matchRowIndex, playerName, uid) {
  const hInput = document.getElementById(`${uid}_h`);
  const aInput = document.getElementById(`${uid}_a`);
  const btn    = document.getElementById(`${uid}_btn`);
  const status = document.getElementById(`${uid}_status`);

  const hRaw = hInput.value.trim();
  const aRaw = aInput.value.trim();

  if (hRaw === '' || aRaw === '') {
    status.className   = 'pred-save-status err';
    status.textContent = 'Fill both scores';
    return;
  }
  const h = parseInt(hRaw, 10);
  const a = parseInt(aRaw, 10);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
    status.className   = 'pred-save-status err';
    status.textContent = 'Invalid scores';
    return;
  }

  btn.disabled  = true;
  btn.className = 'save-pred-btn saving';
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Saving…';
  status.className   = 'pred-save-status';
  status.textContent = '';

  try {
    await savePrediction(matchRowIndex, playerName, h, a);

    // Update local state optimistically
    const match = MATCHES.find(m => m.rowIndex === matchRowIndex);
    if (match) {
      const pred = match.preds.find(pr => pr.p === playerName);
      if (pred) { pred.h = h; pred.a = a; }
    }

    btn.className = 'save-pred-btn saved';
    btn.innerHTML = '<i class="ti ti-check"></i> Saved';
    status.className   = 'pred-save-status ok';
    status.textContent = `${h}:${a} ✓`;

    // Refresh all UI sections
    buildTodayCarousel();
    buildLeaderboard();
    buildOverviewStats();
    buildAllUpcomingGames();
    if (activePlayer) renderPlayerDetail();
    renderMatchList();

    setTimeout(async () => {
      btn.disabled  = false;
      btn.className = 'save-pred-btn';
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
      try {
        const res  = await fetch(SCRIPT_URL);
        const data = await res.json();
        parseSheetData(data);
        buildTodayCarousel();
        buildLeaderboard();
        buildOverviewStats();
        buildAllUpcomingGames();
        buildAddPredSection();
        renderMatchList();
        if (activePlayer) renderPlayerDetail();
      } catch (_) { /* silent refresh */ }
    }, 3000);

  } catch (err) {
    console.error('Save error:', err);
    btn.disabled  = false;
    btn.className = 'save-pred-btn';
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
    status.className   = 'pred-save-status err';
    status.textContent = 'Failed – retry';
  }
};

// =============================================================
// HELPERS
// =============================================================
function ptsBadge(pts) {
  if (pts === null) return '<span class="no-pred">—</span>';
  if (pts === 3)    return '<span class="pts-badge p3">+3</span>';
  if (pts === 1)    return '<span class="pts-badge p1">+1</span>';
  return '<span class="pts-badge p0">0</span>';
}

// =============================================================
// NAVIGATION (with timer control)
// =============================================================
window.showSection = function(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (id === 'matches')   renderMatchList();
  if (id === 'addpred') {
    buildAddPredSection();
    startAddPredTimer();
  } else {
    stopAddPredTimer();
  }
  if (id === 'standings') {
    // Rebuild standings sections in case data changed while away
    buildTodayCarousel();
    buildLeaderboard();
    buildOverviewStats();
    buildAllUpcomingGames();
  }
};

window.switchToPlayer = function(name) {
  activePlayer = name;
  showSection('player', document.querySelectorAll('.nav-btn')[2]);
  buildPlayerBtns();
  renderPlayerDetail();
};

// =============================================================
// BOOT
// =============================================================
loadData();
window.addEventListener('beforeunload', () => {
  stopAddPredTimer();
});