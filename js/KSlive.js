// WC 2026 – Knockout Stage | KSlive.js
// Fully independent prototype script — no shared state, functions, or globals
// with the Group Stage app (wclive.js). Everything is namespaced under `KS`
// so there is zero risk of collision if both scripts ever load on the same page.

(function () {
  'use strict';

  // ─── Static placeholder data (no live data source yet) ───────────────────
  const KS_PLAYERS = [
    { name: 'Amit',      initials: 'AM', pts: 0 },
    { name: 'Barun',     initials: 'BA', pts: 0 },
    { name: 'Prashanna', initials: 'PR', pts: 0 },
    { name: 'Rishav',    initials: 'RI', pts: 0 },
    { name: 'Sweastik',  initials: 'SW', pts: 0 }
  ];

  const KS_ROUNDS = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

  const KS_MATCHES = [
    { id: 1, round: 'Round of 16',   matchup: 'Team A vs Team B', sub: 'Fixture to be confirmed', time: 'TBD' },
    { id: 2, round: 'Round of 16',   matchup: 'Team C vs Team D', sub: 'Fixture to be confirmed', time: 'TBD' },
    { id: 3, round: 'Round of 16',   matchup: 'Team E vs Team F', sub: 'Fixture to be confirmed', time: 'TBD' },
    { id: 4, round: 'Round of 16',   matchup: 'Team G vs Team H', sub: 'Fixture to be confirmed', time: 'TBD' },
    { id: 5, round: 'Quarter-final', matchup: 'Winner M1 vs Winner M2', sub: 'Awaiting Round of 16', time: 'TBD' },
    { id: 6, round: 'Quarter-final', matchup: 'Winner M3 vs Winner M4', sub: 'Awaiting Round of 16', time: 'TBD' },
    { id: 7, round: 'Semi-final',    matchup: 'Winner QF1 vs Winner QF2', sub: 'Awaiting Quarter-finals', time: 'TBD' },
    { id: 8, round: 'Final',         matchup: 'Winner SF1 vs Winner SF2', sub: 'Awaiting Semi-finals', time: 'TBD' }
  ];

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
    if (id === 'ksBracket') { buildLeaderboard(); buildOverviewStats(); }
    if (id === 'ksPlayer') renderPlayerDetail();
    if (id === 'ksPredictions') buildPredictionRows();
  }

  // ─── Bracket / leaderboard / overview (placeholder) ──────────────────────
  function buildLeaderboard() {
    const sorted = [...KS_PLAYERS].sort((a, b) => b.pts - a.pts);
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
    el.innerHTML = `
      <div class="ks-stat-box"><div class="ks-sv">0</div><div class="ks-sl">matches played</div></div>
      <div class="ks-stat-box"><div class="ks-sv">${KS_MATCHES.length}</div><div class="ks-sl">fixtures total</div></div>
      <div class="ks-stat-box"><div class="ks-sv">—</div><div class="ks-sl">leader</div></div>
      <div class="ks-stat-box"><div class="ks-sv">4</div><div class="ks-sl">rounds remaining</div></div>
    `;
  }

  // ─── Matches tab ───────────────────────────────────────────────────────
  function buildRoundTabs() {
    const el = document.getElementById('ksRoundTabs');
    if (!el) return;
    const rounds = ['All', ...KS_ROUNDS];
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
