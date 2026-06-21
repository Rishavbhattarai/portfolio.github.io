// WC 2026 – Live Prediction Game | app.js (optimised)
// Fixed: leaderboard now always sums points from all matches,
// and after saving predictions the leaderboard updates instantly.
// Timezone: Pacific Time, with robust date parsing.

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxmmM8NImlEsIkIGFwekk_rRgSLL4oeRhlBxFcPMejOrpiXa6hwhxOQ6HMf0R2-8FEXgA/exec';

const PLAYER_COLORS = {
  'Amit':      { color:'#5b6cf6', bg:'#eeedfe', textc:'#3C3489', initials:'AM' },
  'Barun':     { color:'#1a6b3a', bg:'#e8f5ee', textc:'#0f4a27', initials:'BA' },
  'Prashanna': { color:'#d97706', bg:'#faeeda', textc:'#633806', initials:'PR' },
  'Rishav':    { color:'#e05252', bg:'#fcebeb', textc:'#791f1f', initials:'RI' },
  'Sweastik':  { color:'#7c3aed', bg:'#eeedfe', textc:'#26215C', initials:'SW' },
  'Nikita':  { color:'#ff0766ff', bg:'#eeedfe', textc:'#26215C', initials:'NI' },

};

let PLAYERS = [], MATCHES = [];
let activeGroup = 'All', activeStatus = 'upcoming', activePlayer = '';
let _addPredTimer = null;
let _activeDateGroups = [], _currentActiveDateIdx = 0;

// ─── Round definitions (Leaderboard date-range filtering) ─────────────────────
// Dates are inclusive, parsed as Pacific-time calendar days in 2026.
// CRITICAL: only the first three rounds are wired up for now. RoundOf32,
// RoundOf16, QuarterFinals, SemiFinals, Finals will be appended later using
// the exact same {key,label,start,end} shape — just add more entries to
// this array and everything else (buttons, filtering) keeps working.
const ROUNDS = [
  { key: 'all',    label: 'All Rounds', start: null,                  end: null },
  { key: 'r1',     label: 'Round 1',    start: '2026-06-11',          end: '2026-06-17' },
  { key: 'r2',     label: 'Round 2',    start: '2026-06-18',          end: '2026-06-23' },
  { key: 'r3',     label: 'Round 3',    start: '2026-06-24',          end: '2026-06-24' },
  { key:'ro32', label:'Round Of 32', start:'YYYY-MM-DD', end:'YYYY-MM-DD' },
  // { key:'ro16', label:'Round Of 16', start:'YYYY-MM-DD', end:'YYYY-MM-DD' },
  // { key:'qf',   label:'Quarter-finals', start:'YYYY-MM-DD', end:'YYYY-MM-DD' },
  // { key:'sf',   label:'Semi-finals', start:'YYYY-MM-DD', end:'YYYY-MM-DD' },
  // { key:'f',    label:'Final', start:'YYYY-MM-DD', end:'YYYY-MM-DD' }
];
let activeRound = 'r2';

// Returns true if a match's date falls inside the given round's date range.
// `round.start`/`round.end` are 'YYYY-MM-DD' calendar-day strings;
// `round.start === null` (the "All Rounds" entry) always matches.
// Uses getMatchDateStr() (reads the date straight off the sheet string) —
// NOT parseMatchDateTime()+getPacificDateStr(), which double-converts
// through a timezone reformat and can shift early-morning matches onto the
// wrong calendar day, silently excluding them from a round's totals.
function matchInRound(match, round) {
  if (!round || round.start === null) return true;
  const dateStr = getMatchDateStr(match.dateTimeRaw);
  return dateStr >= round.start && dateStr <= round.end;
}

