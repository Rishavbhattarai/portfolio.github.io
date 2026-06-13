// ─── SCORING RULES ───────────────────────────────────────────────────────────
// +3  exact score (home and away both correct)
// +1  correct result (win/draw/loss direction correct, but not exact score)
//  0  wrong result
// pts are computed dynamically from homeScore/awayScore — never hardcoded

function calcPts(homeScore, awayScore, predH, predA) {
  if (homeScore === null || awayScore === null) return null; // match not played
  if (predH === null || predA === null) return null;         // no prediction made
  if (predH === homeScore && predA === awayScore) return 3;  // exact score
  const actualResult = Math.sign(homeScore - awayScore);
  const predResult   = Math.sign(predH - predA);
  return actualResult === predResult ? 1 : 0;               // correct direction
}

// ─── PLAYERS ─────────────────────────────────────────────────────────────────
const PLAYERS = [
  { name: 'Amit',      color: '#5b6cf6', bg: '#eeedfe', textc: '#3C3489', initials: 'AM' },
  { name: 'Barun',     color: '#1a6b3a', bg: '#e8f5ee', textc: '#0f4a27', initials: 'BA' },
  { name: 'Prashanna', color: '#d97706', bg: '#faeeda', textc: '#633806', initials: 'PR' },
  { name: 'Rishav',    color: '#e05252', bg: '#fcebeb', textc: '#791f1f', initials: 'RI' },
  { name: 'Sweastik',  color: '#7c3aed', bg: '#eeedfe', textc: '#26215C', initials: 'SW' },
];

// ─── MATCHES ─────────────────────────────────────────────────────────────────
// To update: set homeScore and awayScore once the result is known.
// Points for every player are calculated automatically — do NOT edit pts fields.

const MATCHES = [
  {
    date: 'June 11 · 12:00', group: 'Group A', matchup: 'Mexico vs. South Africa',
    home: 'Mexico', away: 'South Africa', homeScore: 2, awayScore: 0,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: 2,    a: 0    },
      { p: 'Prashanna', h: 3,    a: 0    },
      { p: 'Rishav',    h: 1,    a: 2    },
      { p: 'Sweastik',  h: 2,    a: 1    },
    ]
  },
  {
    date: 'June 11 · 19:00', group: 'Group A', matchup: 'South Korea vs. Czechia',
    home: 'South Korea', away: 'Czechia', homeScore: 2, awayScore: 1,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: 2,    a: 1    },
      { p: 'Prashanna', h: 2,    a: 0    },
      { p: 'Rishav',    h: 1,    a: 0    },
      { p: 'Sweastik',  h: 2,    a: 0    },
    ]
  },
  {
    date: 'June 12 · 15:00', group: 'Group B', matchup: 'Canada vs. Bosnia and Herzegovina',
    home: 'Canada', away: 'Bosnia', homeScore: 1, awayScore: 1,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: 2,    a: 0    },
      { p: 'Prashanna', h: 1,    a: 2    },
      { p: 'Rishav',    h: 2,    a: 0    },
      { p: 'Sweastik',  h: 2,    a: 1    },
    ]
  },
  {
    date: 'June 12 · 18:00', group: 'Group E', matchup: 'Germany vs. Curaçao',
    home: 'Germany', away: 'Curaçao', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: 5,    a: 0    },
      { p: 'Barun',     h: 4,    a: 0    },
      { p: 'Prashanna', h: 4,    a: 0    },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: 3,    a: 0    },
    ]
  },
  {
    date: 'June 12 · 21:00', group: 'Group D', matchup: 'United States vs. Paraguay',
    home: 'USA', away: 'Paraguay', homeScore: 4, awayScore: 1,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: 3,    a: 1    },
      { p: 'Prashanna', h: 2,    a: 1    },
      { p: 'Rishav',    h: 3,    a: 1    },
      { p: 'Sweastik',  h: 2,    a: 0    },
    ]
  },
  {
    date: 'June 13 · 12:00', group: 'Group C', matchup: 'Brazil vs. Morocco',
    home: 'Brazil', away: 'Morocco', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: 2,    a: 1    },
      { p: 'Barun',     h: 3,    a: 1    },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: 3,    a: 1    },
    ]
  },
  {
    date: 'June 13 · 15:00', group: 'Group F', matchup: 'Netherlands vs. Japan',
    home: 'Netherlands', away: 'Japan', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: 2,    a: 0    },
      { p: 'Barun',     h: 3,    a: 2    },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: 3,    a: 1    },
    ]
  },
  {
    date: 'June 13 · 21:00', group: 'Group D', matchup: 'Australia vs. Türkiye',
    home: 'Australia', away: 'Türkiye', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: 0,    a: 2    },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: 2,    a: 0    },
    ]
  },
  {
    date: 'June 14 · 12:00', group: 'Group G', matchup: 'Belgium vs. Egypt',
    home: 'Belgium', away: 'Egypt', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: 2,    a: 1    },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 14 · 15:00', group: 'Group H', matchup: 'Spain vs. Uruguay',
    home: 'Spain', away: 'Uruguay', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 14 · 18:00', group: 'Group B', matchup: 'Qatar vs. Switzerland',
    home: 'Qatar', away: 'Switzerland', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 14 · 21:00', group: 'Group E', matchup: "Côte d'Ivoire vs. Ecuador",
    home: "Côte d'Ivoire", away: 'Ecuador', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 15 · 12:00', group: 'Group I', matchup: 'France vs. Senegal',
    home: 'France', away: 'Senegal', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 15 · 15:00', group: 'Group J', matchup: 'Argentina vs. Algeria',
    home: 'Argentina', away: 'Algeria', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: 0,    a: 5    },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 15 · 18:00', group: 'Group C', matchup: 'Haiti vs. Scotland',
    home: 'Haiti', away: 'Scotland', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 15 · 21:00', group: 'Group F', matchup: 'Sweden vs. Tunisia',
    home: 'Sweden', away: 'Tunisia', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 16 · 12:00', group: 'Group K', matchup: 'Portugal vs. Colombia',
    home: 'Portugal', away: 'Colombia', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 16 · 15:00', group: 'Group L', matchup: 'England vs. Croatia',
    home: 'England', away: 'Croatia', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 16 · 18:00', group: 'Group G', matchup: 'Iran vs. New Zealand',
    home: 'Iran', away: 'New Zealand', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 16 · 21:00', group: 'Group H', matchup: 'Saudi Arabia vs. Cabo Verde',
    home: 'Saudi Arabia', away: 'Cabo Verde', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 17 · 12:00', group: 'Group I', matchup: 'Norway vs. Iraq',
    home: 'Norway', away: 'Iraq', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 17 · 15:00', group: 'Group J', matchup: 'Austria vs. Jordan',
    home: 'Austria', away: 'Jordan', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 17 · 18:00', group: 'Group K', matchup: 'Uzbekistan vs. Congo DR',
    home: 'Uzbekistan', away: 'Congo DR', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
  {
    date: 'June 17 · 21:00', group: 'Group L', matchup: 'Ghana vs. Panama',
    home: 'Ghana', away: 'Panama', homeScore: null, awayScore: null,
    preds: [
      { p: 'Amit',      h: null, a: null },
      { p: 'Barun',     h: null, a: null },
      { p: 'Prashanna', h: null, a: null },
      { p: 'Rishav',    h: null, a: null },
      { p: 'Sweastik',  h: null, a: null },
    ]
  },
];

