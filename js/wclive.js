// WC 2026 – Live Prediction Game | app.js (updated)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzDixFKGR37tpIZ7QrppJmBVMMnbTOUALuBx_9FOXZZ3fz7fryeQ3S8p5goswlbPDUmXQ/exec';
const PLAYER_COLORS = {
  'Amit':      { color:'#5b6cf6', bg:'#eeedfe', textc:'#3C3489', initials:'AM' },
  'Barun':     { color:'#1a6b3a', bg:'#e8f5ee', textc:'#0f4a27', initials:'BA' },
  'Prashanna': { color:'#d97706', bg:'#faeeda', textc:'#633806', initials:'PR' },
  'Rishav':    { color:'#e05252', bg:'#fcebeb', textc:'#791f1f', initials:'RI' },
  'Sweastik':  { color:'#7c3aed', bg:'#eeedfe', textc:'#26215C', initials:'SW' },
  'Nikita':    { color:'#ff0766ff', bg:'#eeedfe', textc:'#26215C', initials:'NI' },
  'Saugat':    { color:'#ff7f50', bg:'#fff0e6', textc:'#7a3e2b', initials:'SA' },
};

let PLAYERS = [], MATCHES = [];
let activeGroup = 'All', activeStatus = 'upcoming', activePlayer = '';
let _addPredTimer = null;
let _activeDateGroups = [], _currentActiveDateIdx = 0;

// ─── Round definitions ─────────────────────────────────────────────────────────
const ROUNDS = [
  { key: 'all',    label: 'All Rounds', start: null,                  end: null },
  { key: 'r1',     label: 'Round 1',    start: '2026-06-11',          end: '2026-06-17' },
  { key: 'r2',     label: 'Round 2',    start: '2026-06-18',          end: '2026-06-23' },
  { key: 'r3',     label: 'Round 3',    start: '2026-06-24',          end: '2026-06-27' },
  { key: 'ro32',   label: 'Round Of 32',start: '2026-06-28',          end: '2026-07-03' },
  { key: 'ro16',   label: 'Round Of 16',start: '2026-07-04',          end: '2026-07-07' },
  { key: 'qf',     label: 'QUARTER Hai GUYS/GIRL',start: '2026-07-09',       end: '2026-07-11' },
  { key: 'sf',     label: 'SEMI Hai GUYS/GIRL',start: '2026-07-14',          end: '2026-07-15' },
  { key: '3p',     label: '3rd Place Hai GUYS/GIRL',start: '2026-07-18',     end: '2026-07-18' },
  { key: 'final',  label: 'FINALE Hai GUYS/GIRL',start: '2026-07-19',         end: '2026-07-19' },
];
let activeRound = 'ro32';

function matchInRound(match, round) {
  if (!round || round.start === null) return true;
  const dateStr = getMatchDateStr(match.dateTimeRaw);
  return dateStr >= round.start && dateStr <= round.end;
}

const _dtCache = new Map();
function parseMatchDateTime(str) {
  if (!str || typeof str !== 'string') return new Date(0);
  if (_dtCache.has(str)) return _dtCache.get(str);
  try {
    const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const spaced = str
      .replace(/-/g, ' ')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = spaced.split(' ');
    const month = months[parts[0].substring(0,3)];
    const day    = parseInt(parts[1],10);
    const [h, m] = (parts[2]||'0:0').split(':');
    const d = new Date(2026, month, day, parseInt(h,10)||0, parseInt(m,10)||0, 0, 0);
    _dtCache.set(str, d);
    return d;
  } catch(e) {
    const d = new Date(0);
    _dtCache.set(str, d);
    return d;
  }
}

