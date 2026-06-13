// fifa_app.js – Main application logic

// Wait for DOM and data to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if data is available
  if (!window.MATCHES || !window.PLAYERS) {
    console.error('Data not loaded. Make sure data.js is loaded before fifa_app.js');
    return;
  }

  // Assign to local constants
  const PLAYERS = window.PLAYERS;
  const MATCHES = window.MATCHES;

  // ---------- Helper: get current Pacific Time ----------
  function getCurrentPacificDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dateObj = {};
    for (const part of parts) {
      if (part.type !== 'literal') dateObj[part.type] = part.value;
    }
    const pacificStr = `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second}`;
    return new Date(pacificStr);
  }

  function parsePacificDate(dateTimeStr) {
    const [date, time] = dateTimeStr.split(' ');
    const [year, month, day] = date.split('-');
    const [hour, minute] = time.split(':');
    // Pacific Daylight Time (UTC-7) for June
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00-07:00`);
  }

  // ---------- Scoring ----------
  function calcPts(homeScore, awayScore, predH, predA) {
    if (homeScore === null || awayScore === null) return null;
    if (predH === null || predA === null) return null;
    if (predH === homeScore && predA === awayScore) return 3;
    const actualResult = Math.sign(homeScore - awayScore);
    const predResult   = Math.sign(predH - predA);
    return actualResult === predResult ? 1 : 0;
  }

  // ---------- Global state ----------
  let activeGroup = 'All';
  let activeStatus = 'upcoming';   // 'upcoming' or 'previous'
  let activePlayer = 'Barun';

  // ---------- Update match scores based on current time ----------
  function updateMatchScores() {
    const now = getCurrentPacificDate();
    MATCHES.forEach(m => {
      const matchDateTime = parsePacificDate(m.dateTimeRaw);
      if (now >= matchDateTime) {
        m.homeScore = m.homeScoreRaw;
        m.awayScore = m.awayScoreRaw;
      } else {
        m.homeScore = null;
        m.awayScore = null;
      }
    });
  }

  function updateAllPoints() {
    MATCHES.forEach(m => {
      m.preds.forEach(pr => {
        pr.pts = calcPts(m.homeScore, m.awayScore, pr.h, pr.a);
      });
    });
    PLAYERS.forEach(p => {
      p.pts = MATCHES.reduce((sum, m) => {
        const pr = m.preds.find(x => x.p === p.name);
        return sum + (pr?.pts ?? 0);
      }, 0);
    });
  }

  // ---------- UI Helpers ----------
  function pColor(name) {
    return PLAYERS.find(p => p.name === name)?.color || '#888';
  }

  function chipClass(pts) {
    if (pts === 3) return 'correct';
    if (pts === 1) return 'partial';
    if (pts === 0) return 'wrong';
    return '';
  }

  function ptsBadge(pts) {
    if (pts === null) return '<span class="no-pred">—</span>';
    if (pts === 3)    return '<span class="pts-badge p3">+3</span>';
    if (pts === 1)    return '<span class="pts-badge p1">+1</span>';
    return '<span class="pts-badge p0">0</span>';
  }

  // ---------- Builders ----------
  function buildUpcomingCarousel() {
    const carouselTrack = document.getElementById('upcoming-carousel');
    if (!carouselTrack) return;
    const now = getCurrentPacificDate();
    const upcomingMatches = MATCHES.filter(m => parsePacificDate(m.dateTimeRaw) > now)
      .sort((a,b) => parsePacificDate(a.dateTimeRaw) - parsePacificDate(b.dateTimeRaw))
      .slice(0,4);
    if (upcomingMatches.length === 0) {
      carouselTrack.innerHTML = '<p class="no-pred" style="padding: 16px;">No upcoming matches scheduled.</p>';
      return;
    }
    carouselTrack.innerHTML = upcomingMatches.map(m => {
      const predsHtml = m.preds.map(pr => {
        const col = pColor(pr.p);
        if (pr.h === null) {
          return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">No prediction</span></div>`;
        }
        return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="pred-score">${pr.h} – ${pr.a}</span></div>`;
      }).join('');
      return `<div class="carousel-card"><div class="cc-head"><div class="cg-head-title"><i class="ti ti-clock"></i><span>${m.group}</span></div><span class="cg-time-badge">${m.date}</span></div><div class="cc-body"><div class="cc-matchup-title">${m.matchup}</div><div class="cg-preds-label">Player Predictions</div><div class="preds-list">${predsHtml}</div></div></div>`;
    }).join('');
  }

  function buildLeaderboard() {
    const sorted = [...PLAYERS].sort((a,b) => b.pts - a.pts);
    const maxPts = sorted[0].pts || 1;
    const rankLabels = ['1st','2nd','3rd','4th','5th'];
    const rankColors = ['#b8860b','#888780','#a0522d','#888','#888'];
    const el = document.getElementById('lb-card');
    el.innerHTML = sorted.map((p,i) => {
      const barW = Math.round((p.pts / maxPts) * 100);
      return `<div class="player-row" onclick="switchToPlayer('${p.name}')" role="button" tabindex="0">
        <span class="rank-badge" style="color:${rankColors[i]}">${rankLabels[i]}</span>
        <div class="avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div>
        <div class="player-info"><div class="player-name">${p.name}</div><div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${p.color}"></div></div></div>
        <div class="pts-col"><div class="pts-big">${p.pts}</div><div class="pts-unit">pts</div></div>
      </div>`;
    }).join('');
  }

  function buildOverallStats() {
    const now = getCurrentPacificDate();
    const completed = MATCHES.filter(m => parsePacificDate(m.dateTimeRaw) <= now && m.homeScore !== null);
    const upcoming = MATCHES.filter(m => parsePacificDate(m.dateTimeRaw) > now);
    const sorted = [...PLAYERS].sort((a,b) => b.pts - a.pts);
    const topPlayer = sorted[0];
    const allExact = PLAYERS.map(p =>
      completed.reduce((s,m) => {
        const pr = m.preds.find(x => x.p === p.name);
        return s + (pr?.pts === 3 ? 1 : 0);
      }, 0)
    );
    const mostExact = Math.max(...allExact);
    const el = document.getElementById('overall-stats');
    el.innerHTML = `<div class="stat-box"><div class="sv">${completed.length}</div><div class="sl">matches scored</div></div>
      <div class="stat-box"><div class="sv">${upcoming.length}</div><div class="sl">upcoming</div></div>
      <div class="stat-box"><div class="sv" style="color:${topPlayer.color}">${topPlayer.pts}</div><div class="sl">leader pts · ${topPlayer.name}</div></div>
      <div class="stat-box"><div class="sv">${mostExact}</div><div class="sl">most exact scores</div></div>`;
    const headerSub = document.querySelector('.header-sub');
    if (headerSub) headerSub.textContent = `${completed.length} match${completed.length !== 1 ? 'es' : ''} scored · ${upcoming.length} upcoming`;
  }

  function buildStatusTabs() {
    const container = document.getElementById('match-status-tabs');
    if (!container) return;
    container.innerHTML = `
      <button class="pill-btn ${activeStatus === 'upcoming' ? 'active' : ''}" onclick="setMatchStatus('upcoming', this)"><i class="ti ti-calendar-time"></i> Upcoming Games</button>
      <button class="pill-btn ${activeStatus === 'previous' ? 'active' : ''}" onclick="setMatchStatus('previous', this)"><i class="ti ti-history"></i> Previous Results</button>
    `;
  }

  function setMatchStatus(status, btn) {
    activeStatus = status;
    document.querySelectorAll('#match-status-tabs .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMatchList();
  }

  function buildGroupTabs() {
    const groups = ['All', ...new Set(MATCHES.map(m => m.group))];
    const el = document.getElementById('group-tabs');
    el.innerHTML = groups.map((g,i) => {
      const count = g === 'All' ? MATCHES.length : MATCHES.filter(m => m.group === g).length;
      return `<button class="pill-btn${i===0 ? ' active' : ''}" onclick="filterGroup('${g}', this)">${g === 'All' ? '<i class="ti ti-list"></i> All' : g}<span class="pill-count">${count}</span></button>`;
    }).join('');
  }

  function filterGroup(g, btn) {
    activeGroup = g;
    document.querySelectorAll('#group-tabs .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMatchList();
  }

  function renderMatchList() {
    const now = getCurrentPacificDate();
    let filtered = activeGroup === 'All' ? MATCHES : MATCHES.filter(m => m.group === activeGroup);
    filtered = filtered.filter(m => {
      const matchDateTime = parsePacificDate(m.dateTimeRaw);
      if (activeStatus === 'upcoming') return matchDateTime > now;
      else return matchDateTime <= now;
    });
    const el = document.getElementById('match-list');
    if (filtered.length === 0) {
      el.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:24px;font-size:13px">No matches in this category.</p>';
      return;
    }
    el.innerHTML = filtered.map(m => {
      const isPending = m.homeScore === null;
      const predsHtml = m.preds.map(pr => {
        const col = pColor(pr.p);
        if (pr.h === null) {
          return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
        }
        const cls = isPending ? '' : chipClass(pr.pts);
        return `<div class="pred-row ${cls}"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score">${pr.h}–${pr.a}</span></div>${ptsBadge(isPending ? null : pr.pts)}</div>`;
      }).join('');
      return `<div class="match-card"><div class="match-head"><div class="match-head-left"><span class="grp-pill">${m.group}</span><span class="match-time">${m.date}</span></div>${isPending ? '<span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span>' : `<span class="score-badge">${m.homeScore} – ${m.awayScore}</span>`}</div><div class="match-body"><div class="matchup-name">${m.matchup}</div><div class="preds-list">${predsHtml}</div></div></div>`;
    }).join('');
  }

  function buildPlayerBtns() {
    const el = document.getElementById('player-btns');
    el.innerHTML = PLAYERS.map(p => `<button class="player-btn${p.name === activePlayer ? ' active' : ''}" style="${p.name === activePlayer ? `background:${p.color};border-color:${p.color};color:#fff` : ''}" onclick="selectPlayer('${p.name}', this)">${p.initials} ${p.name}</button>`).join('');
  }

  function selectPlayer(name, btn) {
    activePlayer = name;
    document.querySelectorAll('#player-btns .player-btn').forEach(b => {
      b.classList.remove('active');
      b.style.background = ''; b.style.borderColor = ''; b.style.color = '';
    });
    const p = PLAYERS.find(x => x.name === name);
    btn.classList.add('active');
    btn.style.background = p.color; btn.style.borderColor = p.color; btn.style.color = '#fff';
    renderPlayerDetail();
  }

  function renderPlayerDetail() {
    const p = PLAYERS.find(x => x.name === activePlayer);
    const now = getCurrentPacificDate();
    const completedMatches = MATCHES.filter(m => parsePacificDate(m.dateTimeRaw) <= now && m.homeScore !== null);
    const myPreds = completedMatches.map(m => ({ match: m, pred: m.preds.find(pr => pr.p === p.name) })).filter(x => x.pred && x.pred.pts !== null);
    const exact = myPreds.filter(x => x.pred.pts === 3).length;
    const correct = myPreds.filter(x => x.pred.pts === 1).length;
    const wrong = myPreds.filter(x => x.pred.pts === 0).length;
    const upcomingWithPred = MATCHES.filter(m => parsePacificDate(m.dateTimeRaw) > now && m.preds.find(pr => pr.p === p.name)?.h !== null);
    const accuracy = myPreds.length ? Math.round(((exact+correct)/myPreds.length)*100) : 0;
    const sorted = [...PLAYERS].sort((a,b) => b.pts - a.pts);
    const rankPos = sorted.findIndex(x => x.name === p.name);
    const rankSuffix = ['st','nd','rd','th','th'][rankPos];
    
    document.getElementById('player-profile-avatar').style.background = p.bg;
    document.getElementById('player-profile-avatar').style.color = p.textc;
    document.getElementById('player-profile-avatar').textContent = p.initials;
    document.getElementById('player-profile-name').textContent = p.name;
    document.getElementById('player-profile-rank').textContent = `${rankPos+1}${rankSuffix} place`;
    document.getElementById('player-profile-pts-num').textContent = p.pts;
    document.getElementById('player-profile-pts-num').style.color = p.color;
    
    document.getElementById('player-stats').innerHTML = `<div class="stat-box"><div class="sv" style="color:#1a6b3a">${exact}</div><div class="sl">exact scores (+3)</div></div>
      <div class="stat-box"><div class="sv" style="color:#b8860b">${correct}</div><div class="sl">correct result (+1)</div></div>
      <div class="stat-box"><div class="sv" style="color:#e05252">${wrong}</div><div class="sl">wrong predictions</div></div>
      <div class="stat-box"><div class="sv">${upcomingWithPred.length}</div><div class="sl">predictions pending</div></div>`;
    
    const accEl = document.getElementById('player-accuracy');
    if (myPreds.length) {
      accEl.style.display = 'flex';
      document.getElementById('player-accuracy-val').textContent = `${accuracy}%`;
      document.getElementById('player-accuracy-val').style.color = p.color;
    } else accEl.style.display = 'none';
    
    const allMatchRows = MATCHES.map(m => {
      const pr = m.preds.find(x => x.p === p.name);
      const isPending = m.homeScore === null;
      if (!pr || pr.h === null) {
        return `<div class="match-pred-row"><div style="min-width:0"><div class="match-pred-name">${m.matchup}</div><div class="no-pred" style="font-size:12px;margin-top:2px">No prediction</div></div></div>`;
      }
      const cls = isPending ? '' : chipClass(pr.pts);
      return `<div class="match-pred-row ${cls}"><div style="min-width:0;flex:1"><div class="match-pred-name">${m.matchup}</div><div class="match-pred-score">${pr.h} – ${pr.a}${isPending ? '<span class="upcoming-inline"><i class="ti ti-clock"></i></span>' : ''}</div></div><div class="match-pred-right">${isPending ? '<span class="no-pred">TBD</span>' : ptsBadge(pr.pts)}${!isPending ? `<div class="actual-result">${m.homeScore}–${m.awayScore} actual</div>` : ''}</div></div>`;
    }).join('');
    document.getElementById('player-match-preds').innerHTML = allMatchRows;
  }

  function showSection(id, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('.main-content').scrollTop = 0;
    if (id === 'section-matches') renderMatchList();
    if (id === 'section-standings') { buildUpcomingCarousel(); buildLeaderboard(); buildOverallStats(); }
  }

  function switchToPlayer(name) {
    activePlayer = name;
    showSection('section-player', document.querySelectorAll('.nav-btn')[2]);
    buildPlayerBtns();
    renderPlayerDetail();
  }

  // Make functions globally accessible for inline onclick handlers
  window.showSection = showSection;
  window.filterGroup = filterGroup;
  window.setMatchStatus = setMatchStatus;
  window.selectPlayer = selectPlayer;
  window.switchToPlayer = switchToPlayer;

  // Initialize
  updateMatchScores();
  updateAllPoints();
  buildStatusTabs();
  buildGroupTabs();
  buildUpcomingCarousel();
  buildLeaderboard();
  buildOverallStats();
  renderMatchList();
  buildPlayerBtns();
  renderPlayerDetail();

  console.log('App initialized successfully');
});