// ─── DERIVED DATA (computed, never hardcoded) ─────────────────────────────────

// Inject calculated pts into every pred row
MATCHES.forEach(m => {
  m.preds.forEach(pr => {
    pr.pts = calcPts(m.homeScore, m.awayScore, pr.h, pr.a);
  });
});

// Compute each player's total points from match data
PLAYERS.forEach(p => {
  p.pts = MATCHES.reduce((sum, m) => {
    const pr = m.preds.find(x => x.p === p.name);
    return sum + (pr?.pts ?? 0);
  }, 0);
});

// Auto-detect the next unplayed match as the "current" game
const CURRENT_MATCH_INDEX = (() => {
  const idx = MATCHES.findIndex(m => m.homeScore === null);
  return idx === -1 ? MATCHES.length - 1 : idx;
})();

const sorted      = [...PLAYERS].sort((a, b) => b.pts - a.pts);
const rankLabels  = ['1st', '2nd', '3rd', '4th', '5th'];
const rankColors  = ['#b8860b', '#888780', '#a0522d', '#888', '#888'];
const maxPts      = sorted[0].pts || 1;

let activeGroup  = 'All';
let activePlayer = 'Barun';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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

// ─── BUILDERS ────────────────────────────────────────────────────────────────

function buildCurrentGame() {
  const m = MATCHES[CURRENT_MATCH_INDEX];
  document.getElementById('cg-matchup').textContent = m.matchup;
  document.getElementById('cg-date').textContent    = m.date;
  document.getElementById('cg-home-name').textContent  = m.home;
  document.getElementById('cg-away-name').textContent  = m.away;
  document.getElementById('cg-home-score').textContent = m.homeScore !== null ? m.homeScore : '—';
  document.getElementById('cg-away-score').textContent = m.awayScore !== null ? m.awayScore : '—';

  const el = document.getElementById('cg-preds');
  el.innerHTML = m.preds.map(pr => {
    const col = pColor(pr.p);
    if (pr.h === null) {
      return `<div class="pred-row">
        <div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div>
        <span class="no-pred">No prediction</span>
      </div>`;
    }
    return `<div class="pred-row">
      <div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div>
      <span class="pred-score">${pr.h} – ${pr.a}</span>
    </div>`;
  }).join('');
}