function getMatchDateStr(str) {
  const d = parseMatchDateTime(str);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const _pacificFmt = new Intl.DateTimeFormat('en-US', {
  timeZone:'America/Los_Angeles',
  year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
});

function getCurrentPacificDate() {
  const parts = _pacificFmt.formatToParts(new Date());
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return new Date(`${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`);
}

function getPacificDateStr(date) {
  const parts = _pacificFmt.formatToParts(date);
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}`;
}

function calcPoints(homeScore, awayScore, predH, predA) {
  if (homeScore===null||awayScore===null||predH===null||predA===null) return null;
  if (predH===homeScore && predA===awayScore) return 3;
  return Math.sign(homeScore-awayScore)===Math.sign(predH-predA) ? 1 : 0;
}

async function loadData(silent=false) {
  const loadingMsg = document.getElementById('loadingMsg');
  const appContent = document.getElementById('appContent');
  if (!silent) {
    loadingMsg.style.display = 'block';
    appContent.style.display = 'none';
    loadingMsg.innerHTML = '<div>Loading data from Google Sheets…</div>';
  }
  try {
    const res = await fetch(SCRIPT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data||data.length===0) throw new Error('Sheet returned no data');
    _dtCache.clear();
    parseSheetData(data);
    if (!silent) { loadingMsg.style.display='none'; appContent.style.display='block'; }
    buildAllUI();
  } catch(err) {
    if (!silent) loadingMsg.innerHTML=`<div class="error"><strong>Failed to load data</strong><br>${err.message}</div>`;
  }
}

function parseSheetData(rows) {
  if (!rows||rows.length<3) throw new Error('Not enough rows');
  const headerRow = rows[0]||[];
  const playerIndices = [5,8,11,14,17,20,23];
  const playerNames = playerIndices.map(i=>headerRow[i]?.toString().trim()).filter(Boolean);
  PLAYERS = playerNames.map(name=>({
    name,
    color:    PLAYER_COLORS[name]?.color    || '#888',
    bg:       PLAYER_COLORS[name]?.bg       || '#e0e0e0',
    textc:    PLAYER_COLORS[name]?.textc    || '#333',
    initials: PLAYER_COLORS[name]?.initials || name.slice(0,2).toUpperCase(),
    pts:0
  }));
  if (PLAYERS.length) activePlayer = PLAYERS[0].name;
  MATCHES = [];
  const parse = v=>(v===''||v==null)?null:parseInt(v,10);
  rows.slice(2).forEach((cols,r)=>{
    if (!cols||!cols[0]||cols[0]==='') return;
    const predictions = PLAYERS.map((pl,i)=>{
      const base = 5+i*3;
      const h = parse(cols[base]);
      const a = parse(cols[base+1]);
      return {p:pl.name, h:isNaN(h)?null:h, a:isNaN(a)?null:a, pts:null};
    });
    MATCHES.push({
      id:r+1, rowIndex:r+2, dateTimeRaw:String(cols[0]), dateDisplay:String(cols[0]),
      group:cols[1]||'', matchup:cols[2]||'',
      homeScoreRaw:parse(cols[3]), awayScoreRaw:parse(cols[4]),
      homeScore:null, awayScore:null, preds:predictions
    });
  });
  const now = getCurrentPacificDate();
  MATCHES.forEach(m=>{
    if (now>=parseMatchDateTime(m.dateTimeRaw)) { m.homeScore=m.homeScoreRaw; m.awayScore=m.awayScoreRaw; }
  });
  recalcAllPoints();
}

function recalcAllPoints() {
  MATCHES.forEach(m=>{
    m.preds.forEach(pr=>{
      pr.pts = calcPoints(m.homeScore, m.awayScore, pr.h, pr.a);
    });
  });
  PLAYERS.forEach(p=>{
    p.pts = MATCHES.reduce((s,m)=>s+(m.preds.find(pr=>pr.p===p.name)?.pts||0),0);
  });
}

async function savePrediction(matchRowIndex, playerName, home, away) {
  const payload = JSON.stringify({action:'savePrediction',matchRowIndex,playerName,home,away});
  await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:payload});
}

function getMatchLockDeadline(match) {
  return new Date(parseMatchDateTime(match.dateTimeRaw).getTime()-5*60*1000);
}

function formatCountdown(ms) {
  if (ms<=0) return '🔒 Locked';
  const mins=Math.floor(ms/60000);
  const secs=Math.floor((ms%60000)/1000);
  return `⏱️ ${mins}:${secs.toString().padStart(2,'0')} mins until lock`;
}

function isMatchPredictable(match, now=getCurrentPacificDate()) {
  return now < getMatchLockDeadline(match);
}

function updateAddPredTimers() {
  const addPredSection = document.getElementById('addpred');
  if (!addPredSection||!addPredSection.classList.contains('active')) return;
  const now = getCurrentPacificDate();
  document.querySelectorAll('#addPredContent .pred-match-item').forEach(item=>{
    const rowIndex = parseInt(item.getAttribute('data-rowindex'),10);
    const match = MATCHES.find(m=>m.rowIndex===rowIndex);
    if (!match) return;
    const lockTime = getMatchLockDeadline(match);
    const isLocked = now>lockTime;
    const remainingMs = lockTime-now;
    const timerSpan = item.querySelector('.match-lock-timer');
    if (timerSpan) {
      timerSpan.textContent = isLocked?'🔒 Locked':formatCountdown(remainingMs);
      timerSpan.style.color = isLocked?'#D4AF37':'#D4AF37';
      timerSpan.classList.toggle('urgent', !isLocked&&remainingMs<=120000);
    }
    const isLockedBool = isLocked;
    item.querySelectorAll('.score-input').forEach(inp=>{ inp.disabled=isLockedBool; });
    item.querySelectorAll('.save-pred-btn').forEach(btn=>{ btn.disabled=isLockedBool; });
  });
}

function startAddPredTimer() {
  if (_addPredTimer) clearInterval(_addPredTimer);
  _addPredTimer = setInterval(()=>{
    if (document.getElementById('addpred').classList.contains('active')) updateAddPredTimers();
  },1000);
}
function stopAddPredTimer() {
  if (_addPredTimer) { clearInterval(_addPredTimer); _addPredTimer=null; }
}

// ─── Carousel ──────────────────────────────────────────────────────────────────
function buildTodayCarousel() {
  const now = getCurrentPacificDate();
  const todayStr = getPacificDateStr(now);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  const tomorrowStr = getPacificDateStr(tomorrow);
  const getDateStr = m => getPacificDateStr(parseMatchDateTime(m.dateTimeRaw));

  const todayTomorrow = MATCHES.filter(m=>{ const d=getDateStr(m); return d===todayStr||d===tomorrowStr; });
  const prevResults = MATCHES
    .filter(m=>m.homeScore!==null&&m.awayScore!==null&&getDateStr(m)<todayStr)
    .sort((a,b)=>parseMatchDateTime(b.dateTimeRaw)-parseMatchDateTime(a.dateTimeRaw))
    .slice(0,2);

  const uniqueMap = new Map();
  [...prevResults,...todayTomorrow].forEach(m=>uniqueMap.set(m.id,m));
  const allMatchesSorted = Array.from(uniqueMap.values())
    .sort((a,b)=>parseMatchDateTime(a.dateTimeRaw)-parseMatchDateTime(b.dateTimeRaw));

  const track = document.getElementById('upcomingCarousel');
  if (!allMatchesSorted.length) {
    track.innerHTML='<p class="no-pred" style="padding:16px;text-align:center;">No matches scheduled for today/tomorrow and no previous results.</p>';
    return;
  }

  let currentIdx = -1;
  const oneHourLater = new Date(now.getTime()+60*60*1000);
  const withinHour = allMatchesSorted.filter(m=>{ const s=parseMatchDateTime(m.dateTimeRaw); return s>now&&s<=oneHourLater; });
  if (withinHour.length) {
    const target = withinHour.sort((a,b)=>parseMatchDateTime(a.dateTimeRaw)-parseMatchDateTime(b.dateTimeRaw))[0];
    currentIdx = allMatchesSorted.findIndex(m=>m.id===target.id);
  }
  if (currentIdx===-1) {
    for (let i=allMatchesSorted.length-1;i>=0;i--) {
      if (allMatchesSorted[i].homeScore!==null) { currentIdx=i; break; }
    }
  }
  if (currentIdx===-1) {
    for (let i=0;i<allMatchesSorted.length;i++) {
      if (parseMatchDateTime(allMatchesSorted[i].dateTimeRaw)>now) { currentIdx=i; break; }
    }
  }
  if (currentIdx===-1&&allMatchesSorted.length) currentIdx=0;

  const playerColorMap = Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
  track.innerHTML = allMatchesSorted.map(m=>{
    const matchDate = parseMatchDateTime(m.dateTimeRaw);
    const dateLabel = matchDate.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const timeOnly = m.dateTimeRaw.includes(' - ')?m.dateTimeRaw.split(' - ')[1]:m.dateTimeRaw;
    const isCompleted = m.homeScore!==null&&m.awayScore!==null;
    const scoreDisplay = isCompleted?`${m.homeScore}–${m.awayScore}`:null;
    const predsHtml = m.preds.map(pr=>{
      const col = playerColorMap[pr.p]||'#888';
      if (pr.h===null) return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">No prediction</span></div>`;
      let earnedBadge='';
      if (isCompleted&&pr.pts!==null) {
        const [bg,tc] = pr.pts===3?['var(--malachite-base)','#fff']:pr.pts===1?['var(--gold)','var(--malachite-dark)']:['var(--bg-tertiary)','var(--text-tertiary)'];
        const txt = pr.pts===3?'+3':pr.pts===1?'+1':'0';
        earnedBadge=`<span class="earned-points-badge" style="background:${bg};color:${tc}">${txt}</span>`;
      }
      return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span>${earnedBadge}</div><span class="pred-score">${pr.h}–${pr.a}</span></div>`;
    }).join('');
    return `<div class="carousel-card" data-match-id="${m.id}"><div class="cc-head"><div class="cg-head-title"><i class="ti ti-calendar"></i> ${m.group} · ${dateLabel}</div><span class="cg-time-badge">${timeOnly}</span></div><div class="cc-body"><div class="cc-matchup-title">${m.matchup}</div><div class="preds-list">${predsHtml}</div>${scoreDisplay?`<div class="final-tag"><i class="ti ti-check"></i> Final · ${scoreDisplay}</div>`:''}</div></div>`;
  }).join('');

  if (currentIdx>=0) {
    requestAnimationFrame(()=>{
      const cards=document.querySelectorAll('#upcomingCarousel .carousel-card');
      if (cards[currentIdx]) cards[currentIdx].scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    });
  }
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function buildRoundFilterBar() {
  const el = document.getElementById('roundFilterBar');
  if (!el) return;
  el.innerHTML = ROUNDS.map(r =>
    `<button class="round-pill-btn ${r.key===activeRound?'active':''}" onclick="setRound('${r.key}',this)">${r.label}</button>`
  ).join('');
}

window.setRound = function(key, btn) {
  activeRound = key;
  document.querySelectorAll('#roundFilterBar .round-pill-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  buildLeaderboard();
};

function getLeaderboardData() {
  const round = ROUNDS.find(r => r.key === activeRound) || ROUNDS[0];
  const roundMatches = MATCHES.filter(m => matchInRound(m, round));
  const totalInRound = roundMatches.length;
  const scoredInRound = roundMatches.filter(m => m.homeScore !== null && m.awayScore !== null).length;
  const gamesLeft = totalInRound - scoredInRound;
  return { roundMatches, gamesLeft };
}

function buildLeaderboard() {
  buildRoundFilterBar();
  const { roundMatches, gamesLeft } = getLeaderboardData();
  const data = PLAYERS.map(p => ({
    ...p,
    pts: roundMatches.reduce((s,m)=>s+(m.preds.find(pr=>pr.p===p.name)?.pts||0),0)
  }));
  const sorted=[...data].sort((a,b)=>b.pts-a.pts);
  const maxPts=sorted[0]?.pts||1;
  const labels=['🦏','✏️🧽','👁️','4th','5th','6th'];
  const colors=['var(--gold-dark)','#888780','#a0522d','#888','#888','#888'];
  const el = document.getElementById('leaderboard');
  el.innerHTML = `<div style="padding:10px 18px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:var(--text-secondary)"><span>🏟️ Games in this round: ${roundMatches.length}</span><span>⚽ Remaining: ${gamesLeft}</span></div>` +
    sorted.map((p,i)=>{
      const w=Math.round((p.pts/maxPts)*100);
      const rankLabel = i < 3 ? labels[i] : `${i+1}${['th','st','nd','rd'][(i+1)%10]||'th'}`;
      return `<div class="player-row" onclick="switchToPlayer('${p.name}')"><span class="rank-badge" style="color:${colors[i]}">${rankLabel}</span><div class="avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div><div class="player-info"><div class="player-name">${p.name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${p.color}"></div></div></div><div class="pts-col"><div class="pts-big">${p.pts}</div><div class="pts-unit">pts</div></div></div>`;
    }).join('');
}

// ─── Overview stats ───────────────────────────────────────────────────────────
function buildOverviewStats() {
  const now=getCurrentPacificDate();
  const completed=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)<=now);
  const upcoming=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)>now);
  const sorted=[...PLAYERS].sort((a,b)=>b.pts-a.pts);
  const top=sorted[0];
  const mostExact=Math.max(0,...PLAYERS.map(p=>completed.reduce((s,m)=>s+(m.preds.find(pr=>pr.p===p.name)?.pts===3?1:0),0)));
  document.getElementById('overviewStats').innerHTML=`<div class="stat-box"><div class="sv">${completed.length}</div><div class="sl">matches scored</div></div><div class="stat-box"><div class="sv">${upcoming.length}</div><div class="sl">upcoming</div></div><div class="stat-box"><div class="sv" style="color:${top?.color}">${top?.pts||0}</div><div class="sl">leader pts · ${top?.name||'–'}</div></div><div class="stat-box"><div class="sv">${mostExact}</div><div class="sl">most exact scores</div></div>`;
  document.getElementById('headerSub').textContent=`${completed.length} match${completed.length!==1?'es':''} scored · ${upcoming.length} upcoming`;
}

// ─── All upcoming games ───────────────────────────────────────────────────────
function buildAllUpcomingGames() {
  const now=getCurrentPacificDate();
  const upcoming=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)>now)
    .sort((a,b)=>parseMatchDateTime(a.dateTimeRaw)-parseMatchDateTime(b.dateTimeRaw));
  const container=document.getElementById('allUpcomingGamesContainer');
  if (!upcoming.length) { container.innerHTML='<p class="no-pred" style="text-align:center;padding:24px;">No upcoming matches scheduled.</p>'; return; }
  const pcm=Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
  container.innerHTML=upcoming.map(m=>{
    const timeOnly=m.dateTimeRaw.includes(' - ')?m.dateTimeRaw.split(' - ')[1]:m.dateTimeRaw;
    const predsHtml=m.preds.map(pr=>{
      const col=pcm[pr.p]||'#888';
      if (pr.h===null) return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
      return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score" style="margin-left:4px">${pr.h}–${pr.a}</span></div></div>`;
    }).join('');
    return `<div class="match-card"><div class="match-head"><div class="match-head-left"><span class="grp-pill">${m.group}</span><span class="match-time"><i class="ti ti-clock"></i> ${timeOnly}</span></div><span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span></div><div class="match-body"><div class="matchup-name">${m.matchup}</div><div class="preds-list">${predsHtml}</div></div></div>`;
  }).join('');
}