// ─── Perf: memoised date parser ───────────────────────────────────────────────
const _dtCache = new Map();
function parseMatchDateTime(str) {
  if (!str || typeof str !== 'string') return new Date(0);
  if (_dtCache.has(str)) return _dtCache.get(str);
  try {
    // Tokenize defensively: insert spaces around "-" and between a month
    // abbreviation and digits BEFORE collapsing whitespace, so inconsistent
    // sheet formatting ("Jun 17-14:00", "Jun17 - 14:00") can't merge the
    // day into the time or the month into the day.
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

// Extracts the 'YYYY-MM-DD' calendar date for a match. Reuses the SAME
// Date object that parseMatchDateTime() already builds from the sheet
// string (so there's no second, independently-fragile parse of the raw
// text — e.g. inconsistent spacing around the "-" separator like
// "Jun 17-14:00" or "Jun17 - 14:00" previously caused this to silently
// extract the wrong day for that one row). Reads the components back with
// .getFullYear()/.getMonth()/.getDate(), i.e. the exact local values the
// Date was constructed with — NOT through getPacificDateStr(), which
// reformats through a timezone converter and can shift early-morning
// matches onto the previous day.
function getMatchDateStr(str) {
  const d = parseMatchDateTime(str);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Pacific Time helpers ──────────────────────────────────────────────────────
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

// ─── Data loading ──────────────────────────────────────────────────────────────
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
  const playerIndices = [5,8,11,14,17,20];
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
  // Recalculate points for all matches after setting scores
  recalcAllPoints();
}

// ─── Recalculate points for all matches and update player totals ─────────────
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

// ─── Add Prediction timers ─────────────────────────────────────────────────────
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

// ─── Carousel ─────────────────────────────────────────────────────────────────
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

  // Determine card to center
  const oneHourLater = new Date(now.getTime()+60*60*1000);
  let currentIdx = -1;
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

// Computes each player's total points using only matches that fall within
// the currently active round's date range (or all matches, for "All Rounds").
function getLeaderboardData() {
  const round = ROUNDS.find(r => r.key === activeRound) || ROUNDS[0];
  const roundMatches = MATCHES.filter(m => matchInRound(m, round));
  return PLAYERS.map(p => ({
    ...p,
    pts: roundMatches.reduce((s,m)=>s+(m.preds.find(pr=>pr.p===p.name)?.pts||0),0)
  }));
}

function buildLeaderboard() {
  buildRoundFilterBar();
  const data=getLeaderboardData();
  const sorted=[...data].sort((a,b)=>b.pts-a.pts);
  const maxPts=sorted[0]?.pts||1;
  const labels=['1st','2nd','3rd','4th','5th','6th'];
  const colors=['var(--gold-dark)','#888780','#a0522d','#888','#888'];
  document.getElementById('leaderboard').innerHTML=sorted.map((p,i)=>{
    const w=Math.round((p.pts/maxPts)*100);
    return `<div class="player-row" onclick="switchToPlayer('${p.name}')"><span class="rank-badge" style="color:${colors[i]}">${labels[i]}</span><div class="avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div><div class="player-info"><div class="player-name">${p.name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${p.color}"></div></div></div><div class="pts-col"><div class="pts-big">${p.pts}</div><div class="pts-unit">pts</div></div></div>`;
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

// ─── Matches tab ──────────────────────────────────────────────────────────────
function buildStatusTabs() {
  document.getElementById('statusTabs').innerHTML=`<button class="pill-btn ${activeStatus==='upcoming'?'active':''}" onclick="setMatchStatus('upcoming',this)"><i class="ti ti-calendar-time"></i> Upcoming Games</button><button class="pill-btn ${activeStatus==='previous'?'active':''}" onclick="setMatchStatus('previous',this)"><i class="ti ti-history"></i> Previous Results</button>`;
}
window.setMatchStatus=function(s,btn){ activeStatus=s; document.querySelectorAll('#statusTabs .pill-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderMatchList(); };

function buildGroupTabs() {
  const groups=['All',...new Set(MATCHES.map(m=>m.group))];
  document.getElementById('groupTabs').innerHTML=groups.map((g,i)=>`<button class="pill-btn ${i===0?'active':''}" onclick="filterGroup('${g}',this)">${g==='All'?'<i class="ti ti-list"></i> All':g}<span class="pill-count">${g==='All'?MATCHES.length:MATCHES.filter(m=>m.group===g).length}</span></button>`).join('');
}
window.filterGroup=function(g,btn){ activeGroup=g; document.querySelectorAll('#groupTabs .pill-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderMatchList(); };

function ptsBadge(pts) {
  if (pts===null) return '<span class="no-pred">—</span>';
  if (pts===3) return '<span class="pts-badge p3">+3</span>';
  if (pts===1) return '<span class="pts-badge p1">+1</span>';
  return '<span class="pts-badge p0">0</span>';
}

function renderMatchList() {
  const now=getCurrentPacificDate();
  let filtered=activeGroup==='All'?MATCHES:MATCHES.filter(m=>m.group===activeGroup);
  filtered=filtered.filter(m=>{ const d=parseMatchDateTime(m.dateTimeRaw); return activeStatus==='upcoming'?d>now:d<=now; });
  const el=document.getElementById('matchList');
  if (!filtered.length) { el.innerHTML='<p class="no-pred" style="text-align:center;padding:24px;">No matches in this category</p>'; return; }
  const pcm=Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
  el.innerHTML=filtered.map(m=>{
    const isPending=m.homeScore===null;
    const predsHtml=m.preds.map(pr=>{
      const col=pcm[pr.p]||'#888';
      if (pr.h===null) return `<div class="pred-row"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span></div><span class="no-pred">—</span></div>`;
      const cls=isPending?'':(pr.pts===3?'correct':pr.pts===1?'partial':'wrong');
      return `<div class="pred-row ${cls}"><div class="pred-left"><span class="pred-dot" style="background:${col}"></span><span class="pred-pname">${pr.p}</span><span class="pred-score" style="margin-left:4px">${pr.h}–${pr.a}</span></div>${ptsBadge(isPending?null:pr.pts)}</div>`;
    }).join('');
    return `<div class="match-card"><div class="match-head"><div class="match-head-left"><span class="grp-pill">${m.group}</span><span class="match-time">${m.dateDisplay}</span></div>${isPending?'<span class="pending-tag"><i class="ti ti-clock"></i> Upcoming</span>':`<span class="score-badge">${m.homeScore} – ${m.awayScore}</span>`}</div><div class="match-body"><div class="matchup-name">${m.matchup}</div><div class="preds-list">${predsHtml}</div></div></div>`;
  }).join('');
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
  document.getElementById('playerMatchPreds').innerHTML=MATCHES.map(m=>{
    const pr=m.preds.find(x=>x.p===p.name);
    const isPending=m.homeScore===null;
    if (!pr||pr.h===null) return `<div class="match-pred-row"><div><div class="match-pred-name">${m.matchup}</div><div class="no-pred" style="font-size:12px;margin-top:2px">No prediction</div></div></div>`;
    const cls=isPending?'':(pr.pts===3?'correct':pr.pts===1?'partial':'wrong');
    return `<div class="match-pred-row ${cls}"><div style="flex:1"><div class="match-pred-name">${m.matchup}</div><div class="match-pred-score">${pr.h} – ${pr.a}${isPending?'<span class="upcoming-inline"><i class="ti ti-clock"></i></span>':''}</div></div><div class="match-pred-right">${isPending?'<span class="no-pred">TBD</span>':ptsBadge(pr.pts)}${!isPending?`<div class="actual-result">${m.homeScore}–${m.awayScore} actual</div>`:''}</div></div>`;
  }).join('');
}

// ─── Add Predictions section (UPDATED with Pacific time and 4-match limit) ──
function buildAddPredSection() {
  const now = getCurrentPacificDate();
  
  // Group ALL matches by Pacific date
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

  // Find first date with at least one unlockable match
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

  // 🔥 Filter out locked matches – only show those still open for predictions
  const unlockableMatches = dateGroup.matches.filter(m => isMatchPredictable(m, now));
  const matchesToShow = unlockableMatches.slice(0, 4);   // still limit to 4

  // If no unlockable matches in this date, show a message
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
    // re-bind navigation buttons
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

  // Build HTML only for unlockable matches – no "locked" tiles will appear
  let matchesHtml = '';
  matchesToShow.forEach(m => {
    const timeOnly = m.dateTimeRaw.includes(' - ') ? m.dateTimeRaw.split(' - ')[1] : m.dateTimeRaw;
    // Since we already filtered, all these matches are unlockable.
    // But we still compute lock time for the timer (it will show countdown)
    const lockTime = getMatchLockDeadline(m);
    const isLocked = now > lockTime; // should be false for all, but keep safe
    const timerText = isLocked ? '🔒 Locked' : formatCountdown(lockTime - now);

    const playerRows = PLAYERS.map(pl => {
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

  // Since we filtered out locked ones, 'allLocked' is always false here.
  // But we can check if there are any unlockable matches in next day.
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
      // Recalc points immediately (if match already has scores)
      if (match.homeScore !== null && match.awayScore !== null) {
        pred.pts = calcPoints(match.homeScore, match.awayScore, h, a);
      } else {
        pred.pts = null;
      }
      // Update player totals
      recalcAllPoints(); // Recalc all players' totals from all matches
    }
    btn.className = 'save-pred-btn saved';
    btn.innerHTML = '<i class="ti ti-check"></i> Saved';
    statusSpan.className = 'pred-save-status ok';
    statusSpan.textContent = `${h}:${a} ✓`;

    // Refresh all UI components immediately
    buildTodayCarousel();
    buildLeaderboard();
    buildOverviewStats();
    buildAllUpcomingGames();
    if (activePlayer) renderPlayerDetail();
    renderMatchList();
    // Rebuild add prediction section to reflect updated predictions
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
        // Rebuild all UI after fresh data
        buildTodayCarousel();
        buildLeaderboard();
        buildOverviewStats();
        buildAllUpcomingGames();
        buildAddPredSection();
        renderMatchList();
        if (activePlayer) renderPlayerDetail();
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

// ─── Orchestration ─────────────────────────────────────────────────────────────
function buildAllUI() {
  // Ensure points are recalculated before building UI
  recalcAllPoints();
  buildTodayCarousel();
  buildLeaderboard();
  buildOverviewStats();
  buildAllUpcomingGames();
  buildStatusTabs();
  buildGroupTabs();
  renderMatchList();
  buildPlayerBtns();
  renderPlayerDetail();
  buildAddPredSection();
}

window.showSection = function(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (id === 'matches') renderMatchList();
  if (id === 'addpred') { buildAddPredSection(); startAddPredTimer(); } else stopAddPredTimer();
  if (id === 'standings') { buildTodayCarousel(); buildLeaderboard(); buildOverviewStats(); buildAllUpcomingGames(); }
};

window.switchToPlayer = function(name) {
  activePlayer = name;
  showSection('player', document.querySelectorAll('.nav-btn')[3]);
  buildPlayerBtns();
  renderPlayerDetail();
};

loadData();
window.addEventListener('beforeunload', () => { stopAddPredTimer(); });