function buildLeaderboard() {
  const el = document.getElementById('lb-card');
  el.innerHTML = sorted.map((p, i) => {
    const barW = Math.round((p.pts / maxPts) * 100);
    return `<div class="player-row" onclick="switchToPlayer('${p.name}')" role="button" tabindex="0" aria-label="View ${p.name}'s predictions">
      <span class="rank-badge" style="color:${rankColors[i]}">${rankLabels[i]}</span>
      <div class="avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div>
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${p.color}"></div></div>
      </div>
      <div class="pts-col">
        <div class="pts-big">${p.pts}</div>
        <div class="pts-unit">pts</div>
      </div>
    </div>`;
  }).join('');
}

function buildOverallStats() {
  const completed   = MATCHES.filter(m => m.homeScore !== null);
  const el          = document.getElementById('overall-stats');
  const topPlayer   = sorted[0];
  const allExact    = PLAYERS.map(p =>
    completed.reduce((s, m) => {
      const pr = m.preds.find(x => x.p === p.name);
      return s + (pr?.pts === 3 ? 1 : 0);
    }, 0)
  );
  const mostExact   = Math.max(...allExact);
  const scored      = completed.length;
  const upcoming    = MATCHES.length - scored;

  // Also update the header subtitle dynamically
  const headerSub = document.querySelector('.header-sub');
  if (headerSub) headerSub.textContent = `${scored} match${scored !== 1 ? 'es' : ''} scored · ${upcoming} upcoming`;

  el.innerHTML = `
    <div class="stat-box"><div class="sv">${scored}</div><div class="sl">matches scored</div></div>
    <div class="stat-box"><div class="sv">${upcoming}</div><div class="sl">upcoming</div></div>
    <div class="stat-box"><div class="sv" style="color:${topPlayer.color}">${topPlayer.pts}</div><div class="sl">leader pts · ${topPlayer.name}</div></div>
    <div class="stat-box"><div class="sv">${mostExact}</div><div class="sl">most exact scores</div></div>
  `;
}

