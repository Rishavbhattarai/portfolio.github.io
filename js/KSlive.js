// WC 2026 – Knockout Stage | KSlive.js
// Full replica of wclive.js functionality, namespaced under `KS`
// Data source: same Google Sheets script as Group Stage

(function () {
    'use strict';

    // ─── Configuration ──────────────────────────────────────────────────────────
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyYWi9vSer9egRWJMRLPZJlZVJxE4l-TYENMcFWMEbFqVEjboi_A8aBxrUf3DCTxGLqBw/exec';

    const PLAYER_COLORS = {
        'Amit':      { color:'#5b6cf6', bg:'#eeedfe', textc:'#3C3489', initials:'AM' },
        'Barun':     { color:'#1a6b3a', bg:'#e8f5ee', textc:'#0f4a27', initials:'BA' },
        'Prashanna': { color:'#d97706', bg:'#faeeda', textc:'#633806', initials:'PR' },
        'Rishav':    { color:'#e05252', bg:'#fcebeb', textc:'#791f1f', initials:'RI' },
        'Sweastik':  { color:'#7c3aed', bg:'#eeedfe', textc:'#26215C', initials:'SW' },
        'Nikita':    { color:'#ff0766', bg:'#eeedfe', textc:'#26215C', initials:'NI' },
    };

    let PLAYERS = [], MATCHES = [];
    let activeGroup = 'All', activeStatus = 'upcoming', activePlayer = '';
    let _addPredTimer = null;
    let _activeDateGroups = [], _currentActiveDateIdx = 0;

    // ─── Round definitions (same as Group Stage) ──────────────────────────────
    const ROUNDS = [
        { key: 'all',    label: 'All Rounds', start: null,                  end: null },
        { key: 'r1',     label: 'Round 1',    start: '2026-06-11',          end: '2026-06-17' },
        { key: 'r2',     label: 'Round 2',    start: '2026-06-18',          end: '2026-06-23' },
        { key: 'r3',     label: 'Round 3',    start: '2026-06-24',          end: '2026-06-24' }
    ];
    let activeRound = 'r2';

    function matchInRound(match, round) {
        if (!round || round.start === null) return true;
        const dateStr = getMatchDateStr(match.dateTimeRaw);
        return dateStr >= round.start && dateStr <= round.end;
    }

    // ─── Date helpers (Pacific Time) ──────────────────────────────────────────
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

    function getMatchLockDeadline(match) {
        return new Date(parseMatchDateTime(match.dateTimeRaw).getTime() - 5*60*1000);
    }

    function isMatchPredictable(match, now=getCurrentPacificDate()) {
        return now < getMatchLockDeadline(match);
    }

    function formatCountdown(ms) {
        if (ms<=0) return '🔒 Locked';
        const mins=Math.floor(ms/60000);
        const secs=Math.floor((ms%60000)/1000);
        return `⏱️ ${mins}:${secs.toString().padStart(2,'0')} mins until lock`;
    }

    // ─── Data loading ───────────────────────────────────────────────────────────
    async function loadData(silent=false) {
        const loadingMsg = document.getElementById('ksLoadingMsg');
        const appContent = document.getElementById('ksAppContent');
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
            if (!silent) loadingMsg.innerHTML=`<div class="ks-error"><strong>Failed to load data</strong><br>${err.message}</div>`;
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

    // ─── Carousel ───────────────────────────────────────────────────────────────
    function buildCarousel() {
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

        const track = document.getElementById('ksUpcomingCarousel');
        if (!allMatchesSorted.length) {
            track.innerHTML='<p class="ks-no-pred" style="padding:16px;text-align:center;">No matches scheduled for today/tomorrow and no previous results.</p>';
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
                if (pr.h===null) return `<div class="ks-pred-row"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span></div><span class="ks-no-pred">No prediction</span></div>`;
                let earnedBadge='';
                if (isCompleted&&pr.pts!==null) {
                    const [bg,tc] = pr.pts===3?['#28a745','#fff']:pr.pts===1?['#D4AF37','#0B1B33']:['#e0e0e0','#666'];
                    const txt = pr.pts===3?'+3':pr.pts===1?'+1':'0';
                    earnedBadge=`<span class="ks-earned-points-badge" style="background:${bg};color:${tc}">${txt}</span>`;
                }
                return `<div class="ks-pred-row"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span>${earnedBadge}</div><span class="ks-pred-score">${pr.h}–${pr.a}</span></div>`;
            }).join('');
            return `<div class="ks-carousel-card" data-match-id="${m.id}"><div class="ks-cc-head"><div class="ks-cg-head-title"><i class="ti ti-calendar"></i> ${m.group} · ${dateLabel}</div><span class="ks-cg-time-badge">${timeOnly}</span></div><div class="ks-cc-body"><div class="ks-cc-matchup-title">${m.matchup}</div><div class="ks-preds-list">${predsHtml}</div>${scoreDisplay?`<div class="ks-final-tag"><i class="ti ti-check"></i> Final · ${scoreDisplay}</div>`:''}</div></div>`;
        }).join('');

        if (currentIdx>=0) {
            requestAnimationFrame(()=>{
                const cards=document.querySelectorAll('#ksUpcomingCarousel .ks-carousel-card');
                if (cards[currentIdx]) cards[currentIdx].scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
            });
        }
    }

    // ─── Leaderboard ───────────────────────────────────────────────────────────
    function buildRoundFilterBar() {
        const el = document.getElementById('ksRoundFilterBar');
        if (!el) return;
        el.innerHTML = ROUNDS.map(r =>
            `<button class="ks-round-pill-btn ${r.key===activeRound?'active':''}" onclick="KS.setRound('${r.key}',this)">${r.label}</button>`
        ).join('');
    }

    window.KS = window.KS || {};
    KS.setRound = function(key, btn) {
        activeRound = key;
        document.querySelectorAll('#ksRoundFilterBar .ks-round-pill-btn').forEach(b=>b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        buildLeaderboard();
    };

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
        const colors=['var(--ks-gold-dark)','#888780','#a0522d','#888','#888'];
        const el=document.getElementById('ksLeaderboard');
        if (!el) return;
        el.innerHTML=sorted.map((p,i)=>{
            const w=Math.round((p.pts/maxPts)*100);
            return `<div class="ks-player-row" onclick="KS.switchToPlayer('${p.name}')"><span class="ks-rank-badge" style="color:${colors[i]}">${labels[i]}</span><div class="ks-avatar" style="background:${p.bg};color:${p.textc}">${p.initials}</div><div class="ks-player-info"><div class="ks-player-name">${p.name}</div><div class="ks-bar-track"><div class="ks-bar-fill" style="width:${w}%;background:${p.color}"></div></div></div><div class="ks-pts-col"><div class="ks-pts-big">${p.pts}</div><div class="ks-pts-unit">pts</div></div></div>`;
        }).join('');
    }

    // ─── Overview stats ────────────────────────────────────────────────────────
    function buildOverviewStats() {
        const now=getCurrentPacificDate();
        const completed=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)<=now);
        const upcoming=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)>now);
        const sorted=[...PLAYERS].sort((a,b)=>b.pts-a.pts);
        const top=sorted[0];
        const mostExact=Math.max(0,...PLAYERS.map(p=>completed.reduce((s,m)=>s+(m.preds.find(pr=>pr.p===p.name)?.pts===3?1:0),0)));
        const el=document.getElementById('ksOverviewStats');
        if (!el) return;
        el.innerHTML=`<div class="ks-stat-box"><div class="ks-sv">${completed.length}</div><div class="ks-sl">matches scored</div></div><div class="ks-stat-box"><div class="ks-sv">${upcoming.length}</div><div class="ks-sl">upcoming</div></div><div class="ks-stat-box"><div class="ks-sv" style="color:${top?.color}">${top?.pts||0}</div><div class="ks-sl">leader pts · ${top?.name||'–'}</div></div><div class="ks-stat-box"><div class="ks-sv">${mostExact}</div><div class="ks-sl">most exact scores</div></div>`;
        document.getElementById('ksHeaderSub').textContent=`${completed.length} match${completed.length!==1?'es':''} scored · ${upcoming.length} upcoming`;
    }

    // ─── All upcoming games ────────────────────────────────────────────────────
    function buildAllUpcomingGames() {
        const now=getCurrentPacificDate();
        const upcoming=MATCHES.filter(m=>parseMatchDateTime(m.dateTimeRaw)>now)
            .sort((a,b)=>parseMatchDateTime(a.dateTimeRaw)-parseMatchDateTime(b.dateTimeRaw));
        const container=document.getElementById('ksAllUpcomingGames');
        if (!container) return;
        if (!upcoming.length) { container.innerHTML='<p class="ks-no-pred" style="text-align:center;padding:24px;">No upcoming matches scheduled.</p>'; return; }
        const pcm=Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
        container.innerHTML=upcoming.map(m=>{
            const timeOnly=m.dateTimeRaw.includes(' - ')?m.dateTimeRaw.split(' - ')[1]:m.dateTimeRaw;
            const predsHtml=m.preds.map(pr=>{
                const col=pcm[pr.p]||'#888';
                if (pr.h===null) return `<div class="ks-pred-row"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span></div><span class="ks-no-pred">—</span></div>`;
                return `<div class="ks-pred-row"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span><span class="ks-pred-score" style="margin-left:4px">${pr.h}–${pr.a}</span></div></div>`;
            }).join('');
            return `<div class="ks-match-card"><div class="ks-match-head"><div class="ks-match-head-left"><span class="ks-grp-pill">${m.group}</span><span class="ks-match-time"><i class="ti ti-clock"></i> ${timeOnly}</span></div><span class="ks-pending-tag"><i class="ti ti-clock"></i> Upcoming</span></div><div class="ks-match-body"><div class="ks-matchup-name">${m.matchup}</div><div class="ks-preds-list">${predsHtml}</div></div></div>`;
        }).join('');
    }

    // ─── Matches tab ────────────────────────────────────────────────────────────
    function buildStatusTabs() {
        const el=document.getElementById('ksStatusTabs');
        if (!el) return;
        el.innerHTML=`<button class="ks-pill-btn ${activeStatus==='upcoming'?'active':''}" onclick="KS.setMatchStatus('upcoming',this)"><i class="ti ti-calendar-time"></i> Upcoming Games</button><button class="ks-pill-btn ${activeStatus==='previous'?'active':''}" onclick="KS.setMatchStatus('previous',this)"><i class="ti ti-history"></i> Previous Results</button>`;
    }
    KS.setMatchStatus = function(s,btn){
        activeStatus=s;
        document.querySelectorAll('#ksStatusTabs .ks-pill-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderMatchList();
    };

    function buildGroupTabs() {
        const el=document.getElementById('ksGroupTabs');
        if (!el) return;
        const groups=['All',...new Set(MATCHES.map(m=>m.group))];
        el.innerHTML=groups.map((g,i)=>`<button class="ks-pill-btn ${i===0?'active':''}" onclick="KS.filterGroup('${g}',this)">${g==='All'?'<i class="ti ti-list"></i> All':g}<span class="ks-pill-count">${g==='All'?MATCHES.length:MATCHES.filter(m=>m.group===g).length}</span></button>`).join('');
    }
    KS.filterGroup = function(g,btn){
        activeGroup=g;
        document.querySelectorAll('#ksGroupTabs .ks-pill-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderMatchList();
    };

    function ptsBadge(pts) {
        if (pts===null) return '<span class="ks-no-pred">—</span>';
        if (pts===3) return '<span class="ks-pts-badge p3">+3</span>';
        if (pts===1) return '<span class="ks-pts-badge p1">+1</span>';
        return '<span class="ks-pts-badge p0">0</span>';
    }

    function renderMatchList() {
        const now=getCurrentPacificDate();
        let filtered=activeGroup==='All'?MATCHES:MATCHES.filter(m=>m.group===activeGroup);
        filtered=filtered.filter(m=>{ const d=parseMatchDateTime(m.dateTimeRaw); return activeStatus==='upcoming'?d>now:d<=now; });
        const el=document.getElementById('ksMatchList');
        if (!el) return;
        if (!filtered.length) { el.innerHTML='<p class="ks-no-pred" style="text-align:center;padding:24px;">No matches in this category</p>'; return; }
        const pcm=Object.fromEntries(PLAYERS.map(p=>[p.name,p.color]));
        el.innerHTML=filtered.map(m=>{
            const isPending=m.homeScore===null;
            const predsHtml=m.preds.map(pr=>{
                const col=pcm[pr.p]||'#888';
                if (pr.h===null) return `<div class="ks-pred-row"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span></div><span class="ks-no-pred">—</span></div>`;
                const cls=isPending?'':(pr.pts===3?'correct':pr.pts===1?'partial':'wrong');
                return `<div class="ks-pred-row ${cls}"><div class="ks-pred-left"><span class="ks-pred-dot" style="background:${col}"></span><span class="ks-pred-pname">${pr.p}</span><span class="ks-pred-score" style="margin-left:4px">${pr.h}–${pr.a}</span></div>${ptsBadge(isPending?null:pr.pts)}</div>`;
            }).join('');
            return `<div class="ks-match-card"><div class="ks-match-head"><div class="ks-match-head-left"><span class="ks-grp-pill">${m.group}</span><span class="ks-match-time">${m.dateDisplay}</span></div>${isPending?'<span class="ks-pending-tag"><i class="ti ti-clock"></i> Upcoming</span>':`<span class="ks-score-badge">${m.homeScore} – ${m.awayScore}</span>`}</div><div class="ks-match-body"><div class="ks-matchup-name">${m.matchup}</div><div class="ks-preds-list">${predsHtml}</div></div></div>`;
        }).join('');
    }

    // ─── Player tab ─────────────────────────────────────────────────────────────
    function buildPlayerBtns() {
        const el=document.getElementById('ksPlayerBtns');
        if (!el) return;
        el.innerHTML=PLAYERS.map(p=>`<button class="ks-player-btn ${p.name===activePlayer?'active':''}" style="${p.name===activePlayer?`background:${p.color};border-color:${p.color};color:#fff`:''}" onclick="KS.selectPlayer('${p.name}',this)">${p.initials} ${p.name}</button>`).join('');
    }
    KS.selectPlayer = function(name,btn){
        activePlayer=name;
        document.querySelectorAll('#ksPlayerBtns .ks-player-btn').forEach(b=>{ b.classList.remove('active'); b.style.cssText=''; });
        const p=PLAYERS.find(x=>x.name===name);
        btn.classList.add('active'); btn.style.background=p.color; btn.style.borderColor=p.color; btn.style.color='#fff';
        renderPlayerDetail();
    };

    function renderPlayerDetail() {
        const p = PLAYERS.find(x => x.name === activePlayer);
        if (!p) return;

        const now = getCurrentPacificDate();
        const done = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) <= now);
        const myPreds = done.map(m => ({ m, pr: m.preds.find(pr => pr.p === p.name) })).filter(x => x.pr && x.pr.pts !== null);
        const exact = myPreds.filter(x => x.pr.pts === 3).length;
        const correct = myPreds.filter(x => x.pr.pts === 1).length;
        const wrong = myPreds.filter(x => x.pr.pts === 0).length;
        const pending = MATCHES.filter(m => parseMatchDateTime(m.dateTimeRaw) > now && m.preds.find(pr => pr.p === p.name)?.h !== null);
        const accuracy = myPreds.length ? Math.round(((exact + correct) / myPreds.length) * 100) : 0;
        const sorted = [...PLAYERS].sort((a, b) => b.pts - a.pts);
        const rankPos = sorted.findIndex(x => x.name === p.name);
        const rankSuffix = ['st', 'nd', 'rd', 'th', 'th', 'th'][rankPos] || 'th';

        // Avatar
        const av = document.getElementById('ksPlayerAvatar');
        if (av) { av.style.background = p.bg; av.style.color = p.textc; av.textContent = p.initials; }

        // Name & rank — corrected IDs
        const nameEl = document.getElementById('ksPlayerName');
        if (nameEl) nameEl.textContent = p.name;
        const rankEl = document.getElementById('ksPlayerRank');
        if (rankEl) rankEl.textContent = `${rankPos + 1}${rankSuffix} place`;

        // Points
        const ptsNum = document.getElementById('ksPlayerPtsNum');
        if (ptsNum) ptsNum.textContent = p.pts;

        // Stats grid – with icons and gold styling
        const statsEl = document.getElementById('ksPlayerStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="ks-stat-box exact">
                    <span class="ks-stat-icon">🏆</span>
                    <div class="ks-sv">${exact}</div>
                    <div class="ks-sl">exact scores <strong>(+3)</strong></div>
                </div>
                <div class="ks-stat-box correct">
                    <span class="ks-stat-icon">✅</span>
                    <div class="ks-sv">${correct}</div>
                    <div class="ks-sl">correct results <strong>(+1)</strong></div>
                </div>
                <div class="ks-stat-box wrong">
                    <span class="ks-stat-icon">❌</span>
                    <div class="ks-sv">${wrong}</div>
                    <div class="ks-sl">wrong predictions</div>
                </div>
                <div class="ks-stat-box pending">
                    <span class="ks-stat-icon">⏱️</span>
                    <div class="ks-sv">${pending.length}</div>
                    <div class="ks-sl">predictions pending</div>
                </div>
            `;
        }

        // Accuracy bar – golden – removed fill bar logic
        const accBar = document.getElementById('ksPlayerAccuracyBar');
        const accVal = document.getElementById('ksPlayerAccuracyVal');
        if (accBar && accVal) {
            if (myPreds.length) {
                accBar.style.display = 'flex';
                accVal.textContent = `${accuracy}%`;
            } else {
                accBar.style.display = 'none';
            }
        }

        // Predictions list
        const predsEl = document.getElementById('ksPlayerMatchPreds');
        if (predsEl) {
            predsEl.innerHTML = MATCHES.map(m => {
                const pr = m.preds.find(x => x.p === p.name);
                const isPending = m.homeScore === null;
                if (!pr || pr.h === null) {
                    return `<div class="ks-match-pred-row">
                        <div>
                            <div class="ks-match-pred-name">${m.matchup}</div>
                            <div class="ks-no-pred" style="font-size:12px;margin-top:2px">No prediction</div>
                        </div>
                    </div>`;
                }
                const cls = isPending ? '' : (pr.pts === 3 ? 'correct' : pr.pts === 1 ? 'partial' : 'wrong');
                return `<div class="ks-match-pred-row ${cls}">
                    <div style="flex:1;min-width:0">
                        <div class="ks-match-pred-name">${m.matchup}</div>
                        <div class="ks-match-pred-score">${pr.h} – ${pr.a}${isPending ? '<span class="ks-upcoming-inline"><i class="ti ti-clock"></i></span>' : ''}</div>
                    </div>
                    <div class="ks-match-pred-right">
                        ${isPending ? '<span class="ks-no-pred">TBD</span>' : ptsBadge(pr.pts)}
                        ${!isPending ? `<div class="ks-actual-result">${m.homeScore}–${m.awayScore} actual</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
    }

    // ─── Add Predictions section ──────────────────────────────────────────────
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
        const container = document.getElementById('ksAddPredContent');
        if (!_activeDateGroups.length) {
            container.innerHTML = '<div class="ks-no-games-today"><i class="ti ti-lock"></i><div>No matches scheduled.</div></div>';
            return;
        }
        const dateGroup = _activeDateGroups[_currentActiveDateIdx];
        const totalGroups = _activeDateGroups.length;
        const now = getCurrentPacificDate();
        const matchesToShow = dateGroup.matches.slice(0, 4);
        const allLocked = matchesToShow.every(m => !isMatchPredictable(m, now));

        let matchesHtml = '';
        matchesToShow.forEach(m => {
            const timeOnly = m.dateTimeRaw.includes(' - ') ? m.dateTimeRaw.split(' - ')[1] : m.dateTimeRaw;
            const lockTime = getMatchLockDeadline(m);
            const isLocked = now > lockTime;
            const timerText = isLocked ? '🔒 Locked' : formatCountdown(lockTime - now);

            const playerRows = PLAYERS.map(pl => {
                const existing = m.preds.find(pr => pr.p === pl.name);
                const hVal = existing?.h ?? '';
                const aVal = existing?.a ?? '';
                const uid = `kspred_${m.id}_${pl.name.replace(/\s+/g, '_')}`;
                return `<div class="ks-pred-player">
                    <div class="ks-pred-player-avatar" style="background:${pl.bg};color:${pl.textc}">${pl.initials}</div>
                    <div class="ks-pred-player-name">${pl.name}</div>
                    <div class="ks-score-inputs">
                        <input class="ks-score-input" type="number" min="0" max="20" id="${uid}_h" value="${hVal}" placeholder="–" ${isLocked ? 'disabled' : ''}>
                        <span class="ks-score-sep">:</span>
                        <input class="ks-score-input" type="number" min="0" max="20" id="${uid}_a" value="${aVal}" placeholder="–" ${isLocked ? 'disabled' : ''}>
                        <button class="ks-save-pred-btn" id="${uid}_btn" onclick="KS.handleSavePred(${m.rowIndex},'${pl.name}','${uid}')" ${isLocked ? 'disabled' : ''}>
                            <i class="ti ti-device-floppy"></i> Save
                        </button>
                    </div>
                    <span class="ks-pred-save-status" id="${uid}_status"></span>
                </div>`;
            }).join('');

            matchesHtml += `<div class="ks-pred-match-item" data-rowindex="${m.rowIndex}">
                <div class="ks-match-header">
                    <div class="ks-match-title">${m.matchup}</div>
                    <div class="ks-match-meta">
                        <span>${m.group} · ${timeOnly}</span>
                        <span class="ks-match-lock-timer" style="color:${isLocked ? '#e05252' : '#800000'}">${timerText}</span>
                    </div>
                </div>
                <div class="ks-pred-player-section">
                    <div class="ks-pred-player-label">Enter / update predictions</div>
                    ${playerRows}
                </div>
            </div>`;
        });

        let nextHint = '';
        if (allLocked && _currentActiveDateIdx < totalGroups - 1) {
            const nextGroup = _activeDateGroups[_currentActiveDateIdx + 1];
            nextHint = `<div class="ks-next-day-hint">⏩ All matches for today are locked. Next games: <strong>${nextGroup.formatted}</strong></div>`;
        } else if (allLocked && _currentActiveDateIdx === totalGroups - 1) {
            nextHint = `<div class="ks-next-day-hint">✅ All matches are locked. No more upcoming games.</div>`;
        }

        const prevDisabled = _currentActiveDateIdx === 0 ? 'disabled' : '';
        const nextDisabled = _currentActiveDateIdx === totalGroups - 1 ? 'disabled' : '';

        container.innerHTML = `<div class="ks-date-pred-card">
            <div class="ks-date-card-header">
                <button class="ks-date-nav-btn-inline" id="ksPrevDateBtn" ${prevDisabled}>
                    <i class="ti ti-chevron-left"></i> Previous
                </button>
                <span style="font-weight:700">⚽ ${dateGroup.formatted}</span>
                <button class="ks-date-nav-btn-inline" id="ksNextDateBtn" ${nextDisabled}>
                    Next <i class="ti ti-chevron-right"></i>
                </button>
            </div>
            ${matchesHtml}
            ${nextHint}
        </div>`;

        document.getElementById('ksPrevDateBtn')?.addEventListener('click', () => {
            if (_currentActiveDateIdx > 0) {
                _currentActiveDateIdx--;
                renderCurrentDateCard();
                updateAddPredTimers();
            }
        });
        document.getElementById('ksNextDateBtn')?.addEventListener('click', () => {
            if (_currentActiveDateIdx < _activeDateGroups.length - 1) {
                _currentActiveDateIdx++;
                renderCurrentDateCard();
                updateAddPredTimers();
            }
        });

        updateAddPredTimers();
    }

    // ─── Save prediction handler ──────────────────────────────────────────────
    KS.handleSavePred = async function(matchRowIndex, playerName, uid) {
        const hInput = document.getElementById(`${uid}_h`);
        const aInput = document.getElementById(`${uid}_a`);
        const btn = document.getElementById(`${uid}_btn`);
        const statusSpan = document.getElementById(`${uid}_status`);
        if (!hInput || !aInput || !btn) return;

        const hRaw = hInput.value.trim();
        const aRaw = aInput.value.trim();
        if (hRaw === '' || aRaw === '') {
            statusSpan.className = 'ks-pred-save-status err';
            statusSpan.textContent = 'Fill both scores';
            return;
        }
        const h = parseInt(hRaw, 10);
        const a = parseInt(aRaw, 10);
        if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
            statusSpan.className = 'ks-pred-save-status err';
            statusSpan.textContent = 'Invalid scores';
            return;
        }

        btn.disabled = true;
        btn.className = 'ks-save-pred-btn saving';
        btn.innerHTML = '<i class="ti ti-loader-2"></i> Saving…';
        statusSpan.className = 'ks-pred-save-status';
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
            btn.className = 'ks-save-pred-btn saved';
            btn.innerHTML = '<i class="ti ti-check"></i> Saved';
            statusSpan.className = 'ks-pred-save-status ok';
            statusSpan.textContent = `${h}:${a} ✓`;

            // Refresh all UI
            buildCarousel();
            buildLeaderboard();
            buildOverviewStats();
            buildAllUpcomingGames();
            if (activePlayer) renderPlayerDetail();
            renderMatchList();
            buildAddPredSection();

            setTimeout(async () => {
                btn.disabled = false;
                btn.className = 'ks-save-pred-btn';
                btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
                try {
                    const res = await fetch(SCRIPT_URL);
                    const data = await res.json();
                    _dtCache.clear();
                    parseSheetData(data);
                    buildCarousel();
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
            btn.className = 'ks-save-pred-btn';
            btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save';
            statusSpan.className = 'ks-pred-save-status err';
            statusSpan.textContent = 'Failed – retry';
        }
    };

    // ─── Timer updates for Add Prediction locks ──────────────────────────────
    function updateAddPredTimers() {
        const addPredSection = document.getElementById('ksAddPred');
        if (!addPredSection || !addPredSection.classList.contains('active')) return;
        const now = getCurrentPacificDate();
        document.querySelectorAll('#ksAddPredContent .ks-pred-match-item').forEach(item => {
            const rowIndex = parseInt(item.getAttribute('data-rowindex'), 10);
            const match = MATCHES.find(m => m.rowIndex === rowIndex);
            if (!match) return;
            const lockTime = getMatchLockDeadline(match);
            const isLocked = now > lockTime;
            const remainingMs = lockTime - now;
            const timerSpan = item.querySelector('.ks-match-lock-timer');
            if (timerSpan) {
                timerSpan.textContent = isLocked ? '🔒 Locked' : formatCountdown(remainingMs);
                timerSpan.style.color = isLocked ? '#e05252' : '#800000';
                timerSpan.classList.toggle('urgent', !isLocked && remainingMs <= 120000);
            }
            item.querySelectorAll('.ks-score-input').forEach(inp => { inp.disabled = isLocked; });
            item.querySelectorAll('.ks-save-pred-btn').forEach(btn => { btn.disabled = isLocked; });
        });
    }

    function startAddPredTimer() {
        if (_addPredTimer) clearInterval(_addPredTimer);
        _addPredTimer = setInterval(() => {
            if (document.getElementById('ksAddPred').classList.contains('active')) updateAddPredTimers();
        }, 1000);
    }
    function stopAddPredTimer() {
        if (_addPredTimer) { clearInterval(_addPredTimer); _addPredTimer = null; }
    }

    // ─── Navigation ────────────────────────────────────────────────────────────
    KS.showSection = function(id, btn) {
        document.querySelectorAll('.ks-section').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.querySelectorAll('.ks-nav-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        if (id === 'ksStandings') {
            buildCarousel();
            buildLeaderboard();
            buildOverviewStats();
            buildAllUpcomingGames();
        }
        if (id === 'ksAddPred') {
            buildAddPredSection();
            startAddPredTimer();
        } else {
            stopAddPredTimer();
        }
        if (id === 'ksMatches') {
            renderMatchList();
        }
        if (id === 'ksPlayer') {
            renderPlayerDetail();
        }
    };

    KS.switchToPlayer = function(name) {
        activePlayer = name;
        KS.showSection('ksPlayer', document.querySelectorAll('.ks-nav-btn')[3]);
        buildPlayerBtns();
        renderPlayerDetail();
    };

    // ─── Build all UI ──────────────────────────────────────────────────────────
    function buildAllUI() {
        recalcAllPoints();
        buildCarousel();
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

    // ─── Initial load ──────────────────────────────────────────────────────────
    loadData();
    window.addEventListener('beforeunload', () => { stopAddPredTimer(); });

})();

// Expose refresh function (optional)
KS.refreshData = function() {
    loadData(false);
};