/**
 * Data Architect study dashboard
 * All content is fetched at runtime from data/da_*.json (never hardcoded here).
 * Progress lives in localStorage under one key, keyed by stable ids, so content
 * files can grow module by module without resetting anything.
 * NOTE: fetch() requires http(s), e.g. `npx serve` locally.
 *
 * Study system: understand (notes, Explain it), remember (recall ratings,
 * Study today queue, recall mode, SM-2 flashcards, quizzes), focus (timer).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'daStudy.v1';
  const DAY = 86400000;
  const VIEWS = ['home', 'materials', 'notes', 'quiz', 'cards'];
  // Recall rating (1-5) -> days until the next review
  const REVIEW_GAP = { 1: 1, 2: 1, 3: 3, 4: 7, 5: 30 };
  const RATING_LABEL = { 1: 'Blank', 2: 'Shaky', 3: 'Partly', 4: 'Solid', 5: 'Easy' };
  const TODAY_CAP = 8;

  const state = {
    syllabus: [],      // merged: da_syllabus.json + overlay
    meta: null,        // da_syllabus_meta.json
    materials: null,
    notes: [],         // domain chapters
    moduleNotes: [],   // per syllabus item, appended over time
    questions: [],
    flashcards: [],
    warnings: [],      // optional files that failed to load
    noteDomain: null,
    route: { view: 'home', arg: null },
    expanded: null,    // syllabus row whose study panel is open
    revealed: new Set(), // recall points revealed this visit
    quiz: null,        // active quiz session
    cards: null,       // active flashcard session
    progress: null
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     PROGRESS PERSISTENCE (localStorage)
     ========================================================= */
  function blankProgress() {
    return {
      done: {}, reread: {}, notesRead: {}, examDate: null, theme: null,
      reviews: {},      // itemId -> [{date, rating}]
      explain: {},      // id -> {text, status: 'clear'|'gaps', updated}
      recall: {},       // note point key -> 'got'|'missed'
      missed: {},       // note point key -> {front, back, source}
      recallMode: false,
      srs: {},          // card id -> SM-2 state
      newPerDay: 20,
      quizStats: {},    // question id -> {right, wrong, last: true|false}
      focus: {},        // itemId -> minutes
      focusLog: [],     // [{date, itemId, min}]
      timer: null       // active focus timer
    };
  }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Object.assign(blankProgress(), raw ? JSON.parse(raw) : {});
    } catch (e) {
      return blankProgress();
    }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); } catch (e) { /* private mode: keep in memory */ }
  }
  function toggle(map, id) {
    state.progress[map][id] = !state.progress[map][id];
    saveProgress();
  }
  function bumpReread(id) {
    state.progress.reread[id] = (state.progress.reread[id] || 0) + 1;
    saveProgress();
  }

  /* =========================================================
     DATA LOADING (data/da_*.json are the single source of truth)
     ========================================================= */
  async function fetchJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return res.json();
  }

  // Keep only entries with a unique id; warn about the rest instead of breaking metrics
  function cleanList(list, label) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter((x) => {
      if (!x || !x.id || seen.has(x.id)) {
        console.warn(`[data-architect] skipped ${label} entry with missing or duplicate id`, x);
        return false;
      }
      seen.add(x.id);
      return true;
    });
  }

  async function loadAll() {
    const [syl, meta] = await Promise.all([fetchJSON('data/da_syllabus.json'), fetchJSON('data/da_syllabus_meta.json')]);
    if (!Array.isArray(syl) || !syl.length) throw new Error('data/da_syllabus.json is empty or malformed');
    state.meta = meta;

    const overlay = meta.items || {};
    state.syllabus = syl.concat(meta.extraItems || []).map((it) => {
      const o = overlay[it.name] || {};
      const link = o.linkOverride || it.link || '';
      return {
        id: slug(it.name),
        name: it.name,
        type: it.type,
        link: /^https?:\/\//.test(link) ? link : '',
        domain: it.domain || o.domain || 'ovr',
        priority: o.priority || 'normal',
        external: !!(it.external || o.external),
        fixed: !!o.linkOverride && o.linkOverride !== it.link,
        note: o.note || ''
      };
    });

    const optional = [
      ['materials', 'data/da_materials.json', null],
      ['notes', 'data/da_notes.json', []],
      ['moduleNotes', 'data/da_module_notes.json', []],
      ['questions', 'data/da_questions.json', []],
      ['flashcards', 'data/da_flashcards.json', []]
    ];
    const results = await Promise.allSettled(optional.map(([, p]) => fetchJSON(p)));
    results.forEach((r, i) => {
      const [key, path, fallback] = optional[i];
      if (r.status === 'fulfilled') state[key] = r.value ?? fallback;
      else { state[key] = fallback; state.warnings.push(path); }
    });
    state.questions = cleanList(state.questions, 'question').filter(validQuestion);
    state.flashcards = cleanList(state.flashcards, 'flashcard').filter((c) => c.front && c.back);
    state.moduleNotes = cleanList(state.moduleNotes, 'module note');
  }

  function letterOf(opt) {
    const m = /^\s*([A-Z])[).:]/.exec(opt);
    return m ? m[1] : null;
  }
  function validQuestion(q) {
    const letters = (q.options || []).map(letterOf);
    const ok = q.question && letters.length >= 2 && letters.every(Boolean) &&
      Array.isArray(q.answer) && q.answer.length && q.answer.every((a) => letters.includes(a));
    if (!ok) console.warn('[data-architect] skipped malformed question', q.id);
    return ok;
  }

  /* =========================================================
     DATES
     ========================================================= */
  function todayLocal() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const todayIso = () => isoDate(todayLocal());
  function addDaysIso(iso, n) {
    const d = parseDate(iso);
    return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }
  // Calendar-day difference; rounding absorbs daylight-saving shifts
  const daysBetween = (fromIso, toIso) => Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY);
  function shortDate(iso) {
    return parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function examDate() {
    return parseDate(state.progress.examDate) || parseDate(state.meta.exam.defaultExamDate);
  }
  function countdown() {
    const exam = examDate();
    return { exam, daysLeft: Math.round((exam - todayLocal()) / DAY) };
  }

  /* =========================================================
     REVISION DIARY (recall ratings -> next review date)
     ========================================================= */
  function lastReview(id) {
    const list = state.progress.reviews[id];
    return list && list.length ? list[list.length - 1] : null;
  }
  function nextDue(id) {
    const last = lastReview(id);
    return last ? addDaysIso(last.date, REVIEW_GAP[last.rating]) : null;
  }
  function rate(id, rating) {
    const list = state.progress.reviews[id] || (state.progress.reviews[id] = []);
    const today = todayIso();
    // One rating per item per day: re-rating today replaces it
    if (list.length && list[list.length - 1].date === today) list.pop();
    list.push({ date: today, rating });
    saveProgress();
  }
  const ratingTone = (r) => (r <= 2 ? 'red' : r === 3 ? 'amber' : 'green');

  function studyToday() {
    const p = state.progress;
    const today = todayIso();
    const rows = [];
    state.syllabus.forEach((it) => {
      const last = lastReview(it.id);
      const due = nextDue(it.id);
      const gaps = p.explain[it.id]?.status === 'gaps';
      let reason = null;
      if (gaps) reason = 'Explanation has gaps';
      else if (due && due <= today) reason = daysBetween(due, today) > 0 ? `Review overdue since ${shortDate(due)}` : 'Review due today';
      else if (p.done[it.id] && !last) reason = 'Finished, not rated yet';
      if (reason) rows.push({ it, reason, rating: last ? last.rating : 2.5, due: due || today, gaps });
    });
    rows.sort((a, b) => (b.gaps - a.gaps) || (a.rating - b.rating) || a.due.localeCompare(b.due));
    return rows;
  }

  /* =========================================================
     METRICS (each one computes its own denominator)
     ========================================================= */
  const domainOf = (id) => (state.meta.domains || []).find((d) => d.id === id) || { id, name: id, weight: 0 };
  const studyDomains = () => (state.meta.domains || []).filter((d) => d.id !== 'ovr');

  function focusThisWeek() {
    const since = addDaysIso(todayIso(), -6);
    return state.progress.focusLog.filter((f) => f.date >= since).reduce((a, f) => a + f.min, 0);
  }
  function metrics() {
    const p = state.progress;
    const syl = state.syllabus;
    const core = state.materials?.core || [];
    const notes = state.notes || [];
    const rated = syl.map((i) => lastReview(i.id)).filter(Boolean);
    const attempted = Object.values(p.quizStats).filter((s) => s.right + s.wrong > 0);
    const m = {
      syllabus: { n: syl.filter((i) => p.done[i.id]).length, d: syl.length },
      core: { n: core.filter((c) => p.done[c.id]).length, d: core.length },
      notes: { n: notes.filter((c) => p.notesRead[c.domain]).length, d: notes.length },
      recall: rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : null,
      quizAcc: attempted.length ? attempted.filter((s) => s.last).length / attempted.length : null,
      questions: state.questions.length,
      flashcards: state.flashcards.length,
      focus: focusThisWeek()
    };
    const parts = [m.syllabus, m.core, m.notes].filter((x) => x.d > 0).map((x) => x.n / x.d);
    if (m.recall !== null) parts.push(m.recall / 5);
    if (m.quizAcc !== null) parts.push(m.quizAcc);
    m.readiness = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null;
    return m;
  }

  /* =========================================================
     RENDER HELPERS
     ========================================================= */
  function checkBtn(kind, id, checked, label) {
    return `<button class="check" type="button" role="checkbox" aria-checked="${checked}" aria-label="${esc(label)}" data-act="${kind}" data-id="${esc(id)}">
      <span class="check__box"><i class="ph ph-check"></i></span></button>`;
  }
  function rereadBtn(id, withLabel) {
    const n = state.progress.reread[id] || 0;
    return `<button class="btn btn--sm" type="button" data-act="reread" data-id="${esc(id)}" aria-label="Mark re-read, ${n} so far"><i class="ph ph-repeat"></i>${withLabel ? 'Re-read' : ''}<span class="count">${n}</span></button>`;
  }
  function openBtn(url, label = 'Open') {
    if (!url) return `<span class="chip chip--warn"><i class="ph ph-link-break"></i>Link needs fixing</span>`;
    return `<a class="btn btn--sm" href="${esc(url)}" target="_blank" rel="noopener"><i class="ph ph-arrow-square-out"></i>${esc(label)}</a>`;
  }
  function topbar() {
    return `<div class="topbar"><span class="topbar__brand"><span class="nav__mark"><i class="ph ph-database"></i></span>Data Architect</span>
      <span class="topbar__actions"><button class="btn btn--sm" type="button" data-act="focus-open" aria-label="Focus timer"><i class="ph ph-timer"></i></button>
      <button class="btn btn--sm" type="button" data-act="theme" aria-label="Switch theme"><i class="ph ph-circle-half"></i></button></span></div>`;
  }
  function banner() {
    if (!state.warnings.length) return '';
    return `<div class="banner" role="status"><i class="ph ph-warning"></i><span>Couldn't load ${state.warnings.map(esc).join(', ')}. The rest of the dashboard still works.</span></div>`;
  }
  function backHead(title, sub) {
    return `<header class="view-head"><a class="btn btn--ghost btn--sm back" href="#home"><i class="ph ph-arrow-left"></i>Syllabus</a><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</header>`;
  }
  const itemById = (id) => state.syllabus.find((i) => i.id === id);
  const itemByName = (name) => state.syllabus.find((i) => i.name === name);
  const countFor = (list, itemName) => list.filter((x) => x.syllabusItem === itemName).length;
  const moduleNotesFor = (itemName) => state.moduleNotes.filter((n) => n.syllabusItem === itemName);
  function noteCount(itemName) {
    return moduleNotesFor(itemName).reduce((a, n) => a + (n.points?.length || 0) + (n.principles?.length || 0) + (n.recall?.length || 0), 0);
  }
  function dueLabel(id) {
    const due = nextDue(id);
    if (!due) return '';
    const d = daysBetween(todayIso(), due);
    return d <= 0 ? 'Review due' : d === 1 ? 'Review tomorrow' : `Review in ${d} days`;
  }

  /* =========================================================
     EXPLAIN IT (Feynman box)
     ========================================================= */
  function explainBox(id, prompt) {
    const e = state.progress.explain[id] || { text: '', status: null };
    return `<section class="explain">
      <label class="explain__label" for="explain-${esc(id)}"><i class="ph ph-chat-text"></i>Explain it in your own words</label>
      <p class="explain__hint">${esc(prompt)}</p>
      <textarea id="explain-${esc(id)}" data-explain="${esc(id)}" rows="5" placeholder="Write it as if teaching a friend who has never used Salesforce.">${esc(e.text)}</textarea>
      <div class="explain__foot">
        <span class="explain__saved" data-saved="${esc(id)}">${e.updated ? `Saved ${shortDate(e.updated)}` : 'Saves as you type'}</span>
        <span class="seg" role="group" aria-label="How clear was your explanation">
          <button type="button" class="seg__btn${e.status === 'clear' ? ' is-on is-green' : ''}" data-act="explain-status" data-id="${esc(id)}" data-val="clear"><i class="ph ph-check-circle"></i>Clear</button>
          <button type="button" class="seg__btn${e.status === 'gaps' ? ' is-on is-red' : ''}" data-act="explain-status" data-id="${esc(id)}" data-val="gaps"><i class="ph ph-warning-circle"></i>Has gaps</button>
        </span>
      </div></section>`;
  }
  let explainTimer = null;
  function onExplainInput(el) {
    const id = el.dataset.explain;
    const e = state.progress.explain[id] || (state.progress.explain[id] = { text: '', status: null });
    e.text = el.value;
    e.updated = todayIso();
    clearTimeout(explainTimer);
    explainTimer = setTimeout(() => {
      saveProgress();
      const s = document.querySelector(`[data-saved="${CSS.escape(id)}"]`);
      if (s) s.textContent = 'Saved';
    }, 400);
  }

  /* =========================================================
     VIEW: HOME / SYLLABUS
     ========================================================= */
  function renderHome() {
    const s = countdown();
    const m = metrics();
    const p = state.progress;
    const C = 2 * Math.PI * 56;
    const ready = m.readiness ?? 0;

    const today = studyToday();
    const todayHtml = today.length
      ? `<ol class="today__list">${today.slice(0, TODAY_CAP).map((r) => {
          const last = lastReview(r.it.id);
          return `<li><button type="button" class="today__row" data-act="open-row" data-id="${r.it.id}">
            <span class="conf conf--${last ? ratingTone(last.rating) : 'none'}" aria-hidden="true"></span>
            <span class="today__text"><span class="today__name">${esc(r.it.name)}</span><span class="today__why">${esc(r.reason)}</span></span>
            <i class="ph ph-caret-right"></i></button></li>`;
        }).join('')}</ol>${today.length > TODAY_CAP ? `<p class="today__more">${today.length - TODAY_CAP} more after these.</p>` : ''}`
      : `<p class="today__empty">Nothing due. Finish a module, then open it and rate how well you can recall it. It comes back here when it's due.</p>`;

    // Exam map: one bar, each segment as wide as the domain's exam weight
    const segs = studyDomains().map((d, i) => {
      const items = state.syllabus.filter((x) => x.domain === d.id);
      const done = items.filter((x) => p.done[x.id]).length;
      return { d, i, items, done, frac: items.length ? done / items.length : 0 };
    });
    const map = `<div class="exam-map__bar" role="list">${segs.map((x) => `<button type="button" role="listitem" class="exam-map__seg" style="--w:${x.d.weight};--f:${x.frac}" data-act="jump" data-id="${x.d.id}" aria-label="${esc(x.d.name)}, ${x.d.weight}% of exam, ${x.done} of ${x.items.length} done"><span class="exam-map__fill"></span><span class="exam-map__pct mono">${x.d.weight}%</span></button>`).join('')}</div>
      <div class="exam-map__legend">${segs.map((x) => `<button type="button" class="exam-map__key" data-act="jump" data-id="${x.d.id}"><span class="exam-map__name">${esc(x.d.name)}</span><span class="mono">${x.done}/${x.items.length}</span></button>`).join('')}</div>`;

    const order = ['ovr'].concat(studyDomains().map((d) => d.id));
    const groups = order.map((did, gi) => {
      const items = state.syllabus.filter((i) => i.domain === did);
      if (!items.length) return '';
      const d = domainOf(did);
      const done = items.filter((i) => p.done[i.id]).length;
      const open = did === 'ovr' || items.some((i) => i.id === state.expanded);
      return `<details class="group panel enter" style="--i:${gi + 4}" id="group-${did}"${open ? ' open' : ''}>
        <summary><h3>${esc(d.name)}</h3>${d.weight ? `<span class="chip">${d.weight}%</span>` : ''}<span class="grow"></span><span class="mono">${done}/${items.length}</span><i class="ph ph-caret-down"></i></summary>
        <div class="items">${items.map(renderItem).join('')}</div></details>`;
    }).join('');

    const history = Object.entries(p.reviews)
      .flatMap(([id, list]) => list.map((r) => ({ id, ...r })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40);

    return `${topbar()}${banner()}
      <header class="view-head enter" style="--i:0"><h1>Syllabus</h1><p>Every module and document on the official trailmix, grouped by exam domain. Open a module to rate your recall, explain it, or start a focus session.</p></header>
      <section class="bento" aria-label="Overview">
        <article class="panel bento__count enter" style="--i:1">
          <div class="countdown__num"><span class="mono">${Math.max(s.daysLeft, 0)}</span><span>days to the exam<br>${s.exam.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })}</span></div>
          ${s.daysLeft < 0 ? '<p class="countdown__past">This date has passed. Set your next exam date below.</p>' : ''}
          <div class="date-field"><label for="examDate">Exam date</label><input type="date" id="examDate" value="${isoDate(s.exam)}"></div>
        </article>
        <article class="panel bento__ready enter" style="--i:2">
          <div class="ring" role="img" aria-label="Readiness ${ready} percent" style="--c:${C};--off:${C * (1 - ready / 100)}">
            <svg viewBox="0 0 132 132"><circle class="ring__track" cx="66" cy="66" r="56"/><circle class="ring__fill" cx="66" cy="66" r="56" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ready / 100)}"/></svg>
            <div class="ring__label"><span class="mono">${ready}%</span><small>ready</small></div>
          </div>
          <dl class="metrics">
            <div><dt>Syllabus</dt><dd>${m.syllabus.n}/${m.syllabus.d}</dd></div>
            <div><dt>Core reading</dt><dd>${m.core.n}/${m.core.d}</dd></div>
            <div><dt>Avg recall</dt><dd class="${m.recall === null ? 'is-empty' : ''}">${m.recall === null ? 'None yet' : m.recall.toFixed(1) + ' / 5'}</dd></div>
            <div><dt>Quiz accuracy</dt><dd class="${m.quizAcc === null ? 'is-empty' : ''}">${m.quizAcc === null ? 'None yet' : Math.round(m.quizAcc * 100) + '%'}</dd></div>
            <div><dt>Focus, 7 days</dt><dd>${m.focus} min</dd></div>
          </dl>
        </article>
        <article class="panel bento__today today enter" style="--i:3" aria-labelledby="todayTitle">
          <div class="today__head">${today.length ? '<span class="live" aria-hidden="true"></span>' : ''}<h2 id="todayTitle">Study today</h2><span class="mono">${today.length}</span></div>
          ${todayHtml}
        </article>
        <article class="panel bento__map exam-map enter" style="--i:4" aria-labelledby="mapTitle">
          <div class="exam-map__head"><h2 id="mapTitle">Exam map</h2><span>Bar width is each domain's share of the exam. The fill is how much of it you've finished.</span></div>
          ${map}
        </article>
      </section>
      ${groups}
      <details class="group panel history">
        <summary><h3>Review history</h3><span class="grow"></span><span class="mono">${history.length}</span><i class="ph ph-caret-down"></i></summary>
        ${history.length ? `<div class="history__list">${history.map((h) => `<div class="history__row"><span class="mono">${shortDate(h.date)}</span><span class="history__name">${esc(itemById(h.id)?.name || h.id)}</span><span class="chip chip--${ratingTone(h.rating)}">${h.rating} ${RATING_LABEL[h.rating]}</span></div>`).join('')}</div>` : '<p class="today__empty history__empty">Ratings you give appear here, newest first.</p>'}
      </details>`;
  }

  function renderItem(it) {
    const p = state.progress;
    const done = !!p.done[it.id];
    const isModule = it.type === 'Module';
    const q = countFor(state.questions, it.name);
    const f = countFor(state.flashcards, it.name);
    const n = noteCount(it.name);
    const last = lastReview(it.id);
    const open = state.expanded === it.id;
    const chips = [
      `<span class="chip${isModule ? ' chip--accent' : ''}">${isModule ? '<i class="ph ph-graduation-cap"></i>Trailhead' : '<i class="ph ph-file-text"></i>Doc'}</span>`,
      last ? `<span class="chip chip--${ratingTone(last.rating)}">${last.rating}/5 ${dueLabel(it.id)}</span>` : '',
      p.explain[it.id]?.status === 'gaps' ? '<span class="chip chip--red"><i class="ph ph-warning-circle"></i>Gaps</span>' : '',
      p.focus[it.id] ? `<span class="chip"><i class="ph ph-clock"></i>${p.focus[it.id]} min</span>` : '',
      it.priority === 'low' ? '<span class="chip">Low priority</span>' : '',
      it.external ? '<span class="chip">Third party</span>' : '',
      it.fixed && it.note ? '<span class="chip chip--ok"><i class="ph ph-link"></i>Link updated</span>' : ''
    ].join('');
    return `<div class="item${done ? ' is-done' : ''}${open ? ' is-open' : ''}" id="row-${it.id}">
      ${checkBtn('done', it.id, done, `Mark ${it.name} done`)}
      <div class="item__body">
        <button type="button" class="item__name" data-act="expand" data-id="${it.id}" aria-expanded="${open}">${esc(it.name)}<i class="ph ph-caret-down"></i></button>
        <div class="item__meta">${chips}</div>${it.note ? `<span class="item__note">${esc(it.note)}</span>` : ''}</div>
      <div class="item__actions">
        ${isModule || q ? `<a class="btn btn--sm btn--quiz" href="#quiz/${esc(it.id)}" aria-label="Quiz, ${q} questions"><i class="ph ph-list-checks"></i>Quiz<span class="count">${q}</span></a>` : ''}
        ${isModule || f ? `<a class="btn btn--sm btn--cards" href="#cards/${esc(it.id)}" aria-label="Flashcards, ${f} cards"><i class="ph ph-cards"></i>Flashcards<span class="count">${f}</span></a>` : ''}
        ${isModule || n ? `<a class="btn btn--sm btn--notes" href="#notes/${esc(it.id)}" aria-label="Notes, ${n} points"><i class="ph ph-notebook"></i>Notes<span class="count">${n}</span></a>` : ''}
        ${openBtn(it.link, isModule ? 'Trail' : 'Open')}
      </div>
      ${open ? renderPanel(it) : ''}
    </div>`;
  }

  function renderPanel(it) {
    const last = lastReview(it.id);
    const rateBtns = [1, 2, 3, 4, 5].map((r) => `<button type="button" class="rate rate--${ratingTone(r)}${last && last.date === todayIso() && last.rating === r ? ' is-on' : ''}" data-act="rate" data-id="${it.id}" data-val="${r}"><span class="mono">${r}</span><small>${RATING_LABEL[r]}</small></button>`).join('');
    return `<div class="study-panel">
      <section class="panel__block">
        <h4>How well can you recall this without looking?</h4>
        <div class="rates" role="group" aria-label="Recall rating">${rateBtns}</div>
        <p class="panel__hint">${last ? `Last rated ${last.rating}/5 on ${shortDate(last.date)}. ${dueLabel(it.id)}.` : 'Rate it after you finish the module. Low ratings come back tomorrow, high ones in a week or a month.'}</p>
      </section>
      ${explainBox(it.id, `What is "${it.name}" about, and when would an architect use it?`)}
      <section class="panel__block panel__row">
        ${rereadBtn(it.id, true)}
        <button class="btn btn--sm" type="button" data-act="focus-start" data-id="${it.id}" data-val="25"><i class="ph ph-timer"></i>Focus 25 min</button>
        <button class="btn btn--sm" type="button" data-act="focus-start" data-id="${it.id}" data-val="50"><i class="ph ph-timer"></i>Focus 50 min</button>
      </section>
    </div>`;
  }

  /* =========================================================
     VIEW: MATERIALS
     ========================================================= */
  function renderMaterials() {
    const mat = state.materials;
    if (!mat) return `${topbar()}${banner()}<div class="card error-card"><h2>Materials not available</h2><p>data/da_materials.json didn't load.</p></div>`;
    const p = state.progress;
    const core = mat.core.map((c) => `<article class="core__card">
        <div class="core__top"><h3>${esc(c.title)}</h3><span class="chip">${esc(domainOf(c.domain).name)}</span></div>
        <p>${esc(c.why)}</p>
        <div class="core__links">${c.links.map((l) => openBtn(l.url, l.label)).join('')}</div>
        <div class="core__foot"><span class="done-label">${checkBtn('done', c.id, !!p.done[c.id], `Mark ${c.title} read`)}${p.done[c.id] ? 'Read' : 'Not read yet'}</span>${rereadBtn(c.id)}</div>
      </article>`).join('');
    const res = mat.resources.map((r) => `<div class="card res">
        <div class="res__body"><span class="res__title">${esc(r.title)}</span>
          <div class="item__meta"><span class="chip">${esc(r.type)}</span><span class="chip">${r.free ? 'Free' : 'Paid'}</span></div></div>
        <div class="res__actions">${checkBtn('done', r.id, !!p.done[r.id], `Mark ${r.title} done`)}${openBtn(r.url)}</div></div>`).join('');
    const avoid = (mat.avoid || []).map((a) => `<li><strong>${esc(a.name)}.</strong> ${esc(a.reason)}</li>`).join('');
    return `${topbar()}${banner()}
      <header class="view-head"><h1>Materials</h1><p>Start with the five documents that most exam questions come from. Everything else supports them.</p></header>
      <h2 class="section-title" style="margin-top:0">High-yield core</h2>
      <section class="core">${core}</section>
      <h2 class="section-title">More resources</h2>
      <section class="res-list">${res}</section>
      ${avoid ? `<section class="avoid"><h3><i class="ph ph-prohibit"></i>Avoid: brain dumps</h3><ul>${avoid}</ul></section>` : ''}`;
  }

  /* =========================================================
     RECALL MODE (notes hidden behind tap-to-reveal)
     ========================================================= */
  function cueOf(text) {
    const colon = text.indexOf(':');
    if (colon > 0 && colon <= 48) return text.slice(0, colon);
    const q = text.indexOf('?');
    if (q > 0 && q <= 120) return text.slice(0, q + 1);
    return text.split(/\s+/).slice(0, 4).join(' ') + '...';
  }
  function recallPoint(key, front, back, source) {
    const p = state.progress;
    const shown = state.revealed.has(key);
    const mark = p.recall[key];
    return `<li class="recall${mark ? ' recall--' + mark : ''}">
      ${shown
        ? `<div class="recall__answer"><span class="recall__cue">${esc(front)}</span><span>${esc(back)}</span></div>
           <span class="seg recall__grade">
             <button type="button" class="seg__btn${mark === 'got' ? ' is-on is-green' : ''}" data-act="recall-mark" data-id="${esc(key)}" data-val="got" data-front="${esc(front)}" data-back="${esc(back)}" data-source="${esc(source)}"><i class="ph ph-check"></i>Got it</button>
             <button type="button" class="seg__btn${mark === 'missed' ? ' is-on is-red' : ''}" data-act="recall-mark" data-id="${esc(key)}" data-val="missed" data-front="${esc(front)}" data-back="${esc(back)}" data-source="${esc(source)}"><i class="ph ph-x"></i>Missed</button>
           </span>`
        : `<button type="button" class="recall__hidden" data-act="reveal" data-id="${esc(key)}"><span class="recall__cue">${esc(front)}</span><span class="recall__tap"><i class="ph ph-eye"></i>Recall, then tap</span></button>`}
    </li>`;
  }
  // A note point is plain text; in recall mode its cue is shown and the rest hidden
  function pointList(arr, keyBase, source, cls = '') {
    if (!state.progress.recallMode) return `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<ul class="recall-list ${cls}">${arr.map((x, i) => recallPoint(`${keyBase}:${i}`, cueOf(x), x, source)).join('')}</ul>`;
  }
  function recallToggle() {
    const on = state.progress.recallMode;
    return `<button type="button" class="btn btn--sm${on ? ' btn--primary' : ''}" data-act="recall-toggle" aria-pressed="${on}"><i class="ph ${on ? 'ph-eye-slash' : 'ph-brain'}"></i>${on ? 'Recall mode on' : 'Recall mode'}</button>`;
  }
  function recallScore(prefix) {
    const marks = Object.entries(state.progress.recall).filter(([k]) => k.startsWith(prefix + ':'));
    if (!marks.length) return '';
    const got = marks.filter(([, v]) => v === 'got').length;
    return `<span class="chip">${got}/${marks.length} recalled</span>`;
  }

  /* =========================================================
     VIEW: NOTES (domain chapters, and module notes at #notes/<item>)
     ========================================================= */
  function renderNotes() {
    if (state.route.arg) return renderModuleNotes(itemById(state.route.arg));
    const notes = state.notes;
    if (!notes.length) return `${topbar()}${banner()}<div class="card empty"><div class="empty__icon"><i class="ph ph-notebook"></i></div><h2>No notes yet</h2><p>Add chapters to data/da_notes.json.</p></div>`;
    if (!state.noteDomain || !notes.some((n) => n.domain === state.noteDomain)) state.noteDomain = notes[0].domain;
    const ch = notes.find((n) => n.domain === state.noteDomain);
    const p = state.progress;
    const read = !!p.notesRead[ch.domain];
    const rid = `notes-${ch.domain}`;
    const block = (icon, title, body) => `<section class="note-block"><h3><i class="ph ${icon}"></i>${title}</h3>${body}</section>`;
    const src = ch.title;

    const pills = notes.map((n) => `<button type="button" class="pill" data-act="chapter" data-id="${n.domain}" aria-pressed="${n.domain === ch.domain}">${p.notesRead[n.domain] ? '<i class="ph ph-check"></i>' : ''}${esc(domainOf(n.domain).name)}</button>`).join('');
    const withNotes = state.syllabus.filter((i) => noteCount(i.name));
    const numbers = p.recallMode
      ? pointList(ch.numbers || [], `${rid}:numbers`, src)
      : `<div class="numbers">${(ch.numbers || []).map((x) => `<div>${esc(x)}</div>`).join('')}</div>`;

    return `${topbar()}${banner()}
      <header class="view-head"><h1>Notes</h1><p>Read a chapter once, then switch on recall mode: try to recall each point before you reveal it.</p></header>
      <nav class="pills" aria-label="Chapters">${pills}</nav>
      <article class="card chapter">
        <div class="chapter__head"><h2>${esc(ch.title)}</h2>
          <div class="item__meta">${recallScore(rid)}<span class="chip">${domainOf(ch.domain).weight}% of exam</span>${ch.status === 'draft' ? '<span class="chip chip--warn">Draft: check against sources</span>' : ''}${recallToggle()}</div></div>
        ${ch.verified ? `<p class="chapter__flag"><i class="ph ph-seal-check"></i> ${esc(ch.verified)}</p>` : ''}
        ${ch.concepts?.length ? block('ph-lightbulb', 'Key concepts', pointList(ch.concepts, `${rid}:concepts`, src)) : ''}
        ${ch.rules?.length ? block('ph-git-branch', 'Decision rules', pointList(ch.rules, `${rid}:rules`, src)) : ''}
        ${ch.numbers?.length ? block('ph-hash', 'Numbers to memorize', numbers) : ''}
        ${ch.traps?.length ? block('ph-warning', 'Exam traps', pointList(ch.traps, `${rid}:traps`, src, 'traps')) : ''}
        ${ch.keywords?.length ? block('ph-key', 'Scenario keywords', pointList(ch.keywords, `${rid}:keywords`, src)) : ''}
        ${ch.sources?.length ? block('ph-link', 'Sources', `<div class="sources">${ch.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ''))}</a>`).join('')}</div>`) : ''}
        ${explainBox(rid, `Explain ${ch.title} to a friend in a few sentences. Where you get stuck is what to study next.`)}
        <div class="chapter__foot">
          <button class="btn ${read ? '' : 'btn--primary'}" type="button" data-act="noteread" data-id="${ch.domain}"><i class="ph ${read ? 'ph-check-circle' : 'ph-check'}"></i>${read ? 'Read' : 'Mark as read'}</button>
          ${rereadBtn(rid, true)}
        </div>
      </article>
      ${withNotes.length ? `<h2 class="section-title">Module notes</h2><div class="decks">${withNotes.map((i) => `<a class="card deck" href="#notes/${i.id}"><span class="deck__name">${esc(i.name)}</span><span class="mono">${noteCount(i.name)} points</span></a>`).join('')}</div>` : ''}`;
  }

  function renderModuleNotes(item) {
    if (!item) return `${topbar()}${backHead('Notes not found', '')}`;
    const entries = moduleNotesFor(item.name);
    const points = entries.flatMap((e) => e.points || []);
    const principles = entries.flatMap((e) => e.principles || []);
    const pairs = entries.flatMap((e) => e.recall || []);
    const key = `mod-${item.id}`;
    const p = state.progress;
    const pairHtml = pairs.length
      ? `<section class="note-block"><h3><i class="ph ph-question"></i>Recall questions</h3><ul class="recall-list">${pairs.map((pr, i) => recallPoint(`${key}:qa:${i}`, pr.q, pr.a, item.name)).join('')}</ul></section>`
      : '';
    return `${topbar()}${banner()}${backHead(item.name, `Your notes for this ${item.type === 'Module' ? 'Trailhead module' : 'document'}.`)}
      ${entries.length ? `<article class="card chapter">
        <div class="chapter__head"><h2>Notes</h2><div class="item__meta">${recallScore(key)}${recallToggle()}</div></div>
        ${points.length ? `<section class="note-block"><h3><i class="ph ph-lightbulb"></i>Key concepts</h3>${pointList(points, `${key}:pts`, item.name)}</section>` : ''}
        ${principles.length ? `<section class="note-block"><h3><i class="ph ph-git-branch"></i>Core principles</h3>${pointList(principles, `${key}:prn`, item.name)}</section>` : ''}
        ${pairHtml}
        ${explainBox(item.id, `What is "${item.name}" about, and when would an architect use it?`)}
        <div class="chapter__foot">
          <button class="btn ${p.notesRead[item.id] ? '' : 'btn--primary'}" type="button" data-act="noteread" data-id="${item.id}"><i class="ph ph-check"></i>${p.notesRead[item.id] ? 'Read' : 'Mark as read'}</button>
          ${rereadBtn(item.id, true)}
        </div>
      </article>` : `<div class="card empty"><div class="empty__icon"><i class="ph ph-notebook"></i></div><h2>No notes here yet</h2><p>Paste your notes for this module into the da-ingest agent and they appear here.</p>${explainBox(item.id, `What is "${item.name}" about, and when would an architect use it?`)}</div>`}`;
  }

  /* =========================================================
     VIEW: QUIZ (practice with instant feedback, or a timed mock)
     ========================================================= */
  function quizPool(scope) {
    const qs = state.questions;
    if (scope === 'all') return qs;
    if (scope === 'wrong') return qs.filter((q) => state.progress.quizStats[q.id]?.last === false);
    const item = itemById(scope);
    return item ? qs.filter((q) => q.syllabusItem === item.name) : [];
  }
  // Mock exam: questions drawn per domain in proportion to the exam weights
  function mockPool() {
    const total = Math.min(60, state.questions.length);
    const picked = [];
    const byDomain = studyDomains().map((d) => ({ d, pool: shuffle(state.questions.filter((q) => q.domain === d.id)) }));
    byDomain.forEach(({ d, pool }) => picked.push(...pool.slice(0, Math.round((total * d.weight) / 100))));
    const rest = shuffle(state.questions.filter((q) => !picked.includes(q)));
    while (picked.length < total && rest.length) picked.push(rest.pop());
    return shuffle(picked.slice(0, total));
  }
  function startQuiz(scope, mode) {
    const pool = mode === 'mock' ? mockPool() : shuffle(quizPool(scope));
    if (!pool.length) return;
    const minutes = Math.ceil((state.meta.exam.minutes * pool.length) / state.meta.exam.questions);
    state.quiz = { scope, mode, ids: pool.map((q) => q.id), idx: 0, picks: {}, checked: {}, endAt: mode === 'mock' ? Date.now() + minutes * 60000 : null, finished: false };
  }
  const qById = (id) => state.questions.find((q) => q.id === id);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  function recordAnswer(q, picks) {
    const ok = sameSet(picks, q.answer);
    const s = state.progress.quizStats[q.id] || (state.progress.quizStats[q.id] = { right: 0, wrong: 0, last: null });
    if (ok) s.right++; else s.wrong++;
    s.last = ok;
    saveProgress();
    return ok;
  }

  function renderQuiz() {
    const scope = state.route.arg;
    const item = scope && scope !== 'all' && scope !== 'wrong' ? itemById(scope) : null;
    const z = state.quiz;
    if (z && z.scope === (scope || 'all') && !z.finished) return renderQuestion(z, item);
    if (z && z.scope === (scope || 'all') && z.finished) return renderQuizResult(z, item);

    if (item) {
      const pool = quizPool(item.id);
      return `${topbar()}${banner()}${backHead(item.name, `Quiz questions for this ${item.type === 'Module' ? 'Trailhead module' : 'document'}.`)}
        <div class="card empty">
          <div class="empty__icon"><i class="ph ph-list-checks"></i></div>
          <h2>${pool.length ? `${pool.length} questions` : 'No questions here yet'}</h2>
          <p>${pool.length ? 'Practice mode: answer, check, read the explanation. Wrong answers go into your review queue.' : 'Paste your quiz for this module into the da-ingest agent and it appears here.'}</p>
          ${pool.length ? `<button class="btn btn--primary" type="button" data-act="quiz-start" data-id="${item.id}" data-val="practice"><i class="ph ph-play"></i>Start practice</button>` : ''}
        </div>`;
    }

    const all = state.questions;
    const wrong = quizPool('wrong');
    const perItem = state.syllabus.map((i) => ({ i, n: countFor(all, i.name) })).filter((x) => x.n);
    const minutes = Math.ceil((state.meta.exam.minutes * Math.min(60, all.length)) / state.meta.exam.questions);
    return `${topbar()}${banner()}
      <header class="view-head"><h1>Quiz</h1><p>Mixing modules in one session is harder than drilling one topic, and it sticks better.</p></header>
      ${all.length ? `<section class="quiz-modes">
        <button class="card mode" type="button" data-act="quiz-start" data-id="all" data-val="practice"><i class="ph ph-shuffle"></i><strong>Mixed practice</strong><span>All ${all.length} questions, shuffled across modules, with instant feedback.</span></button>
        <button class="card mode" type="button" data-act="quiz-start" data-id="wrong" data-val="practice"${wrong.length ? '' : ' disabled'}><i class="ph ph-arrow-counter-clockwise"></i><strong>Wrong answers</strong><span>${wrong.length ? `${wrong.length} questions you missed last time.` : 'Nothing to redo yet.'}</span></button>
        <button class="card mode" type="button" data-act="quiz-start" data-id="all" data-val="mock"><i class="ph ph-alarm"></i><strong>Mock exam</strong><span>${Math.min(60, all.length)} questions weighted like the real exam, ${minutes} minutes, scored at the end.</span></button>
      </section>
      <h2 class="section-title">By module</h2>
      <div class="decks">${perItem.map((x) => `<a class="card deck" href="#quiz/${x.i.id}"><span class="deck__name">${esc(x.i.name)}</span><span class="mono">${x.n} questions</span></a>`).join('')}</div>`
      : `<div class="card empty"><div class="empty__icon"><i class="ph ph-list-checks"></i></div><h2>No questions yet</h2><p>As you finish each Trailhead module, paste its quiz into the da-ingest agent. Questions show up here and on the module's row.</p></div>`}`;
  }

  function renderQuestion(z, item) {
    const q = qById(z.ids[z.idx]);
    const picks = z.picks[q.id] || [];
    const checked = z.mode === 'practice' && z.checked[q.id];
    const multi = q.answer.length > 1;
    const left = z.endAt ? Math.max(0, z.endAt - Date.now()) : null;
    const opts = q.options.map((o) => {
      const L = letterOf(o);
      const on = picks.includes(L);
      let cls = on ? ' is-picked' : '';
      if (checked) cls += q.answer.includes(L) ? ' is-right' : on ? ' is-wrong' : '';
      return `<button type="button" class="option${cls}" data-act="quiz-pick" data-val="${L}"${checked ? ' disabled' : ''}><span class="option__letter mono">${L}</span><span>${esc(o.replace(/^\s*[A-Z][).:]\s*/, ''))}</span></button>`;
    }).join('');
    const ok = checked && sameSet(picks, q.answer);
    const last = z.idx === z.ids.length - 1;
    return `${topbar()}
      <div class="quiz-top">
        <button class="btn btn--sm" type="button" data-act="quiz-exit"><i class="ph ph-x"></i>Exit</button>
        <span class="mono">${z.idx + 1} / ${z.ids.length}</span>
        ${left !== null ? `<span class="chip mono" id="quizClock">${fmtClock(left)}</span>` : `<span class="chip">${z.mode === 'mock' ? 'Mock' : 'Practice'}</span>`}
      </div>
      <article class="card question">
        <div class="item__meta"><span class="chip">${esc(domainOf(q.domain).name)}</span>${item ? '' : `<span class="chip">${esc(q.syllabusItem || '')}</span>`}${multi ? `<span class="chip chip--accent">Choose ${q.answer.length}</span>` : ''}</div>
        <p class="question__text">${esc(q.question)}</p>
        <div class="options">${opts}</div>
        ${checked ? `<div class="feedback feedback--${ok ? 'ok' : 'bad'}"><strong>${ok ? 'Correct' : `Not quite. Answer: ${q.answer.join(', ')}`}</strong>${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}${q.source ? `<a href="${esc(q.source)}" target="_blank" rel="noopener">Source</a>` : ''}</div>` : ''}
        <div class="question__foot">
          ${z.mode === 'mock' && z.idx > 0 ? '<button class="btn" type="button" data-act="quiz-prev"><i class="ph ph-arrow-left"></i>Back</button>' : '<span></span>'}
          ${z.mode === 'practice' && !checked
            ? `<button class="btn btn--primary" type="button" data-act="quiz-check"${picks.length ? '' : ' disabled'}>Check</button>`
            : `<button class="btn btn--primary" type="button" data-act="${last ? 'quiz-finish' : 'quiz-next'}">${last ? (z.mode === 'mock' ? 'Submit exam' : 'Finish') : 'Next'}<i class="ph ph-arrow-right"></i></button>`}
        </div>
      </article>`;
  }

  function renderQuizResult(z, item) {
    const rows = z.ids.map((id) => { const q = qById(id); return { q, ok: sameSet(z.picks[id] || [], q.answer) }; });
    const right = rows.filter((r) => r.ok).length;
    const pctScore = Math.round((right / rows.length) * 100);
    const pass = state.meta.exam.passingScore;
    const byDomain = studyDomains().map((d) => {
      const r = rows.filter((x) => x.q.domain === d.id);
      return r.length ? `<div><dt>${esc(d.name)}</dt><dd>${r.filter((x) => x.ok).length}/${r.length}</dd></div>` : '';
    }).join('');
    const wrong = rows.filter((r) => !r.ok);
    return `${topbar()}${item ? backHead(item.name, '') : '<header class="view-head"><h1>Quiz results</h1></header>'}
      <section class="card result">
        <div class="result__score"><span class="mono">${pctScore}%</span><span>${right} of ${rows.length} correct${z.mode === 'mock' ? `. The exam pass mark is ${pass}%.` : '.'}</span></div>
        <dl class="metrics">${byDomain}</dl>
        <div class="panel__row"><button class="btn btn--primary" type="button" data-act="quiz-again"><i class="ph ph-arrow-clockwise"></i>Go again</button>${wrong.length ? '<button class="btn" type="button" data-act="quiz-start" data-id="wrong" data-val="practice"><i class="ph ph-arrow-counter-clockwise"></i>Redo wrong ones</button>' : ''}<button class="btn" type="button" data-act="quiz-exit">Done</button></div>
      </section>
      ${wrong.length && z.mode === 'mock' ? `<h2 class="section-title">Review your misses</h2>${wrong.map((r) => `<article class="card question"><p class="question__text">${esc(r.q.question)}</p><p><strong>Answer: ${r.q.answer.join(', ')}</strong> (you picked ${(z.picks[r.q.id] || []).join(', ') || 'nothing'})</p>${r.q.explanation ? `<p class="panel__hint">${esc(r.q.explanation)}</p>` : ''}</article>`).join('')}` : ''}`;
  }
  function fmtClock(ms) {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  }

  /* =========================================================
     FLASHCARDS (SM-2, ported from js/quizzlet.js; separate from the quiz)
     ========================================================= */
  function sm2Update(s0, quality) {
    const s = Object.assign({}, s0);
    if (quality < 3) {
      s.repetitions = 0;
      s.interval = 1;
      s.lapses = (s.lapses || 0) + 1;
    } else {
      s.repetitions += 1;
      if (s.repetitions === 1) s.interval = 1;
      else if (s.repetitions === 2) s.interval = 6;
      else s.interval = Math.round(s.interval * s.easeFactor);
      s.easeFactor = Math.max(1.3, s.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    }
    s.dueDate = addDaysIso(todayIso(), s.interval);
    return s;
  }
  const srsOf = (id) => state.progress.srs[id] || { interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: todayIso(), lapses: 0 };
  const isNew = (id) => !state.progress.srs[id];

  function missedDeck() {
    return Object.entries(state.progress.missed).map(([key, c]) => ({ id: `missed:${key}`, front: c.front, back: c.back, syllabusItem: c.source, missed: true }));
  }
  function deckFor(scope) {
    if (scope === 'missed') return missedDeck();
    if (scope === 'all') return state.flashcards;
    const item = itemById(scope);
    return item ? state.flashcards.filter((c) => c.syllabusItem === item.name) : [];
  }
  function deckStats(cards) {
    const today = todayIso();
    return { due: cards.filter((c) => !isNew(c.id) && srsOf(c.id).dueDate <= today).length, fresh: cards.filter((c) => isNew(c.id)).length, total: cards.length };
  }
  function startCards(scope, cram) {
    const cards = deckFor(scope);
    const today = todayIso();
    const queue = cram
      ? shuffle(cards)
      : shuffle(cards.filter((c) => !isNew(c.id) && srsOf(c.id).dueDate <= today)).concat(shuffle(cards.filter((c) => isNew(c.id))).slice(0, state.progress.newPerDay));
    state.cards = { scope, queue, idx: 0, flipped: false, graded: 0, again: 0 };
  }
  function gradeCard(quality) {
    const s = state.cards;
    const card = s.queue[s.idx];
    state.progress.srs[card.id] = sm2Update(srsOf(card.id), quality);
    saveProgress();
    s.graded++;
    if (quality === 0) { s.again++; s.queue.push(card); }
    s.idx++;
    s.flipped = false;
  }

  function renderCards() {
    const scope = state.route.arg || null;
    const item = scope && !['all', 'missed'].includes(scope) ? itemById(scope) : null;
    const s = state.cards;
    if (s && s.scope === (scope || 'all')) return renderCardSession(s, item);

    if (scope) {
      const cards = deckFor(scope);
      const st = deckStats(cards);
      const title = item ? item.name : scope === 'missed' ? 'Missed from notes' : 'All flashcards';
      const nextDueIso = cards.filter((c) => !isNew(c.id)).map((c) => srsOf(c.id).dueDate).sort()[0];
      return `${topbar()}${banner()}${backHead(title, item ? `Flashcards for this ${item.type === 'Module' ? 'Trailhead module' : 'document'}. One fact per card.` : '')}
        <div class="card empty">
          <div class="empty__icon"><i class="ph ph-cards"></i></div>
          <h2>${st.total ? `${st.due} due, ${st.fresh} new` : 'No flashcards here yet'}</h2>
          <p>${st.total
            ? (st.due + st.fresh ? `Recall the answer before you flip. Then grade yourself honestly: cards you miss come back sooner.` : `All caught up. Next card is due ${nextDueIso ? shortDate(nextDueIso) : 'later'}.`)
            : scope === 'missed' ? 'Points you mark "Missed" in recall mode collect here.' : 'Paste your flashcards for this module into the da-ingest agent and they appear here.'}</p>
          ${st.total ? `<div class="panel__row">${st.due + st.fresh ? `<button class="btn btn--primary" type="button" data-act="cards-start" data-id="${esc(scope)}"><i class="ph ph-play"></i>Start review</button>` : ''}<button class="btn" type="button" data-act="cards-cram" data-id="${esc(scope)}"><i class="ph ph-shuffle"></i>Go through all ${st.total}</button></div>` : ''}
        </div>`;
    }

    const decks = state.syllabus.map((i) => ({ i, cards: deckFor(i.id) })).filter((x) => x.cards.length);
    const all = deckStats(state.flashcards);
    const missed = missedDeck();
    return `${topbar()}${banner()}
      <header class="view-head"><h1>Flashcards</h1><p>One deck per module, scheduled with spaced repetition. Review what's due every day, even for 10 minutes.</p></header>
      <section class="quiz-modes">
        <button class="card mode" type="button" data-act="cards-start" data-id="all"${all.due + all.fresh ? '' : ' disabled'}><i class="ph ph-shuffle"></i><strong>Review all due</strong><span>${all.total ? `${all.due} due and ${all.fresh} new, mixed across modules.` : 'No cards yet.'}</span></button>
        <a class="card mode" href="#cards/missed"><i class="ph ph-crosshair"></i><strong>Missed from notes</strong><span>${missed.length ? `${missed.length} ${missed.length === 1 ? 'point' : 'points'} you missed in recall mode.` : 'Points you miss in recall mode land here.'}</span></a>
      </section>
      <div class="new-cap"><label for="newPerDay">New cards per session</label><input type="number" id="newPerDay" min="1" max="100" value="${state.progress.newPerDay}"></div>
      ${decks.length ? `<h2 class="section-title">By module</h2><div class="decks">${decks.map((x) => { const st = deckStats(x.cards); return `<a class="card deck" href="#cards/${x.i.id}"><span class="deck__name">${esc(x.i.name)}</span><span class="mono">${st.due} due · ${st.fresh} new</span></a>`; }).join('')}</div>`
        : `<div class="card empty"><div class="empty__icon"><i class="ph ph-cards"></i></div><h2>No decks yet</h2><p>As you finish each Trailhead module, paste its flashcards into the da-ingest agent. Each module gets its own deck.</p></div>`}`;
  }

  function renderCardSession(s, item) {
    const card = s.queue[s.idx];
    if (!card) {
      return `${topbar()}${item ? backHead(item.name, '') : '<header class="view-head"><h1>Session done</h1></header>'}
        <div class="card empty"><div class="empty__icon"><i class="ph ph-check-circle"></i></div><h2>${s.graded} cards reviewed</h2>
        <p>${s.again ? `${s.again} needed another pass.` : 'No misses this round.'} Come back tomorrow for the next due cards.</p>
        <div class="panel__row"><button class="btn btn--primary" type="button" data-act="cards-exit">Done</button></div></div>`;
    }
    const remaining = s.queue.length - s.idx;
    return `${topbar()}
      <div class="quiz-top"><button class="btn btn--sm" type="button" data-act="cards-exit"><i class="ph ph-x"></i>Exit</button><span class="mono">${remaining} left</span><span class="chip">${esc(card.syllabusItem || '')}</span></div>
      <button type="button" class="flash${s.flipped ? ' is-flipped' : ''}" data-act="cards-flip" aria-label="${s.flipped ? 'Answer shown' : 'Show answer'}">
        <span class="flash__face flash__front"><small>Question</small><span>${esc(card.front)}</span><em>Recall it, then tap to flip</em></span>
        <span class="flash__face flash__back"><small>Answer</small><span>${esc(card.back)}</span>${card.mnemonic ? `<em><i class="ph ph-lightbulb"></i> ${esc(card.mnemonic)}</em>` : ''}</span>
      </button>
      ${s.flipped ? `<div class="grades" role="group" aria-label="How well did you recall it">
        <button type="button" class="grade grade--red" data-act="cards-grade" data-val="0">Again<small>1</small></button>
        <button type="button" class="grade grade--amber" data-act="cards-grade" data-val="3">Hard<small>2</small></button>
        <button type="button" class="grade grade--green" data-act="cards-grade" data-val="4">Good<small>3</small></button>
        <button type="button" class="grade grade--accent" data-act="cards-grade" data-val="5">Easy<small>4</small></button>
      </div>` : '<p class="panel__hint flash__hint">Space flips the card. Keys 1 to 4 grade it.</p>'}`;
  }

  /* =========================================================
     FOCUS TIMER (clock-based, survives reloads)
     ========================================================= */
  function startFocus(itemId, workMin) {
    const breakMin = workMin >= 50 ? 10 : 5;
    state.progress.timer = { itemId: itemId || null, workMin, breakMin, phase: 'work', endAt: Date.now() + workMin * 60000, pausedLeft: null, startedAt: Date.now(), min: false };
    saveProgress();
    renderTimer();
  }
  function logFocus(itemId, min) {
    if (min < 1) return;
    const p = state.progress;
    if (itemId) p.focus[itemId] = (p.focus[itemId] || 0) + min;
    p.focusLog.push({ date: todayIso(), itemId, min });
    if (p.focusLog.length > 500) p.focusLog = p.focusLog.slice(-500);
  }
  function stopFocus() {
    const t = state.progress.timer;
    if (t && t.phase === 'work') {
      const left = t.pausedLeft ?? Math.max(0, t.endAt - Date.now());
      logFocus(t.itemId, Math.floor((t.workMin * 60000 - left) / 60000));
    }
    state.progress.timer = null;
    saveProgress();
    renderTimer();
    render(true);
  }
  function tickTimer() {
    const t = state.progress.timer;
    if (!t || t.pausedLeft !== null || t.phase === 'done') return;
    if (Date.now() >= t.endAt) {
      if (t.phase === 'work') {
        logFocus(t.itemId, t.workMin);
        t.phase = 'break';
        t.endAt = Date.now() + t.breakMin * 60000;
        t.min = false;
      } else {
        t.phase = 'done';
      }
      saveProgress();
      renderTimer();
      return;
    }
    const clock = $('#focusClock');
    if (clock) clock.textContent = fmtClock(t.endAt - Date.now());
    const qc = $('#quizClock');
    if (qc && state.quiz?.endAt) qc.textContent = fmtClock(Math.max(0, state.quiz.endAt - Date.now()));
  }
  function renderTimer() {
    let host = $('#focus');
    if (!host) { host = document.createElement('div'); host.id = 'focus'; document.body.appendChild(host); }
    const t = state.progress.timer;
    if (!t) { host.innerHTML = ''; host.className = ''; return; }
    const item = t.itemId ? itemById(t.itemId) : null;
    const left = t.pausedLeft ?? Math.max(0, t.endAt - Date.now());
    const label = t.phase === 'work' ? 'Focus' : t.phase === 'break' ? 'Break' : 'Session done';
    if (t.min) {
      host.className = 'focus-pill';
      host.innerHTML = `<button type="button" class="focus-pill__btn" data-act="focus-max"><i class="ph ph-clock"></i><span>${label}</span><span class="mono" id="focusClock">${t.phase === 'done' ? '' : fmtClock(left)}</span></button>`;
      return;
    }
    host.className = 'focus-overlay';
    host.innerHTML = `<div class="focus-box" role="dialog" aria-label="Focus timer">
      <span class="chip ${t.phase === 'work' ? 'chip--accent' : 'chip--green'}">${label}</span>
      <h2>${esc(item ? item.name : 'Study session')}</h2>
      ${t.phase === 'done'
        ? `<p class="focus-note">Nice work. ${t.workMin} minutes logged${item ? ' on this module' : ''}.</p>
           <div class="panel__row"><button class="btn btn--primary" type="button" data-act="focus-start" data-id="${t.itemId || ''}" data-val="${t.workMin}"><i class="ph ph-play"></i>Another ${t.workMin} min</button><button class="btn" type="button" data-act="focus-stop">Close</button></div>`
        : `<span class="focus-clock mono" id="focusClock">${fmtClock(left)}</span>
           <p class="focus-note">${t.phase === 'work' ? 'Phone on Do Not Disturb and out of reach. One tab, one topic.' : 'Stand up, drink water, look away from the screen.'}</p>
           <div class="panel__row">
             <button class="btn" type="button" data-act="focus-pause"><i class="ph ${t.pausedLeft !== null ? 'ph-play' : 'ph-pause'}"></i>${t.pausedLeft !== null ? 'Resume' : 'Pause'}</button>
             <button class="btn" type="button" data-act="focus-min"><i class="ph ph-arrows-in"></i>Minimize</button>
             <button class="btn" type="button" data-act="focus-stop"><i class="ph ph-stop"></i>Stop</button>
           </div>`}
    </div>`;
  }
  function openFocusPicker() {
    let host = $('#focus');
    if (!host) { host = document.createElement('div'); host.id = 'focus'; document.body.appendChild(host); }
    if (state.progress.timer) { state.progress.timer.min = false; saveProgress(); renderTimer(); return; }
    host.className = 'focus-overlay';
    host.innerHTML = `<div class="focus-box" role="dialog" aria-label="Start a focus session">
      <h2>Start a focus session</h2>
      <p class="focus-note">To log time on a specific module, start the timer from that module's panel on the Syllabus page.</p>
      <div class="panel__row">
        <button class="btn btn--primary" type="button" data-act="focus-start" data-id="" data-val="25"><i class="ph ph-timer"></i>25 min + 5 break</button>
        <button class="btn btn--primary" type="button" data-act="focus-start" data-id="" data-val="50"><i class="ph ph-timer"></i>50 min + 10 break</button>
        <button class="btn" type="button" data-act="focus-cancel">Cancel</button>
      </div></div>`;
  }

  /* =========================================================
     ROUTER AND EVENTS
     ========================================================= */
  function parseRoute() {
    const [v, arg] = location.hash.replace('#', '').split('/');
    state.route = { view: VIEWS.includes(v) ? v : 'home', arg: arg || null };
    return state.route.view;
  }
  function render(keepScroll) {
    const v = state.route.view;
    const main = $('#main');
    const y = window.scrollY;
    main.classList.toggle('is-entering', !keepScroll);
    main.innerHTML = { home: renderHome, materials: renderMaterials, notes: renderNotes, quiz: renderQuiz, cards: renderCards }[v]();
    document.querySelectorAll('#navLinks a').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, keepScroll ? y : 0);
    updateThemeLabel();
  }

  function cycleTheme() {
    const order = [null, 'light', 'dark'];
    const next = order[(order.indexOf(state.progress.theme) + 1) % order.length];
    state.progress.theme = next;
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    saveProgress();
    updateThemeLabel();
  }
  function updateThemeLabel() {
    const t = state.progress?.theme;
    const label = $('#themeLabel');
    if (label) label.textContent = t === 'light' ? 'Light theme' : t === 'dark' ? 'Dark theme' : 'Auto theme';
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const { act, id, val } = el.dataset;
    const p = state.progress;
    switch (act) {
      case 'done': toggle('done', id); return render(true);
      case 'reread': bumpReread(id); return render(true);
      case 'noteread': toggle('notesRead', id); return render(true);
      case 'chapter': state.noteDomain = id; return render(true);
      case 'theme': return cycleTheme();
      case 'jump': {
        const g = document.getElementById(`group-${id}`);
        if (g) { g.open = true; g.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }
        return;
      }
      case 'expand': state.expanded = state.expanded === id ? null : id; return render(true);
      case 'open-row': {
        state.expanded = id;
        render(true);
        const row = document.getElementById(`row-${id}`);
        if (row) row.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      case 'rate': rate(id, Number(val)); return render(true);
      case 'explain-status': {
        const ex = p.explain[id] || (p.explain[id] = { text: '', status: null });
        ex.status = ex.status === val ? null : val;
        ex.updated = todayIso();
        saveProgress();
        return render(true);
      }
      case 'recall-toggle': p.recallMode = !p.recallMode; state.revealed.clear(); saveProgress(); return render(true);
      case 'reveal': state.revealed.add(id); return render(true);
      case 'recall-mark':
        p.recall[id] = val;
        if (val === 'missed') p.missed[id] = { front: el.dataset.front, back: el.dataset.back, source: el.dataset.source };
        else delete p.missed[id];
        saveProgress();
        return render(true);
      case 'quiz-start': startQuiz(id, val); state.route.arg === id || (id === 'all' && !state.route.arg) ? render(false) : (location.hash = `#quiz/${id}`); return;
      case 'quiz-pick': {
        const z = state.quiz; const q = qById(z.ids[z.idx]);
        const cur = z.picks[q.id] || [];
        z.picks[q.id] = q.answer.length > 1 ? (cur.includes(val) ? cur.filter((x) => x !== val) : cur.concat(val)) : [val];
        return render(true);
      }
      case 'quiz-check': { const z = state.quiz; const q = qById(z.ids[z.idx]); z.checked[q.id] = true; recordAnswer(q, z.picks[q.id] || []); return render(true); }
      case 'quiz-next': state.quiz.idx++; return render(false);
      case 'quiz-prev': state.quiz.idx--; return render(false);
      case 'quiz-finish': {
        const z = state.quiz;
        if (z.mode === 'mock') z.ids.forEach((qid) => recordAnswer(qById(qid), z.picks[qid] || []));
        z.finished = true;
        return render(false);
      }
      case 'quiz-again': { const z = state.quiz; startQuiz(z.scope, z.mode); return render(false); }
      case 'quiz-exit': state.quiz = null; return render(false);
      case 'cards-start': startCards(id, false); (state.route.arg || 'all') === id ? render(false) : (location.hash = `#cards/${id}`); return;
      case 'cards-cram': startCards(id, true); return render(false);
      case 'cards-flip': if (!state.cards.flipped) { state.cards.flipped = true; render(true); } return;
      case 'cards-grade': gradeCard(Number(val)); return render(true);
      case 'cards-exit': state.cards = null; return render(false);
      case 'focus-open': return openFocusPicker();
      case 'focus-cancel': return renderTimer();
      case 'focus-start': startFocus(id || null, Number(val)); return;
      case 'focus-pause': {
        const t = p.timer;
        if (t.pausedLeft !== null) { t.endAt = Date.now() + t.pausedLeft; t.pausedLeft = null; } else t.pausedLeft = Math.max(0, t.endAt - Date.now());
        saveProgress();
        return renderTimer();
      }
      case 'focus-min': p.timer.min = true; saveProgress(); return renderTimer();
      case 'focus-max': p.timer.min = false; saveProgress(); return renderTimer();
      case 'focus-stop': return stopFocus();
    }
  }
  function onChange(e) {
    if (e.target.id === 'examDate' && parseDate(e.target.value)) {
      state.progress.examDate = e.target.value;
      saveProgress();
      render(true);
    }
    if (e.target.id === 'newPerDay') {
      const n = Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 20));
      state.progress.newPerDay = n;
      saveProgress();
    }
  }
  function onInput(e) {
    if (e.target.dataset.explain !== undefined) onExplainInput(e.target);
  }
  function onKey(e) {
    if (state.route.view !== 'cards' || !state.cards || /input|textarea/i.test(e.target.tagName)) return;
    const s = state.cards;
    if (!s.queue[s.idx]) return;
    if (e.key === ' ' && !s.flipped) { e.preventDefault(); s.flipped = true; render(true); }
    else if (s.flipped && ['1', '2', '3', '4'].includes(e.key)) { gradeCard([0, 3, 4, 5][Number(e.key) - 1]); render(true); }
  }

  /* =========================================================
     ERROR STATE (e.g. a required file is missing or blocked)
     ========================================================= */
  function renderError(err) {
    $('#main').innerHTML = `<div class="card error-card" role="alert"><h2>The dashboard couldn't load its data</h2>
      <p>${esc(err.message)}</p>
      <p>Check that the data/ folder sits next to this page and that it's served over http(s). Opening the file directly (file://) blocks the fetch in most browsers.</p></div>`;
  }

  /* =========================================================
     INIT
     ========================================================= */
  async function init() {
    state.progress = loadProgress();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    $('#themeToggle').addEventListener('click', cycleTheme);
    const focusBtn = $('#focusToggle');
    if (focusBtn) focusBtn.addEventListener('click', openFocusPicker);
    window.addEventListener('hashchange', () => { parseRoute(); render(false); });
    parseRoute();
    try {
      await loadAll();
      render(false);
      renderTimer();
      setInterval(tickTimer, 1000);
    } catch (err) {
      console.error('[data-architect]', err);
      renderError(err);
    }
  }

  init();
})();
