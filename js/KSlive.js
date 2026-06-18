// WC 2026 – Knockout Stage | KSlive.js
// Fully independent prototype script — no shared state, functions, or globals
// with the Group Stage app (wclive.js). Everything is namespaced under `KS`
// so there is zero risk of collision if both scripts ever load on the same page.

(function () {
  'use strict';

  // ─── Synthetic knockout data ──────────────────────────────────────────────
  // 16 teams, paired into 8 Round of 16 matches, then 4 QF, 2 SF, 1 Final.
  // We use generic team names for now; replace with actual group winners later.
  const TEAMS = [
    'Winner A', 'Runner‑up B', 'Winner C', 'Runner‑up D',
    'Winner E', 'Runner‑up F', 'Winner G', 'Runner‑up H',
    'Winner B', 'Runner‑up A', 'Winner D', 'Runner‑up C',
    'Winner F', 'Runner‑up E', 'Winner H', 'Runner‑up G'
  ];

  // Pair them for Round of 16: (0 vs 1), (2 vs 3), ..., (14 vs 15)
  function buildMatches() {
    const rounds = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
    const matches = [];
    let id = 1;

    // Round of 16 – 8 matches
    for (let i = 0; i < 16; i += 2) {
      matches.push({
        id: id++,
        round: 'Round of 16',
        matchup: `${TEAMS[i]} vs ${TEAMS[i+1]}`,
        sub: 'Knockout fixture',
        time: 'TBD',
        date: '2026-06-30',
        team1: TEAMS[i],
        team2: TEAMS[i+1],
        score1: null,
        score2: null,
        preds: KS_PLAYERS.map(p => ({ p: p.name, pts: null }))
      });
    }

    // Quarter-finals – 4 matches (winners of R16 pairs)
    const qfPairs = [
      [0, 1], [2, 3], [4, 5], [6, 7]
    ];
    qfPairs.forEach((pair, idx) => {
      matches.push({
        id: id++,
        round: 'Quarter-final',
        matchup: `Winner M${pair[0]+1} vs Winner M${pair[1]+1}`,
        sub: 'Awaiting Round of 16',
        time: 'TBD',
        date: '2026-07-05',
        team1: `TBD (M${pair[0]+1})`,
        team2: `TBD (M${pair[1]+1})`,
        score1: null,
        score2: null,
        preds: KS_PLAYERS.map(p => ({ p: p.name, pts: null }))
      });
    });

    // Semi-finals – 2 matches
    const sfPairs = [
      [8, 9], [10, 11]
    ];
    sfPairs.forEach((pair, idx) => {
      matches.push({
        id: id++,
        round: 'Semi-final',
        matchup: `Winner QF${pair[0]-7} vs Winner QF${pair[1]-7}`,
        sub: 'Awaiting Quarter-finals',
        time: 'TBD',
        date: '2026-07-12',
        team1: `TBD (QF${pair[0]-7})`,
        team2: `TBD (QF${pair[1]-7})`,
        score1: null,
        score2: null,
        preds: KS_PLAYERS.map(p => ({ p: p.name, pts: null }))
      });
    });

    // Final – 1 match
    matches.push({
      id: id++,
      round: 'Final',
      matchup: 'Winner SF1 vs Winner SF2',
      sub: 'Awaiting Semi-finals',
      time: 'TBD',
      date: '2026-07-19',
      team1: 'TBD (SF1)',
      team2: 'TBD (SF2)',
      score1: null,
      score2: null,
      preds: KS_PLAYERS.map(p => ({ p: p.name, pts: null }))
    });

    return matches;
  }

  const KS_PLAYERS = [
    { name: 'Amit',      initials: 'AM', pts: 0 },
    { name: 'Barun',     initials: 'BA', pts: 0 },
    { name: 'Prashanna', initials: 'PR', pts: 0 },
    { name: 'Rishav',    initials: 'RI', pts: 0 },
    { name: 'Sweastik',  initials: 'SW', pts: 0 },
    
  ];

  const KS_ROUNDS_LIST = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
  const KS_MATCHES = buildMatches();

  // ─── Round definitions (Leaderboard date-range filtering) ─────────────────
  const KS_LB_ROUNDS = [
    { key: 'all', label: 'All Rounds', start: null,         end: null },
    { key: 'r1',  label: 'Round 1',    start: '2026-06-12', end: '2026-06-17' },
    { key: 'r2',  label: 'Round 2',    start: '2026-06-18', end: '2026-06-23' },
    { key: 'r3',  label: 'Round 3',    start: '2026-06-24', end: '2026-06-24' }
  ];
  let activeLbRound = 'all';

  function ksMatchInRound(match, round) {
    if (!round || round.start === null) return true;
    return match.date >= round.start && match.date <= round.end;
  }

  let activeRound = 'All';
  let activePlayer = KS_PLAYERS[0].name;

  // ─── Navigation ────────────────────────────────────────────────────────
  function showSection(id, btn) {
    document.querySelectorAll('.ks-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    document.querySelectorAll('.ks-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (id === 'ksMatches') renderMatchList();
    if (id === 'ksBracket') { renderBracket(); buildLeaderboard(); buildOverviewStats(); }
    if (id === 'ksPlayer') renderPlayerDetail();
    if (id === 'ksPredictions') buildPredictionRows();
  }

  // ─── Bracket rendering ──────────────────────────────────────────────────────
  function renderBracket() {
    const container = document.querySelector('#ksBracket .ks-bracket-wrap');
    if (!container) return;

    // Group matches by round, preserving order
    const rounds = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
    const grouped = rounds.map(r => ({
      round: r,
      matches: KS_MATCHES.filter(m => m.round === r)
    }));

    let html = '';
    grouped.forEach((group, idx) => {
      const isFinal = group.round === 'Final';
      const labelIcon = isFinal ? '<i class="ti ti-trophy"></i> ' : '';
      html += `<div class="ks-bracket-round">`;
      html += `<div class="ks-round-label">${labelIcon}${group.round}</div>`;
      group.matches.forEach(m => {
        const scoreDisplay = (m.score1 !== null && m.score2 !== null) 
          ? `${m.score1} – ${m.score2}` 
          : '—';
        const cls = isFinal ? 'ks-final' : '';
        html += `<div class="ks-bracket-match ${cls}">`;
        html += `<span>${m.team1} vs ${m.team2}</span>`;
        html += `<span class="ks-bracket-score">${scoreDisplay}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    });

    container.innerHTML = html;
  }

  // ─── Leaderboard ────────────────────────────────────────────────────────────
  function buildRoundFilterBar() {
    const el = document.getElementById('ksRoundFilterBar');
    if (!el) return;
    el.innerHTML = KS_LB_ROUNDS.map(r =>
      `<button class="ks-round-pill-btn ${r.key===activeLbRound?'active':''}" data-round-key="${r.key}">${r.label}</button>`
    ).join('');
    el.querySelectorAll('.ks-round-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLbRound = btn.getAttribute('data-round-key');
        el.querySelectorAll('.ks-round-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        buildLeaderboard();
      });
    });
  }

  function getLeaderboardData() {
    const round = KS_LB_ROUNDS.find(r => r.key === activeLbRound) || KS_LB_ROUNDS[0];
    const roundMatches = KS_MATCHES.filter(m => ksMatchInRound(m, round));
    return KS_PLAYERS.map(p => ({
      ...p,
      pts: roundMatches.reduce((s, m) => s + (m.preds.find(pr => pr.p === p.name)?.pts || 0), 0)
    }));
  }

  function buildLeaderboard() {
    buildRoundFilterBar();
    const data = getLeaderboardData();
    const sorted = [...data].sort((a, b) => b.pts - a.pts);
    const rankLabels = ['1st', '2nd', '3rd', '4th', '5th'];
    const el = document.getElementById('ksLeaderboard');
    if (!el) return;
    el.innerHTML = sorted.map((p, i) => `
      <div class="ks-player-row" onclick="KS.switchToPlayer('${p.name}')">
        <span class="ks-rank-badge">${rankLabels[i] || ''}</span>
        <div class="ks-avatar">${p.initials}</div>
        <div class="ks-player-info">
          <div class="ks-player-name">${p.name}</div>
          <div class="ks-bar-track"><div class="ks-bar-fill" style="width:0%"></div></div>
        </div>
        <div class="ks-pts-col"><div class="ks-pts-big">${p.pts}</div><div class="ks-pts-unit">pts</div></div>
      </div>
    `).join('');
  }

  function buildOverviewStats() {
    const el = document.getElementById('ksOverviewStats');
    if (!el) return;
    const total = KS_MATCHES.length;
    const completed = KS_MATCHES.filter(m => m.score1 !== null && m.score2 !== null).length;
    const top = getLeaderboardData().sort((a,b) => b.pts - a.pts)[0];
    el.innerHTML = `
      <div class="ks-stat-box"><div class="ks-sv">${completed}</div><div class="ks-sl">matches played</div></div>
      <div class="ks-stat-box"><div class="ks-sv">${total}</div><div class="ks-sl">fixtures total</div></div>
      <div class="ks-stat-box"><div class="ks-sv">${top ? top.pts : '—'}</div><div class="ks-sl">leader pts</div></div>
      <div class="ks-stat-box"><div class="ks-sv">4</div><div class="ks-sl">rounds remaining</div></div>
    `;
  }

  // ─── Matches tab ───────────────────────────────────────────────────────
  function buildRoundTabs() {
    const el = document.getElementById('ksRoundTabs');
    if (!el) return;
    const rounds = ['All', ...KS_ROUNDS_LIST];
    el.innerHTML = rounds.map((r, i) => `
      <button class="ks-pill-btn ${r === activeRound ? 'active' : ''}" data-round="${r}">${r}</button>
    `).join('');
    el.querySelectorAll('.ks-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeRound = btn.getAttribute('data-round');
        el.querySelectorAll('.ks-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMatchList();
      });
    });
  }

  function renderMatchList() {
    const container = document.getElementById('ksMatchList');
    if (!container) return;
    const filtered = activeRound === 'All' ? KS_MATCHES : KS_MATCHES.filter(m => m.round === activeRound);

    if (!filtered.length) {
      container.innerHTML = '<p class="ks-no-pred" style="text-align:center;padding:24px;">No fixtures in this round yet</p>';
      return;
    }

    container.innerHTML = filtered.map(m => `
      <div class="ks-match-card">
        <div class="ks-match-head">
          <div class="ks-match-head-left">
            <span class="ks-rnd-pill">${m.round}</span>
            <span class="ks-match-time"><i class="ti ti-clock"></i> ${m.time}</span>
          </div>
          <span class="ks-pending-tag"><i class="ti ti-hourglass-empty"></i> Pending</span>
        </div>
        <div class="ks-match-body">
          <div class="ks-matchup-name">${m.matchup}</div>
          <div class="ks-matchup-sub">${m.sub}</div>
        </div>
      </div>
    `).join('');
  }

  // ─── Predictions tab (placeholder form, non-functional save) ─────────────
  function buildPredictionRows() {
    const el = document.getElementById('ksPlayerRows');
    if (!el) return;
    el.innerHTML = KS_PLAYERS.map(p => `
      <div class="ks-pred-player">
        <div class="ks-pred-player-avatar">${p.initials}</div>
        <div class="ks-pred-player-name">${p.name}</div>
        <div class="ks-score-inputs">
          <input class="ks-score-input" type="number" min="0" max="20" placeholder="–" disabled>
          <span class="ks-score-sep">:</span>
          <input class="ks-score-input" type="number" min="0" max="20" placeholder="–" disabled>
        </div>
      </div>
    `).join('');
  }

  // ─── Player tab ────────────────────────────────────────────────────────
  function buildPlayerBtns() {
    const el = document.getElementById('ksPlayerBtns');
    if (!el) return;
    el.innerHTML = KS_PLAYERS.map(p => `
      <button class="ks-player-btn ${p.name === activePlayer ? 'active' : ''}" data-name="${p.name}">
        ${p.initials} ${p.name}
      </button>
    `).join('');
    el.querySelectorAll('.ks-player-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activePlayer = btn.getAttribute('data-name');
        buildPlayerBtns();
        renderPlayerDetail();
      });
    });
  }

  function renderPlayerDetail() {
    const p = KS_PLAYERS.find(x => x.name === activePlayer) || KS_PLAYERS[0];
    const sorted = [...KS_PLAYERS].sort((a, b) => b.pts - a.pts);
    const rankPos = sorted.findIndex(x => x.name === p.name);
    const rankSuffix = ['st', 'nd', 'rd', 'th', 'th'][rankPos] || 'th';

    const avatarEl = document.getElementById('ksPlayerAvatar');
    if (avatarEl) avatarEl.innerText = p.initials;
    const nameEl = document.getElementById('ksPlayerName');
    if (nameEl) nameEl.innerText = p.name;
    const rankEl = document.getElementById('ksPlayerRank');
    if (rankEl) rankEl.innerText = `${rankPos + 1}${rankSuffix} place · Knockout stage`;
    const ptsEl = document.getElementById('ksPlayerPtsNum');
    if (ptsEl) ptsEl.innerText = p.pts;

    const statsEl = document.getElementById('ksPlayerStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="ks-stat-box"><div class="ks-sv">0</div><div class="ks-sl">exact scores (+3)</div></div>
        <div class="ks-stat-box"><div class="ks-sv">0</div><div class="ks-sl">correct result (+1)</div></div>
        <div class="ks-stat-box"><div class="ks-sv">0</div><div class="ks-sl">wrong predictions</div></div>
        <div class="ks-stat-box"><div class="ks-sv">${KS_MATCHES.length}</div><div class="ks-sl">predictions pending</div></div>
      `;
    }

    const predsEl = document.getElementById('ksPlayerMatchPreds');
    if (predsEl) {
      predsEl.innerHTML = KS_MATCHES.map(m => `
        <div class="ks-match-pred-row">
          <div>
            <div class="ks-match-pred-name">${m.matchup}</div>
            <div class="ks-no-pred" style="margin-top:2px">No prediction yet</div>
          </div>
        </div>
      `).join('');
    }
  }

  function switchToPlayer(name) {
    activePlayer = name;
    showSection('ksPlayer', document.querySelectorAll('.ks-nav-btn')[3]);
    buildPlayerBtns();
    renderPlayerDetail();
  }

  // ─── Init ──────────────────────────────────────────────────────────────
  function init() {
    renderBracket();
    buildLeaderboard();
    buildOverviewStats();
    buildRoundTabs();
    renderMatchList();
    buildPredictionRows();
    buildPlayerBtns();
    renderPlayerDetail();
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose only what's needed for inline onclick handlers, namespaced as `KS`
  window.KS = { showSection, switchToPlayer };
})();