function buildGroupTabs() {
  const groups  = ['All', ...new Set(MATCHES.map(m => m.group))];
  const el      = document.getElementById('group-tabs');
  el.innerHTML  = groups.map((g, i) => {
    const count = g === 'All' ? MATCHES.length : MATCHES.filter(m => m.group === g).length;
    return `<button class="pill-btn${i === 0 ? ' active' : ''}" onclick="filterGroup('${g}', this)">
      ${g === 'All' ? '<i class="ti ti-list" aria-hidden="true"></i> All' : g}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');
}

function filterGroup(g, btn) {
  activeGroup = g;
  document.querySelectorAll('#group-tabs .pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMatchList();
}

function renderMatchList() {
  const filtered = activeGroup === 'All' ? MATCHES : MATCHES.filter(m => m.group === activeGroup);
  const el       = document.getElementById('match-list');

  if (filtered.length === 0) {
    el.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:24px;font-size:13px">No matches in this group yet.</p>';
    return;
  }

  el.innerHTML = filtered.map(m => {
    const isPending = m.homeScore === null;
    const predsHtml = m.preds.map(pr => {
      const col = pColor(pr.p);
      if (pr.h === null) {
        return `<div class="pred-row">
          <div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div>
          <span class="no-pred">—</span>
        </div>`;
      }
      const cls = isPending ? '' : chipClass(pr.pts);
      return `<div class="pred-row ${cls}">
        <div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score">${pr.h}–${pr.a}</span></div>
        ${ptsBadge(isPending ? null : pr.pts)}
      </div>`;
    }).join('');

    return `<div class="match-card">
      <div class="match-head">
        <div class="match-head-left">
          <span class="grp-pill">${m.group}</span>
          <span class="match-time">${m.date}</span>
        </div>
        ${isPending
          ? `<span class="pending-tag"><i class="ti ti-clock" aria-hidden="true" style="font-size:12px"></i> Upcoming</span>`
          : `<span class="score-badge">${m.homeScore} – ${m.awayScore}</span>`
        }
      </div>
      <div class="match-body">
        <div class="matchup-name">${m.matchup}</div>
        <div class="preds-list">${predsHtml}</div>
      </div>
    </div>`;
  }).join('');
}

function buildPlayerBtns() {
  const el      = document.getElementById('player-btns');
  el.innerHTML  = PLAYERS.map(p =>
    `<button
      class="player-btn${p.name === activePlayer ? ' active' : ''}"
      style="${p.name === activePlayer ? `background:${p.color};border-color:${p.color};color:#fff` : ''}"
      onclick="selectPlayer('${p.name}', this)"
    >${p.initials} ${p.name}</button>`
  ).join('');
}

function selectPlayer(name, btn) {
  activePlayer = name;
  document.querySelectorAll('#player-btns .player-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background  = '';
    b.style.borderColor = '';
    b.style.color       = '';
  });
  const p        = PLAYERS.find(x => x.name === name);
  btn.classList.add('active');
  btn.style.background  = p.color;
  btn.style.borderColor = p.color;
  btn.style.color       = '#fff';
  renderPlayerDetail();
}

function renderPlayerDetail() {
  const p         = PLAYERS.find(x => x.name === activePlayer);
  const completed = MATCHES.filter(m => m.homeScore !== null);
  const myPreds   = completed
    .map(m => ({ match: m, pred: m.preds.find(pr => pr.p === p.name) }))
    .filter(x => x.pred && x.pred.pts !== null);

  const exact    = myPreds.filter(x => x.pred.pts === 3).length;
  const correct  = myPreds.filter(x => x.pred.pts === 1).length;
  const wrong    = myPreds.filter(x => x.pred.pts === 0).length;
  const upcoming = MATCHES.filter(m => m.homeScore === null && m.preds.find(pr => pr.p === p.name)?.h !== null);
  const accuracy = myPreds.length ? Math.round(((exact + correct) / myPreds.length) * 100) : 0;
  const rankPos  = sorted.findIndex(x => x.name === p.name);
  const rankSuffix = ['st', 'nd', 'rd', 'th', 'th'][rankPos];

  document.getElementById('player-profile-avatar').style.background = p.bg;
  document.getElementById('player-profile-avatar').style.color      = p.textc;
  document.getElementById('player-profile-avatar').textContent      = p.initials;
  document.getElementById('player-profile-name').textContent        = p.name;
  document.getElementById('player-profile-rank').textContent        = `${rankPos + 1}${rankSuffix} place`;
  document.getElementById('player-profile-pts-num').textContent     = p.pts;
  document.getElementById('player-profile-pts-num').style.color     = p.color;

  document.getElementById('player-stats').innerHTML = `
    <div class="stat-box"><div class="sv" style="color:#1a6b3a">${exact}</div><div class="sl">exact scores (+3)</div></div>
    <div class="stat-box"><div class="sv" style="color:#b8860b">${correct}</div><div class="sl">correct result (+1)</div></div>
    <div class="stat-box"><div class="sv" style="color:#e05252">${wrong}</div><div class="sl">wrong predictions</div></div>
    <div class="stat-box"><div class="sv">${upcoming.length}</div><div class="sl">predictions pending</div></div>
  `;

  const accEl = document.getElementById('player-accuracy');
  if (myPreds.length) {
    accEl.style.display = 'flex';
    document.getElementById('player-accuracy-val').textContent = `${accuracy}%`;
    document.getElementById('player-accuracy-val').style.color = p.color;
  } else {
    accEl.style.display = 'none';
  }

  const allMatchRows = MATCHES.map(m => {
    const pr        = m.preds.find(x => x.p === p.name);
    const isPending = m.homeScore === null;
    if (!pr || pr.h === null) {
      return `<div class="match-pred-row">
        <div style="min-width:0">
          <div class="match-pred-name">${m.matchup}</div>
          <div class="no-pred" style="font-size:12px;margin-top:2px">No prediction</div>
        </div>
      </div>`;
    }
    const cls = isPending ? '' : chipClass(pr.pts);
    return `<div class="match-pred-row ${cls}">
      <div style="min-width:0;flex:1">
        <div class="match-pred-name">${m.matchup}</div>
        <div class="match-pred-score">${pr.h} – ${pr.a}
          ${isPending ? '<span class="upcoming-inline"><i class="ti ti-clock" style="font-size:10px"></i></span>' : ''}
        </div>
      </div>
      <div class="match-pred-right">
        ${isPending ? '<span class="no-pred">TBD</span>' : ptsBadge(pr.pts)}
        ${!isPending ? `<div class="actual-result">${m.homeScore}–${m.awayScore} actual</div>` : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('player-match-preds').innerHTML = allMatchRows;
}

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelector('.main-content').scrollTop = 0;
}

function switchToPlayer(name) {
  activePlayer = name;
  const playerNavBtn = document.querySelectorAll('.nav-btn')[2];
  showSection('section-player', playerNavBtn);
  buildPlayerBtns();
  renderPlayerDetail();
}

document.addEventListener('DOMContentLoaded', () => {
  buildCurrentGame();
  buildLeaderboard();
  buildOverallStats();
  buildGroupTabs();
  renderMatchList();
  buildPlayerBtns();
  renderPlayerDetail();
});