// ─── Matches tab with collapsible rounds ─────────────────────────────────────
function buildStatusTabs() {
  const tabs = [
    { key:'upcoming', icon:'ti-calendar-time', label:'Upcoming' },
    { key:'previous', icon:'ti-history',       label:'Results'  },
    { key:'all',      icon:'ti-list',           label:'All'      },
  ];
  document.getElementById('statusTabs').innerHTML =
    `<div class="matches-subtab-bar">${tabs.map(t=>`<button class="matches-subtab-btn ${activeStatus===t.key?'active':''}" onclick="setMatchStatus('${t.key}',this)"><i class="ti ${t.icon}"></i> ${t.label}</button>`).join('')}</div>`;
}
window.setMatchStatus=function(s,btn){
  activeStatus=s;
  document.querySelectorAll('#statusTabs .matches-subtab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderRoundDashboard();
};

function ptsBadge(pts) {
  if (pts === null) return '<span class="no-pred">—</span>';
  if (pts === 3) return '<span class="pts-badge p3">+3</span>';
  if (pts === 1) return '<span class="pts-badge p1">+1</span>';
  return '<span class="pts-badge p0">0</span>';
}

function toggleRoundSection(headerEl) {
  const container = headerEl.nextElementSibling;
  if (!container || !container.classList.contains('round-matches-container')) return;
  const isCollapsed = container.classList.toggle('collapsed');
  headerEl.classList.toggle('collapsed', isCollapsed);
  const icon = headerEl.querySelector('.toggle-icon');
  if (icon) {
    icon.textContent = isCollapsed ? '▶' : '▼';
  }
}
window.toggleRoundSection = toggleRoundSection;

function renderRoundDashboard() {
  const now = getCurrentPacificDate();
  let filtered = MATCHES.slice();
  if (activeStatus === 'upcoming') filtered = filtered.filter(m => parseMatchDateTime(m.dateTimeRaw) > now);
  else if (activeStatus === 'previous') filtered = filtered.filter(m => parseMatchDateTime(m.dateTimeRaw) <= now).reverse();

  const definedRounds = ROUNDS.filter(r => r.key !== 'all' && r.start && r.start !== 'YYYY-MM-DD');
  const usedIds = new Set();
  const buckets = [];
  definedRounds.forEach(r => {
    const rMatches = filtered.filter(m => matchInRound(m, r) && !usedIds.has(m.id));
    if (rMatches.length) {
      rMatches.forEach(m => usedIds.add(m.id));
      buckets.push({ label: r.label, matches: rMatches });
    }
  });
  const leftover = filtered.filter(m => !usedIds.has(m.id));
  if (leftover.length) buckets.push({ label: 'Other', matches: leftover });

  const container = document.getElementById('roundDashboard');
  if (!buckets.length) {
    container.innerHTML = '<p class="no-pred" style="text-align:center;padding:24px;">No matches in this category</p>';
    return;
  }

  const pcm = Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
  const buildMatchCard = m => {
    const isPending = m.homeScore === null;
    const predsHtml = m.preds.map(pr => {
      const col = pcm[pr.p] || '#888';
      if (pr.h === null) return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
      const cls = isPending ? '' : (pr.pts === 3 ? 'correct' : pr.pts === 1 ? 'partial' : 'wrong');
      return `<div class="pred-row ${cls}"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score" style="margin-left:4px">${pr.h}–${pr.a}</span></div>${ptsBadge(isPending ? null : pr.pts)}</div>`;
    }).join('');
    return `<div class="match-card"><div class="match-head"><div class="match-head-left"><span class="grp-pill">${m.group}</span><span class="match-time">${m.dateDisplay}</span></div>${isPending?'<span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span>':`<span class="score-badge">${m.homeScore} – ${m.awayScore}</span>`}</div><div class="match-body"><div class="matchup-name">${m.matchup}</div><div class="preds-list">${predsHtml}</div></div></div>`;
  };

  let html = '';
  buckets.forEach(b => {
    const matchesHtml = b.matches.map(buildMatchCard).join('');
    html += `
      <div class="round-section-header" onclick="toggleRoundSection(this)">
        <span>${b.label} <span class="round-count">(${b.matches.length} games)</span></span>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="round-matches-container">
        ${matchesHtml}
      </div>
    `;
  });
  container.innerHTML = html;
}

// ─── Player tab ───────────────────────────────────────────────────────────────
function buildPlayerBtns() {
  document.getElementById('playerBtns').innerHTML=PLAYERS.map(p=>`<button class="player-btn ${p.name===activePlayer?'active':''}" style="${p.name===activePlayer?`background:${p.color};border-color:${p.color};color:#fff`:''}" onclick="selectPlayer('${p.name}',this)">${p.initials} ${p.name}</button>`).join('');
}
window.selectPlayer=function(name,btn){
  activePlayer=name;
  document.querySelectorAll('#playerBtns .player-btn').forEach(b=>{ b.classList.remove('active'); b.style.cssText=''; });
  const p=PLAYERS.find(x=>x.name===name);
  btn.classList.add('active'); btn.style.background=p.color; btn.style.borderColor=p.color; btn.style.color='#fff';
  renderPlayerDetail();
  populatePlayerRoundDropdown();
};

function populatePlayerRoundDropdown() {
  const sel = document.getElementById('playerRoundSelect');
  if (!sel) return;
  const options = ROUNDS.map(r => `<option value="${r.key}">${r.label}</option>`);
  sel.innerHTML = options.join('');
  sel.value = 'all';
}
window.onPlayerRoundChange = function() {
  renderPlayerDetail();
};

function renderPlayerDetail() {
  const p=PLAYERS.find(x=>x.name===activePlayer);
  if (!p) return;
  const now=getCurrentPacificDate();
  const done=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)<=now);
  const myPreds=done.map(m=>({m,pr:m.preds.find(pr=>pr.p===p.name)})).filter(x=>x.pr&&x.pr.pts!==null);
  const exact=myPreds.filter(x=>x.pr.pts===3).length;
  const correct=myPreds.filter(x=>x.pr.pts===1).length;
  const wrong=myPreds.filter(x=>x.pr.pts===0).length;
  const pending=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)>now&&m.preds.find(pr=>pr.p===p.name)?.h!==null);
  const accuracy=myPreds.length?Math.round(((exact+correct)/myPreds.length)*100):0;
  const sorted=[...PLAYERS].sort((a,b)=>b.pts-a.pts);
  const rankPos=sorted.findIndex(x=>x.name===p.name);
  const rankSuffix=['st','nd','rd','th','th','th'][rankPos];
  const av=document.getElementById('playerAvatar');
  av.style.background=p.bg; av.style.color=p.textc; av.textContent=p.initials;
  document.getElementById('playerName').textContent=p.name;
  document.getElementById('playerRank').textContent=`${rankPos+1}${rankSuffix} place`;
  const ptsNum=document.getElementById('playerPtsNum');
  ptsNum.textContent=p.pts; ptsNum.style.color=p.color;
  document.getElementById('playerStats').innerHTML=`<div class="stat-box"><div class="sv" style="color:var(--green)">${exact}</div><div class="sl">exact scores (+3)</div></div><div class="stat-box"><div class="sv" style="color:var(--gold-dark)">${correct}</div><div class="sl">correct result (+1)</div></div><div class="stat-box"><div class="sv" style="color:#e05252">${wrong}</div><div class="sl">wrong predictions</div></div><div class="stat-box"><div class="sv">${pending.length}</div><div class="sl">predictions pending</div></div>`;
  const accBar=document.getElementById('playerAccuracyBar');
  if (myPreds.length) {
    accBar.style.display='flex';
    const av2=document.getElementById('playerAccuracyVal');
    av2.textContent=`${accuracy}%`; av2.style.color=p.color;
  } else accBar.style.display='none';

  const selectedRoundKey = document.getElementById('playerRoundSelect')?.value || 'all';
  const round = ROUNDS.find(r => r.key === selectedRoundKey) || ROUNDS[0];
  const filteredMatches = round.start === null ? MATCHES : MATCHES.filter(m => matchInRound(m, round));

  const kanji = ['一','二','三','四','五','六','七','八','九'];
  const definedRounds = ROUNDS.filter(r => r.key !== 'all' && r.start && r.start !== 'YYYY-MM-DD');
  const usedDbzIds = new Set();
  const dbzBuckets = [];
  definedRounds.forEach((r,ri)=>{
    const rMatches = filteredMatches.filter(m=>matchInRound(m,r) && !usedDbzIds.has(m.id));
    rMatches.forEach(m=>usedDbzIds.add(m.id));
    dbzBuckets.push({round:r, matches:rMatches, kanji:kanji[ri]||'?'});
  });
  const leftover2 = filteredMatches.filter(m=>!usedDbzIds.has(m.id));
  if (leftover2.length) dbzBuckets.push({round:{label:'Other'},matches:leftover2,kanji:'？'});

  const dbzHtml = dbzBuckets.filter(b=>b.matches.length).map(b=>{
    const rExact  = b.matches.filter(m=>{ const pr=m.preds.find(x=>x.p===p.name); return pr?.pts===3; }).length;
    const rPart   = b.matches.filter(m=>{ const pr=m.preds.find(x=>x.p===p.name); return pr?.pts===1; }).length;
    const rWrong  = b.matches.filter(m=>{ const pr=m.preds.find(x=>x.p===p.name); return pr?.pts===0; }).length;
    const rPts    = rExact*3 + rPart;
    const rows = b.matches.map(m=>{
      const pr = m.preds.find(x=>x.p===p.name);
      const isPending = m.homeScore===null;
      if (!pr||pr.h===null){
        return `<div class="dbz-match-row dbz-pending"><div><div class="dbz-match-name">${m.matchup}</div><div class="dbz-match-meta"><span class="dbz-no-pred-pill"><i class="ti ti-minus" style="font-size:10px"></i> No prediction</span></div></div><div class="dbz-right-col dbz-no-pred">—</div></div>`;
      }
      const cls = isPending?'dbz-pending':(pr.pts===3?'dbz-correct':pr.pts===1?'dbz-partial':'dbz-wrong');
      const badge = isPending ? `<span class="no-pred" style="font-size:11px"><i class="ti ti-clock"></i> TBD</span>` : ptsBadge(pr.pts);
      const actual = !isPending ? `<div class="dbz-actual">${m.homeScore}–${m.awayScore} actual</div>` : '';
      return `<div class="dbz-match-row ${cls}"><div style="min-width:0"><div class="dbz-match-name">${m.matchup}</div><div class="dbz-match-meta"><span class="dbz-pred-score" style="color:${p.color}">${pr.h} – ${pr.a}</span>${actual}</div></div><div class="dbz-right-col">${badge}</div></div>`;
    }).join('');
    return `<div class="dbz-round-block">
      <div class="dbz-round-block-header">
        <i class="ti ti-shield-star" style="font-size:14px;color:var(--gold)"></i>
        ${b.round.label}
        <span class="dbz-round-pts-badge">+${rPts} pts</span>
        <span class="dbz-kanji">${b.kanji}</span>
      </div>
      <div class="dbz-round-body">
        <div style="display:flex;gap:12px;padding:7px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border);font-size:11px;font-weight:700">
          <span style="color:var(--malachite-dark)">✓✓ ${rExact} exact</span>
          <span style="color:var(--gold-dark)">✓ ${rPart} result</span>
          <span style="color:#e05252">✗ ${rWrong} wrong</span>
          <span style="margin-left:auto;color:var(--text-tertiary)">${b.matches.length} games</span>
        </div>
        ${rows}
      </div>
    </div>`;
  }).join('');

  document.getElementById('playerMatchPreds').innerHTML =
    `<div class="dbz-preds-wrap">${dbzHtml||'<p class="no-pred" style="text-align:center;padding:20px">No predictions for this round</p>'}</div>`;
}

// ─── Add Predictions section ─────────────────────────────────────────────────
function buildAddPredSection() {
  const now = getCurrentPacificDate();
  const groups = new Map();
  MATCHES.forEach(m => {
    const dt = parseMatchDateTime(m.dateTimeRaw);
    const key = getPacificDateStr(dt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const sortedDates = Array.from(groups.keys()).sort();
  _activeDateGroups = sortedDates.map(dateStr => ({
    dateStr,
    formatted: new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    matches: groups.get(dateStr).sort((a,b) => parseMatchDateTime(a.dateTimeRaw) - parseMatchDateTime(b.dateTimeRaw))
  }));
  let firstUnlockedIdx = _activeDateGroups.findIndex(g => g.matches.some(m => isMatchPredictable(m, now)));
  if (firstUnlockedIdx === -1) firstUnlockedIdx = 0;
  _currentActiveDateIdx = firstUnlockedIdx;
  renderCurrentDateCard();
}

function renderCurrentDateCard() {
  const container = document.getElementById('addPredContent');
  if (!_activeDateGroups.length) {
    container.innerHTML = '<div class="no-games-today"><i class="ti ti-lock"></i><div>No matches scheduled.</div></div>';
    return;
  }
  const dateGroup = _activeDateGroups[_currentActiveDateIdx];
  const totalGroups = _activeDateGroups.length;
  const now = getCurrentPacificDate();
  const unlockableMatches = dateGroup.matches.filter(m => isMatchPredictable(m, now));
  const matchesToShow = unlockableMatches.slice(0, 6);

  if (matchesToShow.length === 0) {
    container.innerHTML = `
      <div class="date-pred-card">
        <div class="date-card-header">
          <button class="date-nav-btn-inline" id="prevDateBtnInline" ${_currentActiveDateIdx === 0 ? 'disabled' : ''}>
            <i class="ti ti-chevron-left"></i> Previous
          </button>
          <span style="font-weight:700">⚽ ${dateGroup.formatted}</span>
          <button class="date-nav-btn-inline" id="nextDateBtnInline" ${_currentActiveDateIdx === totalGroups - 1 ? 'disabled' : ''}>
            Next <i class="ti ti-chevron-right"></i>
          </button>
        </div>
        <div class="no-games-today" style="padding: 20px; text-align: center; color: var(--text-tertiary);">
          <i class="ti ti-lock"></i>
          <div>All matches for this day are locked.</div>
        </div>
      </div>
    `;
    document.getElementById('prevDateBtnInline')?.addEventListener('click', () => {
      if (_currentActiveDateIdx > 0) {
        _currentActiveDateIdx--;
        renderCurrentDateCard();
        updateAddPredTimers();
      }
    });
    document.getElementById('nextDateBtnInline')?.addEventListener('click', () => {
      if (_currentActiveDateIdx < _activeDateGroups.length - 1) {
        _currentActiveDateIdx++;
        renderCurrentDateCard();
        updateAddPredTimers();
      }
    });
    return;
  }

  let matchesHtml = '';
  matchesToShow.forEach(m => {
    const timeOnly = m.dateTimeRaw.includes(' - ') ? m.dateTimeRaw.split(' - ')[1] : m.dateTimeRaw;
    const lockTime = getMatchLockDeadline(m);
    const isLocked = now > lockTime;
    const timerText = isLocked ? '🔒 Locked' : formatCountdown(lockTime - now);

    const playerRows = PLAYERS.map(pl => {
      if (pl.name === 'Saugat') return '';
      const existing = m.preds.find(pr => pr.p === pl.name);
      const hVal = existing?.h ?? '';
      const aVal = existing?.a ?? '';
      const uid = `pred_${m.id}_${pl.name.replace(/\s+/g, '_')}`;
      return `<div class="pred-player-row">
        <div class="pred-player-avatar" style="background:${pl.bg};color:${pl.textc}">${pl.initials}</div>
        <div class="pred-player-name">${pl.name}</div>
        <div class="score-inputs">
          <input class="score-input" type="number" min="0" max="20" id="${uid}_h" value="${hVal}" placeholder="–" ${isLocked ? 'disabled' : ''}>
          <span class="score-sep">:</span>
          <input class="score-input" type="number" min="0" max="20" id="${uid}_a" value="${aVal}" placeholder="–" ${isLocked ? 'disabled' : ''}>
          <button class="save-pred-btn" id="${uid}_btn" onclick="handleSavePred(${m.rowIndex},'${pl.name}','${uid}')" ${isLocked ? 'disabled' : ''}>
            <i class="ti ti-device-floppy"></i> Save
          </button>
        </div>
        <span class="pred-save-status" id="${uid}_status"></span>
      </div>`;
    }).join('');

    matchesHtml += `<div class="pred-match-item" data-rowindex="${m.rowIndex}">
      <div class="match-header">
        <div class="match-title">${m.matchup}</div>
        <div class="match-meta">
          <span>${m.group} · ${timeOnly}</span>
          <span class="match-lock-timer" style="color:${isLocked ? '#e05252' : '#800000'}">${timerText}</span>
        </div>
      </div>
      <div class="pred-player-section">
        <div class="pred-player-label">Enter / update predictions</div>
        ${playerRows}
      </div>
    </div>`;
  });

  let nextHint = '';
  const hasNextUnlockable = _currentActiveDateIdx < totalGroups - 1 &&
    _activeDateGroups[_currentActiveDateIdx + 1].matches.some(m => isMatchPredictable(m, now));
  if (!hasNextUnlockable && _currentActiveDateIdx < totalGroups - 1) {
    const nextGroup = _activeDateGroups[_currentActiveDateIdx + 1];
    nextHint = `<div class="next-day-hint">⏩ No more unlockable matches today. Next available games: <strong>${nextGroup.formatted}</strong></div>`;
  } else if (_currentActiveDateIdx === totalGroups - 1) {
    nextHint = `<div class="next-day-hint">✅ All matches are locked. No more upcoming games.</div>`;
  }

  const prevDisabled = _currentActiveDateIdx === 0 ? 'disabled' : '';
  const nextDisabled = _currentActiveDateIdx === totalGroups - 1 ? 'disabled' : '';

  container.innerHTML = `<div class="date-pred-card">
    <div class="date-card-header">
      <button class="date-nav-btn-inline" id="prevDateBtnInline" ${prevDisabled}>
        <i class="ti ti-chevron-left"></i> Previous
      </button>
      <span style="font-weight:700">⚽ ${dateGroup.formatted}</span>
      <button class="date-nav-btn-inline" id="nextDateBtnInline" ${nextDisabled}>
        Next <i class="ti ti-chevron-right"></i>
      </button>
    </div>
    ${matchesHtml}
    ${nextHint}
  </div>`;

  document.getElementById('prevDateBtnInline')?.addEventListener('click', () => {
    if (_currentActiveDateIdx > 0) {
      _currentActiveDateIdx--;
      renderCurrentDateCard();
      updateAddPredTimers();
    }
  });
  document.getElementById('nextDateBtnInline')?.addEventListener('click', () => {
    if (_currentActiveDateIdx < _activeDateGroups.length - 1) {
      _currentActiveDateIdx++;
      renderCurrentDateCard();
      updateAddPredTimers();
    }
  });
  updateAddPredTimers();
}

// ─── Save prediction ──────────────────────────────────────────────────────────
window.handleSavePred = async function(matchRowIndex, playerName, uid) {
  const hInput = document.getElementById(`${uid}_h`);
  const aInput = document.getElementById(`${uid}_a`);
  const btn = document.getElementById(`${uid}_btn`);
  const statusSpan = document.getElementById(`${uid}_status`);
  if (!hInput || !aInput || !btn) return;

  const hRaw = hInput.value.trim();
  const aRaw = aInput.value.trim();
  if (hRaw === '' || aRaw === '') {
    statusSpan.className = 'pred-save-status err';
    statusSpan.textContent = 'Fill both scores';
    return;
  }
  const h = parseInt(hRaw, 10);
  const a = parseInt(aRaw, 10);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
    statusSpan.className = 'pred-save-status err';
    statusSpan.textContent = 'Invalid scores';
    return;
  }

  btn.disabled = true;
  btn.className = 'save-pred-btn saving';
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Saving…';
  statusSpan.className = 'pred-save-status';
  statusSpan.textContent = '';

  try {
    await savePrediction(matchRowIndex, playerName, h, a);
    const match = MATCHES.find(m => m.rowIndex === matchRowIndex);
    if (match) {
      const pred = match.preds.find(pr => pr.p === playerName);
      if (pred) { pred.h = h; pred.a = a; }
      if (match.homeScore !== null && match.awayScore !== null) {
        pred.pts = calcPoints(match.homeScore, match.awayScore, h, a);
      } else {
        pred.pts = null;
      }
      recalcAllPoints();
    }
    btn.className = 'save-pred-btn saved';
    btn.innerHTML = '<i class="ti ti-check"></i> Saved';
    statusSpan.className = 'pred-save-status ok';
    statusSpan.textContent = `${h}:${a} ✓`;

    buildTodayCarousel();
    buildLeaderboard();
    buildOverviewStats();
    buildAllUpcomingGames();
    renderRoundDashboard();
    if (activePlayer) renderPlayerDetail();
    buildAddPredSection();

    setTimeout(async () => {
      btn.disabled = false;
      btn.className = 'save-pred-btn';
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
      try {
        const res = await fetch(SCRIPT_URL);
        const data = await res.json();
        _dtCache.clear();
        parseSheetData(data);
        buildAllUI();
      } catch (_) {}
    }, 3000);
  } catch (err) {
    btn.disabled = false;
    btn.className = 'save-pred-btn';
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
    statusSpan.className = 'pred-save-status err';
    statusSpan.textContent = 'Failed – retry';
  }
};

// ─── Tournament Stats – Funny Stats & Roast Corner ──────────────────────
function renderTournamentStats() {
  const container = document.getElementById('tournamentSubContent');
  if (!container) return;

  const playersStats = PLAYERS.map(p => {
    const preds = MATCHES.flatMap(m =>
      m.preds.filter(pr => pr.p === p.name && pr.h !== null && pr.a !== null)
    );
    const total = preds.length;
    const exact = preds.filter(pr => pr.pts === 3).length;
    const correct = preds.filter(pr => pr.pts === 1).length;
    const wrong = preds.filter(pr => pr.pts === 0).length;
    const totalPts = p.pts;
    const sumGoals = preds.reduce((s, pr) => s + pr.h + pr.a, 0);
    const avgGoals = total > 0 ? sumGoals / total : 0;
    const outcomeAcc = total > 0 ? (exact + correct) / total : 0;
    return { ...p, total, exact, correct, wrong, totalPts, avgGoals, outcomeAcc };
  });

  const mostPoints = playersStats.reduce((a, b) => a.totalPts > b.totalPts ? a : b);
  const mostExact = playersStats.reduce((a, b) => a.exact > b.exact ? a : b);
  const mostWrong = playersStats.reduce((a, b) => a.wrong > b.wrong ? a : b);
  const highestAcc = playersStats.reduce((a, b) => a.outcomeAcc > b.outcomeAcc ? a : b);
  const highestAvg = playersStats.reduce((a, b) => a.avgGoals > b.avgGoals ? a : b);
  const underdog = playersStats
    .filter(p => p.total >= 10)
    .reduce((a, b) => a.totalPts < b.totalPts ? a : b);

  const movieRefs = {
    gambler: { title: 'The Gambler (2014)', icon: '🎲', quote: 'You gotta risk it for the biscuit.' },
    antman: { title: 'Ant‑Man', icon: '🐜', quote: 'Size doesn’t matter – it’s how you use it.' },
    captain: { title: 'Captain America', icon: '🛡️', quote: 'I can do this all day.' },
    thor: { title: 'Thor: Ragnarok', icon: '⚡', quote: 'He’s a friend from work!' },
  };

  const cards = [
    {
      title: '🎰 The High‑Risk Gambler',
      player: mostPoints,
      movie: movieRefs.gambler,
      description: `Leads with ${mostPoints.totalPts} pts (${mostPoints.exact} exacts) but also the most wrong (${mostPoints.wrong}). He’s the guy who bets on red and black at the same time – and somehow wins big.`,
    },
    {
      title: '🛡️ The Safe & Lucky Duo',
      players: [highestAcc, playersStats.find(p => p.name === 'Sweastik')],
      movie: movieRefs.captain,
      description: `${highestAcc.name} (${Math.round(highestAcc.outcomeAcc * 100)}% accuracy) and ${playersStats.find(p => p.name === 'Sweastik').name} (${playersStats.find(p => p.name === 'Sweastik').totalPts} pts) play it safe – like Cap with his shield. They rarely miss the result, and it’s paying off.`,
    },
    {
      title: '⚡ The Goal‑Happy Presumptuous',
      player: highestAvg,
      movie: movieRefs.thor,
      description: `${highestAvg.name} predicts an average of ${highestAvg.avgGoals.toFixed(1)} goals per match – nearly a full goal more than everyone else. He thinks every game is a superhero showdown. Spoiler: it’s not.`,
    },
  ];

  const roasts = [
    {
      title: 'The "I Believe in Miracles" Award',
      player: mostPoints,
      description: `${mostPoints.name} has ${mostPoints.exact} exact scores – but also ${mostPoints.wrong} wrong ones. He’s the guy who keeps buying lottery tickets because "this time it’s different."`,
    },
    {
      title: 'The "Draw? Never Heard of Her" Trophy',
      player: underdog,
      description: `${underdog.name} has predicted exactly 0 draws – treating a tie like a myth. Even when the match ends 0‑0, he’s already moved on.`,
    },
    {
      title: 'The "Vibe Check" Strategy',
      player: highestAvg,
      description: `${highestAvg.name} throws out PlayStation‑style scores like 6‑0 and 3‑3, yet somehow sits at ${highestAvg.totalPts} pts. Meanwhile, everyone else is sweating over 1‑0.`,
    },
    {
      title: 'The "Captain Safe" Medal',
      player: highestAcc,
      description: `${highestAcc.name} has the highest outcome accuracy (${Math.round(highestAcc.outcomeAcc * 100)}%) – he’s the designated driver of predictions. Never too high, never too low.`,
    },
    {
      title: 'The "I’m With Stupid" Button',
      player: playersStats.find(p => p.name === 'Sweastik'),
      description: `${playersStats.find(p => p.name === 'Sweastik').name} is quietly in 2nd place with ${playersStats.find(p => p.name === 'Sweastik').totalPts} pts – the unsung hero who lets others take the glory while stacking points.`,
    },
  ];

  let html = `
    <div class="tournament-container">
      <div class="tournament-header">
        <span>🍿</span> लिखित हास्यव्यङ्ग्य – चलचित्र संस्करण
        <span style="font-size:14px; font-weight:400; color:var(--text-secondary); margin-left:auto;">भित्री कुरो</span>
      </div>

      <div class="tournament-stats-grid">
        ${cards.map(card => `
          <div class="tournament-stat-card" style="border-left-color: ${card.player?.color || '#888'};">
            <div class="stat-card-header">
              <span class="stat-card-icon">${card.movie.icon}</span>
              <span class="stat-card-title">${card.title}</span>
              <span class="stat-card-movie">${card.movie.title}</span>
            </div>
            <div class="stat-card-player" style="color:${card.player?.color || '#888'}">
              ${card.player?.name || ''} ${card.players ? card.players.map(p => `<span style="color:${p.color}">${p.name}</span>`).join(' & ') : ''}
            </div>
            <div class="stat-card-quote">“${card.movie.quote}”</div>
            <div class="stat-card-body">${card.description}</div>
          </div>
        `).join('')}
      </div>

      <div class="roast-corner-title">
        <span>🗣️</span> ऐना चौतारी
        <span style="font-size:13px; font-weight:400; color:var(--text-tertiary); margin-left:auto;">कसैको खिल्ली उडाको हैन,</span>
      </div>

      ${roasts.map(roast => {
        const p = playersStats.find(p => p.name === roast.player?.name);
        const color = p?.color || '#888';
        const bg = p?.bg || '#f0f0f0';
        const text = p?.textc || '#333';
        const initials = p?.initials || roast.player?.name.slice(0,2).toUpperCase() || '??';
        return `
          <div class="roast-card" style="border-left-color: ${color};">
            <div class="roast-header">
              <span class="roast-avatar" style="background: ${bg}; color: ${text};">${initials}</span>
              <span class="roast-title">${roast.title}</span>
              <span class="roast-player-tag">🎯 ${roast.player?.name || 'Unknown'}</span>
            </div>
            <div class="roast-body">${roast.description}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

// ─── Orchestration ─────────────────────────────────────────────────────────────
function buildAllUI() {
  recalcAllPoints();
  buildTodayCarousel();
  buildLeaderboard();
  buildOverviewStats();
  buildAllUpcomingGames();
  buildStatusTabs();
  renderRoundDashboard();
  buildPlayerBtns();
  populatePlayerRoundDropdown();
  renderPlayerDetail();
  buildAddPredSection();
  // bracket refresh if visible
  const bracketView = document.getElementById('matchBracketView');
  if (bracketView && bracketView.style.display !== 'none') {
    buildRishavBracket();
  }
  // Tournament tab if active
  const tournamentContent = document.getElementById('tournamentSubContent');
  if (tournamentContent && tournamentContent.style.display !== 'none') {
    renderTournamentStats();
  }
}

window.showSection = function(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (id === 'matches') {
    // ensure sub-tab state is preserved
    const activeTab = document.querySelector('.match-sub-tab.active');
    if (activeTab && activeTab.dataset.matchtab === 'rishav') {
      document.getElementById('matchDefaultView').style.display = 'none';
      document.getElementById('matchBracketView').style.display = 'block';
      buildRishavBracket();
    } else {
      document.getElementById('matchDefaultView').style.display = 'block';
      document.getElementById('matchBracketView').style.display = 'none';
      renderRoundDashboard();
    }
  }
  if (id === 'addpred') { buildAddPredSection(); startAddPredTimer(); } else stopAddPredTimer();
  if (id === 'standings') { buildTodayCarousel(); buildLeaderboard(); buildOverviewStats(); buildAllUpcomingGames(); }
  if (id === 'player') {
    populatePlayerRoundDropdown();
    renderPlayerDetail();
    const tournamentContent = document.getElementById('tournamentSubContent');
    if (tournamentContent && tournamentContent.style.display !== 'none') {
      renderTournamentStats();
    }
  }
};

window.switchToPlayer = function(name) {
  activePlayer = name;
  showSection('player', document.querySelectorAll('.nav-btn')[3]);
  buildPlayerBtns();
  renderPlayerDetail();
};

// ─── Match sub‑tab toggle ────────────────────────────────────────────────────
function switchMatchSubTab(tab, btn) {
  const defaultView = document.getElementById('matchDefaultView');
  const bracketView = document.getElementById('matchBracketView');
  const allBtns = document.querySelectorAll('.match-sub-tab');
  allBtns.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (tab === 'default') {
    defaultView.style.display = 'block';
    bracketView.style.display = 'none';
    renderRoundDashboard();
  } else {
    defaultView.style.display = 'none';
    bracketView.style.display = 'block';
    buildRishavBracket();
  }
}

// ─── Rishav's Bracket (teams only, no scores) ──────────────────────────────
function buildRishavBracket() {
  const container = document.getElementById('rishavBracketScroller');
  if (!container) return;

  const knockRounds = ['ro32', 'ro16', 'qf', 'sf', '3p', 'final'];
  const roundLabels = {
    ro32: 'Round of 32',
    ro16: 'Round of 16',
    qf: 'Quarter Final',
    sf: 'Semi Final',
    '3p': '3rd Place',
    final: 'Final'
  };
  const order = ['ro32', 'ro16', 'qf', 'sf', '3p', 'final'];

  const knockMatches = MATCHES.filter(m => {
    const r = getRoundKeyForMatch(m);
    return knockRounds.includes(r);
  });

  if (!knockMatches.length) {
    container.innerHTML = `<div class="bracket-empty"><i class="ti ti-brackets"></i>No knockout matches found.</div>`;
    return;
  }

  const grouped = {};
  order.forEach(k => { grouped[k] = []; });
  knockMatches.forEach(m => {
    const r = getRoundKeyForMatch(m);
    if (grouped[r]) grouped[r].push(m);
  });
  order.forEach(k => {
    grouped[k].sort((a, b) => parseMatchDateTime(a.dateTimeRaw) - parseMatchDateTime(b.dateTimeRaw));
  });

  let html = '';
  order.forEach(roundKey => {
    const matches = grouped[roundKey] || [];
    if (!matches.length) return;
    const label = roundLabels[roundKey] || roundKey;

    let matchesHtml = matches.map(m => {
      const rishav = m.preds.find(p => p.p === 'Rishav');
      const hasWinner = rishav && rishav.h !== null && rishav.a !== null;
      const homeTeam = m.matchup.split(' vs ')[0] || m.matchup;
      const awayTeam = m.matchup.split(' vs ')[1] || '?';
      let winner = null;
      if (hasWinner) {
        if (rishav.h > rishav.a) winner = homeTeam;
        else if (rishav.h < rishav.a) winner = awayTeam;
        else winner = 'Draw (PK)';
      }
      // actual score not shown
      return `<div class="bracket-match">
        <div class="teams">
          <span class="team" title="${homeTeam}">${homeTeam}</span>
          <span class="vs">vs</span>
          <span class="team" title="${awayTeam}">${awayTeam}</span>
        </div>
        ${winner ? `<div class="winner-tag">⬆️ <span class="team-win">${winner}</span> advances</div>` : `<div class="winner-tag tbd">⏳ TBD</div>`}
      </div>`;
    }).join('');

    html += `<div class="bracket-round">
      <div class="bracket-round-header">${label} <span style="font-weight:400;font-size:10px;color:var(--text-tertiary);">${matches.length} matches</span></div>
      <div class="bracket-round-body">${matchesHtml}</div>
    </div>`;

    const idx = order.indexOf(roundKey);
    if (idx < order.length - 1) {
      const nextKey = order[idx + 1];
      if (grouped[nextKey] && grouped[nextKey].length) {
        html += `<div class="bracket-connector"><i class="ti ti-chevron-right"></i></div>`;
      }
    }
  });

  if (!html) {
    container.innerHTML = `<div class="bracket-empty"><i class="ti ti-brackets"></i>No knockout matches found.</div>`;
  } else {
    container.innerHTML = html;
  }
}

// helper: get round key for a match
function getRoundKeyForMatch(match) {
  const label = match.group || '';
  const lower = label.toLowerCase();
  if (lower.includes('round of 32') || lower.includes('round of thirty')) return 'ro32';
  if (lower.includes('round of 16') || lower.includes('round of sixteen')) return 'ro16';
  if (lower.includes('quarter') || lower.includes('quater')) return 'qf';
  if (lower.includes('semi')) return 'sf';
  if (lower.includes('3rd') || lower.includes('third')) return '3p';
  if (lower.includes('finale') || lower.includes('final')) return 'final';
  for (const r of ROUNDS) {
    if (r.key === 'all') continue;
    if (matchInRound(match, r)) return r.key;
  }
  return 'other';
}

// expose to global
window.switchMatchSubTab = switchMatchSubTab;
window.buildRishavBracket = buildRishavBracket;
window.getRoundKeyForMatch = getRoundKeyForMatch;

// ─── Initialize ──────────────────────────────────────────────────────────────
loadData();
window.addEventListener('beforeunload', () => { stopAddPredTimer(); });