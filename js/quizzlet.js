/**
 * ApexLearn Quizz — app logic
 * All question data is fetched at runtime from ../data/apex_quiz.json (never hardcoded here).
 * NOTE: fetch() requires this file to be served over http(s) — e.g. `npx serve` or
 * `python -m http.server` locally, or any static host in production. Opening
 * index.html directly via file:// will block the fetch in most browsers.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------
     CONSTANTS
  --------------------------------------------------- */
  const STORAGE_KEY = 'apexlearn_quizz_progress_v1';
  const SECONDS_PER_QUESTION = 45; // pacing used for the timed mock exam

  /* ---------------------------------------------------
     STATE
  --------------------------------------------------- */
  const state = {
    allQuestions: [],
    categories: [],           // [{ key, name, count, questions }]
    chapters: [],             // chapter study-guide summaries, from ../data/chapters.json
    selectedQuizCategory: null,
    selectedQuizLength: null,
    selectedExamLength: null,
    progress: null,
  };

  /* ---------------------------------------------------
     SMALL UTILITIES
  --------------------------------------------------- */
  function qs(id) {
    return document.getElementById(id);
  }

  function slugify(str) {
    return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseOption(optionStr) {
    const match = String(optionStr).match(/^([A-Za-z])\)\s*(.*)$/);
    if (match) return { letter: match[1].toUpperCase(), text: match[2] };
    return { letter: '', text: optionStr };
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /* ---------------------------------------------------
     PROGRESS PERSISTENCE (localStorage)
  --------------------------------------------------- */
  function defaultProgress() {
    return { attempts: [], bestByCategory: {}, bestExam: null };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultProgress();
      return Object.assign(defaultProgress(), JSON.parse(raw));
    } catch (e) {
      return defaultProgress();
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (e) {
      /* storage unavailable (e.g. private browsing) — fail silently */
    }
  }

  function recordAttempt({ mode, categoryKey, categoryName, correct, total }) {
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const attempt = {
      mode,
      categoryKey: categoryKey || null,
      categoryName: categoryName || null,
      correct,
      total,
      percent,
      date: new Date().toISOString(),
    };
    state.progress.attempts.push(attempt);

    if (mode === 'practice' && categoryKey) {
      const prevBest = state.progress.bestByCategory[categoryKey];
      if (!prevBest || percent > prevBest.percent) {
        state.progress.bestByCategory[categoryKey] = { name: categoryName, percent, correct, total, date: attempt.date };
      }
    }
    if (mode === 'exam') {
      if (!state.progress.bestExam || percent > state.progress.bestExam.percent) {
        state.progress.bestExam = { percent, correct, total, date: attempt.date };
      }
    }
    saveProgress();
  }

  /* ---------------------------------------------------
     DATA LOADING (from ../data/apex_quiz.json — the single source of truth)
  --------------------------------------------------- */
  async function loadQuestions() {
    const res = await fetch('../data/apex_quiz.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ../data/apex_quiz.json (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('../data/apex_quiz.json is empty or malformed');

    const map = new Map();
    data.forEach((q) => {
      const name = q.section || 'General';
      const key = slugify(name);
      if (!map.has(key)) map.set(key, { key, name, count: 0, questions: [] });
      const entry = map.get(key);
      entry.questions.push(q);
      entry.count += 1;
    });

    state.allQuestions = data;
    state.categories = Array.from(map.values());
  }

  /* ---------------------------------------------------
     REFERENCE TILES (Quizz tab: ApexLearn vs Beginner Developer)
  --------------------------------------------------- */
  function initReferenceTiles() {
    const tiles = Array.from(document.querySelectorAll('.reference-tile'));
    const panels = {
      apexlearn: qs('refPanelApexlearn'),
      guide: qs('refPanelGuide'),
      beginnerdev: qs('refPanelBeginnerdev'),
    };

    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const key = tile.dataset.ref;
        tiles.forEach((t) => t.classList.toggle('active', t === tile));
        Object.keys(panels).forEach((k) => {
          const panel = panels[k];
          if (panel) panel.classList.toggle('active', k === key);
        });
      });
    });
  }

  /* ---------------------------------------------------
     TAB NAVIGATION
  --------------------------------------------------- */
  function initNav() {
    const buttons = Array.from(document.querySelectorAll('.nav-btn'));
    const sections = Array.from(document.querySelectorAll('.content-section'));

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-section');
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        sections.forEach((sec) => sec.classList.toggle('active', sec.id === targetId));
      });
    });
  }

  /* ---------------------------------------------------
     CATEGORY PILLS (shared between Quizz & Learn tabs)
  --------------------------------------------------- */
  function renderCategoryPills(container, activeKey, onSelect) {
    container.innerHTML = '';
    state.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn' + (cat.key === activeKey ? ' active' : '');
      btn.textContent = cat.name;
      btn.dataset.topic = cat.key;
      btn.addEventListener('click', () => onSelect(cat.key));
      container.appendChild(btn);
    });
  }

  /* =====================================================
     GENERIC QUIZ ENGINE — powers both the Quizz (practice)
     tab and the Test (timed mock exam) tab via two instances
  ===================================================== */
  function createQuizEngine(el) {
    let questions = [];
    let index = 0;
    let correctCount = 0;
    let answered = false;
    let sectionTally = {};
    let onFinishCallback = null;
    let isTimed = false;
    let initialDuration = 0;
    let secondsLeft = 0;
    let timerId = null;

    function start(questionList, opts) {
      opts = opts || {};
      questions = questionList;
      index = 0;
      correctCount = 0;
      answered = false;
      sectionTally = {};
      onFinishCallback = opts.onFinish || null;
      isTimed = !!opts.timed;
      initialDuration = opts.durationSeconds || 0;

      el.setupView.classList.add('hidden');
      el.resultsView.classList.add('hidden');
      el.gameView.classList.remove('hidden');

      clearInterval(timerId);
      if (isTimed) {
        // durationSeconds > 0 => countdown (timed mock exam).
        // durationSeconds === 0 (or omitted) => count-up stopwatch (untimed practice quiz).
        secondsLeft = initialDuration > 0 ? initialDuration : 0;
        updateTimerDisplay();
        timerId = setInterval(tick, 1000);
      }

      renderQuestion();
    }

    function tick() {
      if (initialDuration > 0) {
        secondsLeft -= 1;
        updateTimerDisplay();
        if (secondsLeft <= 0) {
          clearInterval(timerId);
          finish();
        }
      } else {
        secondsLeft += 1;
        updateTimerDisplay();
      }
    }

    function updateTimerDisplay() {
      if (!el.timerPill) return;
      const textEl = el.timerPill.querySelector('.timer-pill-text') || el.timerPill;
      textEl.textContent = formatTime(secondsLeft);
      // Countdown mode (initialDuration > 0) turns urgent when time is running out.
      // Count-up/stopwatch mode (initialDuration === 0) never shows the "low time" state.
      el.timerPill.classList.toggle('timer-low', initialDuration > 0 && secondsLeft <= 30);
    }

    function renderQuestion() {
      answered = false;
      const q = questions[index];
      const total = questions.length;

      el.progressFill.style.width = `${(index / total) * 100}%`;
      el.questionMeta.textContent = `Question ${index + 1} of ${total}`;
      if (el.scorePill) el.scorePill.textContent = `${correctCount} / ${total}`;
      el.questionText.textContent = q.question;
      el.explanationBox.classList.add('hidden');
      el.nextBtn.classList.add('hidden');

      el.optionsList.innerHTML = '';
      q.options.forEach((optStr) => {
        const { letter, text } = parseOption(optStr);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="option-letter">${escapeHtml(letter)}</span><span>${escapeHtml(text)}</span>`;
        btn.addEventListener('click', () => selectAnswer(letter, q));
        el.optionsList.appendChild(btn);
      });
    }

    function selectAnswer(letter, q) {
      if (answered) return;
      answered = true;

      const isCorrect = letter === q.correct_answer;
      const section = q.section || 'General';
      if (!sectionTally[section]) sectionTally[section] = { correct: 0, total: 0 };
      sectionTally[section].total += 1;
      if (isCorrect) {
        sectionTally[section].correct += 1;
        correctCount += 1;
      }

      const buttons = el.optionsList.querySelectorAll('.option-btn');
      buttons.forEach((b) => {
        b.disabled = true;
        const btnLetter = b.querySelector('.option-letter').textContent;
        if (btnLetter === q.correct_answer) b.classList.add('correct');
        else if (btnLetter === letter) b.classList.add('incorrect');
        else b.classList.add('faded');
      });

      if (el.scorePill) el.scorePill.textContent = `${correctCount} / ${questions.length}`;

      el.explanationLabel.textContent = isCorrect ? 'Correct' : 'Incorrect';
      el.explanationLabel.classList.toggle('wrong', !isCorrect);
      el.explanationText.textContent = q.explanation || '';
      el.explanationBox.classList.remove('hidden');

      el.nextBtn.textContent = index === questions.length - 1 ? 'See Results' : 'Next Question';
      el.nextBtn.classList.remove('hidden');
    }

    function next() {
      index += 1;
      if (index >= questions.length) finish();
      else renderQuestion();
    }

    function finish() {
      clearInterval(timerId);
      el.progressFill.style.width = '100%';
      el.gameView.classList.add('hidden');
      el.resultsView.classList.remove('hidden');

      const total = questions.length;
      const percent = total ? Math.round((correctCount / total) * 100) : 0;

      el.resultScore.textContent = `${percent}%`;
      el.resultScore.classList.remove('mid', 'low');
      if (percent < 40) el.resultScore.classList.add('low');
      else if (percent < 70) el.resultScore.classList.add('mid');

      el.resultTitle.textContent = percent >= 80 ? 'Excellent work!' : percent >= 50 ? 'Nice effort!' : 'Keep practicing!';
      el.resultSubtitle.textContent = `You got ${correctCount} out of ${total} correct.`;

      if (el.breakdown) {
        el.breakdown.innerHTML = '';
        Object.keys(sectionTally).forEach((name) => {
          const t = sectionTally[name];
          const pct = t.total ? Math.round((t.correct / t.total) * 100) : 0;
          const row = document.createElement('div');
          row.className = 'breakdown-row';
          row.innerHTML = `
            <span class="breakdown-name">${escapeHtml(name)}</span>
            <span class="breakdown-track"><span class="breakdown-fill" style="width:${pct}%"></span></span>
            <span class="breakdown-pct">${pct}%</span>
          `;
          el.breakdown.appendChild(row);
        });
      }

      if (onFinishCallback) onFinishCallback({ correct: correctCount, total, percent, sectionTally });
    }

    function exit() {
      clearInterval(timerId);
      el.gameView.classList.add('hidden');
      el.resultsView.classList.add('hidden');
      el.setupView.classList.remove('hidden');
    }

    el.nextBtn.addEventListener('click', next);
    el.exitBtn.addEventListener('click', exit);
    el.retryBtn.addEventListener('click', () => {
      start(shuffle(questions), { timed: isTimed, durationSeconds: initialDuration, onFinish: onFinishCallback });
    });
    el.backBtn.addEventListener('click', () => {
      el.resultsView.classList.add('hidden');
      el.setupView.classList.remove('hidden');
    });

    return { start, exit };
  }

  /* ---------------------------------------------------
     QUIZZ TAB (practice by topic)
  --------------------------------------------------- */
  let quizEngine;

  function selectQuizCategory(key) {
    state.selectedQuizCategory = key;
    renderCategoryPills(qs('quizCategoryNav'), key, selectQuizCategory);
    const cat = state.categories.find((c) => c.key === key);
    if (cat) updateQuizSetupCard(cat);
  }

  function updateQuizSetupCard(cat) {
    qs('cardBadge').textContent = `${cat.count} Questions`;
    qs('cardTitle').textContent = cat.name;
    qs('cardDesc').textContent = `Practice ${cat.count} questions on ${cat.name}. Get instant feedback and a clear explanation after every answer.`;

    const lengthContainer = qs('lengthOptions');
    lengthContainer.innerHTML = '';

    const options = [];
    if (cat.count > 10) options.push(10);
    options.push('all');
    state.selectedQuizLength = options[0];

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'length-btn' + (opt === state.selectedQuizLength ? ' active' : '');
      btn.textContent = opt === 'all' ? `Full (${cat.count})` : `Quick ${opt}`;
      btn.addEventListener('click', () => {
        state.selectedQuizLength = opt;
        lengthContainer.querySelectorAll('.length-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      lengthContainer.appendChild(btn);
    });

    qs('startQuizBtn').disabled = false;
  }

  function startPracticeQuiz() {
    const cat = state.categories.find((c) => c.key === state.selectedQuizCategory);
    if (!cat) return;
    const count = state.selectedQuizLength === 'all' ? cat.count : Math.min(state.selectedQuizLength, cat.count);
    const questionSet = shuffle(cat.questions).slice(0, count);

    quizEngine.start(questionSet, {
      timed: true,
      durationSeconds: 0, // 0 = count-up stopwatch, since practice quizzes aren't time-limited
      onFinish: (result) => {
        recordAttempt({ mode: 'practice', categoryKey: cat.key, categoryName: cat.name, correct: result.correct, total: result.total });
        renderProfile();
      },
    });
  }

  /* ---------------------------------------------------
     LEARN TAB — CHAPTER STUDY GUIDE
  --------------------------------------------------- */
  async function loadChapters() {
    const res = await fetch('../data/chapters.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ../data/chapters.json (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('../data/chapters.json is malformed');
    state.chapters = data;
  }

  // Best-effort match from a ../data/chapters.json entry to an actual quiz category,
  // so "Quiz me on this chapter" opens the right topic even if section naming
  // drifts slightly between ../data/chapters.json and ../data/apex_quiz.json.
  function resolveCategoryForChapter(chapter) {
    if (!state.categories.length) return null;
    const targetKey = slugify(chapter.section || chapter.title);
    let match = state.categories.find((c) => c.key === targetKey);
    if (match) return match;

    if (chapter.number) {
      const numRe = new RegExp(`chapter\\s*${chapter.number}\\b`, 'i');
      match = state.categories.find((c) => numRe.test(c.name));
      if (match) return match;
    }
    return null;
  }

  function getScoreBadge(cat) {
    if (!cat) return null;
    const best = state.progress.bestByCategory[cat.key];
    if (!best) return null;
    const cls = best.percent >= 85 ? 'high' : best.percent >= 60 ? 'mid' : 'low';
    return { pct: best.percent, cls };
  }

  function buildPointHtml(point) {
    const text = point.term
      ? `<strong>${escapeHtml(point.term)}:</strong> ${escapeHtml(point.text)}`
      : escapeHtml(point.text);
    const code = point.code
      ? `<div class="chapter-code-block">${escapeHtml(point.code)}</div>`
      : '';
    return `
      <div class="chapter-point">
        <span class="chapter-point-dot"></span>
        <div class="chapter-point-text">${text}${code}</div>
      </div>
    `;
  }

  function buildTopicHtml(topic) {
    const intro = topic.intro ? `<p class="chapter-topic-intro">${escapeHtml(topic.intro)}</p>` : '';
    const points = topic.points.map(buildPointHtml).join('');
    return `
      <div class="chapter-topic">
        <h4>${escapeHtml(topic.heading)}</h4>
        ${intro}
        <div class="chapter-point-list">${points}</div>
      </div>
    `;
  }

  function renderChapterSummaries() {
    const list = qs('chapterSummaryList');
    if (!state.chapters.length) {
      list.innerHTML = '<p class="empty-state">No chapter summaries available yet.</p>';
      return;
    }

    list.innerHTML = '';

    state.chapters.forEach((chapter) => {
      const cat = resolveCategoryForChapter(chapter);
      const badge = getScoreBadge(cat);
      const badgeHtml = badge
        ? `<div class="chapter-summary-score ${badge.cls}">${badge.pct}%</div>`
        : '';

      const topicsHtml = chapter.sections.map(buildTopicHtml).join('');

      const card = document.createElement('div');
      card.className = 'chapter-summary-card';
      card.dataset.key = chapter.key;
      card.innerHTML = `
        <button type="button" class="chapter-summary-header" data-action="toggle">
          <div class="chapter-summary-icon"><i class="ti ${chapter.icon || 'ti-book-2'}"></i></div>
          <div class="chapter-summary-heading">
            <span class="chapter-summary-eyebrow">Chapter ${chapter.number}</span>
            <h3>${escapeHtml(chapter.title)}</h3>
          </div>
          ${badgeHtml}
          <i class="ti ti-chevron-down chapter-summary-chevron"></i>
        </button>
        <div class="chapter-summary-body">
          <div class="chapter-summary-inner">
            <p class="chapter-summary-intro">${escapeHtml(chapter.intro)}</p>
            ${topicsHtml}
            <button type="button" class="chapter-quiz-cta" data-action="quiz" data-key="${chapter.key}">
              <i class="ti ti-list-check"></i> Quiz me on Chapter ${chapter.number}
            </button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    updateLearnToolbarStat();
  }

  function updateLearnToolbarStat() {
    const total = state.chapters.length;
    const quizzesTaken = state.progress.attempts.length;
    qs('learnToolbarStat').textContent = quizzesTaken
      ? `${total} chapter${total === 1 ? '' : 's'} · ${quizzesTaken} quiz${quizzesTaken === 1 ? '' : 'zes'} taken`
      : `${total} chapter${total === 1 ? '' : 's'} to review`;
  }

  function switchToSection(sectionId) {
    const btn = document.querySelector(`.nav-btn[data-section="${sectionId}"]`);
    if (btn) btn.click();
  }

  function switchToReferenceTile(refKey) {
    const tile = document.querySelector(`.reference-tile[data-ref="${refKey}"]`);
    if (tile) tile.click();
  }

  function initLearnControls() {
    const list = qs('chapterSummaryList');

    list.addEventListener('click', (e) => {
      const quizBtn = e.target.closest('.chapter-quiz-cta');
      if (quizBtn) {
        const chapter = state.chapters.find((c) => c.key === quizBtn.dataset.key);
        const cat = chapter ? resolveCategoryForChapter(chapter) : null;
        if (cat) selectQuizCategory(cat.key);
        switchToReferenceTile('apexlearn');
        switchToSection('quizz');
        return;
      }

      const header = e.target.closest('.chapter-summary-header');
      if (header) {
        const card = header.closest('.chapter-summary-card');
        card.classList.toggle('open');
        syncToggleAllLabel();
      }
    });

    qs('learnToggleAllBtn').addEventListener('click', () => {
      const cards = Array.from(list.querySelectorAll('.chapter-summary-card'));
      const anyClosed = cards.some((c) => !c.classList.contains('open'));
      cards.forEach((c) => c.classList.toggle('open', anyClosed));
      syncToggleAllLabel();
    });

    qs('learnExamCta').addEventListener('click', () => switchToSection('test'));
  }

  function syncToggleAllLabel() {
    const cards = Array.from(qs('chapterSummaryList').querySelectorAll('.chapter-summary-card'));
    const allOpen = cards.length > 0 && cards.every((c) => c.classList.contains('open'));
    qs('learnToggleAllBtn').textContent = allOpen ? 'Collapse All' : 'Expand All';
  }

  // Updates just the score badges (called after any quiz/exam finishes) without
  // rebuilding the cards, so any chapters the learner has open stay open.
  function refreshChapterSummaryScores() {
    const list = qs('chapterSummaryList');
    if (!list) return;
    state.chapters.forEach((chapter) => {
      const card = list.querySelector(`.chapter-summary-card[data-key="${chapter.key}"]`);
      if (!card) return;
      const cat = resolveCategoryForChapter(chapter);
      const badge = getScoreBadge(cat);
      const header = card.querySelector('.chapter-summary-header');
      const chevron = card.querySelector('.chapter-summary-chevron');
      let badgeEl = card.querySelector('.chapter-summary-score');

      if (badge) {
        if (!badgeEl) {
          badgeEl = document.createElement('div');
          header.insertBefore(badgeEl, chevron);
        }
        badgeEl.className = `chapter-summary-score ${badge.cls}`;
        badgeEl.textContent = `${badge.pct}%`;
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });
    updateLearnToolbarStat();
  }

  /* ---------------------------------------------------
     TEST TAB (timed mock exam, mixed topics)
  --------------------------------------------------- */
  let examEngine;

  function renderExamSetup() {
    const total = state.allQuestions.length;
    qs('examBadge').textContent = `${total} Questions Available`;

    const lengths = [20, 40, 'all'].filter((n) => n === 'all' || n < total);
    state.selectedExamLength = lengths[0];

    const container = qs('examLengthOptions');
    container.innerHTML = '';
    lengths.forEach((len) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'length-btn' + (len === state.selectedExamLength ? ' active' : '');
      btn.textContent = len === 'all' ? `Full (${total})` : `${len} Questions`;
      btn.addEventListener('click', () => {
        state.selectedExamLength = len;
        container.querySelectorAll('.length-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        updateExamTimeEstimate();
      });
      container.appendChild(btn);
    });

    updateExamTimeEstimate();
    qs('startExamBtn').disabled = false;
  }

  function updateExamTimeEstimate() {
    const total = state.allQuestions.length;
    const count = state.selectedExamLength === 'all' ? total : state.selectedExamLength;
    const minutes = Math.max(1, Math.round((count * SECONDS_PER_QUESTION) / 60));
    qs('examTimeEstimate').textContent = `Estimated time: ${minutes} min`;
  }

  function startMockExam() {
    const total = state.allQuestions.length;
    const count = state.selectedExamLength === 'all' ? total : Math.min(state.selectedExamLength, total);
    const questionSet = shuffle(state.allQuestions).slice(0, count);

    examEngine.start(questionSet, {
      timed: true,
      durationSeconds: count * SECONDS_PER_QUESTION,
      onFinish: (result) => {
        recordAttempt({ mode: 'exam', correct: result.correct, total: result.total });
        renderProfile();
      },
    });
  }

  /* ---------------------------------------------------
     PROFILE TAB (stats & history)
  --------------------------------------------------- */
  function renderProfile() {
    const p = state.progress;
    const attempts = p.attempts;
    const totalAttempts = attempts.length;
    const avgPercent = totalAttempts ? Math.round(attempts.reduce((sum, a) => sum + a.percent, 0) / totalAttempts) : 0;
    const bestExamPct = p.bestExam ? p.bestExam.percent : 0;
    const categoriesPracticed = Object.keys(p.bestByCategory).length;

    qs('statsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-value">${totalAttempts}</div><div class="stat-label">Quizzes Taken</div></div>
      <div class="stat-card"><div class="stat-value">${avgPercent}%</div><div class="stat-label">Average Score</div></div>
      <div class="stat-card"><div class="stat-value">${bestExamPct}%</div><div class="stat-label">Best Mock Exam</div></div>
      <div class="stat-card"><div class="stat-value">${categoriesPracticed}/${state.categories.length}</div><div class="stat-label">Topics Practiced</div></div>
    `;

    const list = qs('categoryProgressList');
    if (!state.categories.length) {
      list.innerHTML = '';
    } else if (!categoriesPracticed) {
      list.innerHTML = '<p class="progress-empty">Take a quiz to see your best scores here.</p>';
    } else {
      list.innerHTML = '';
      state.categories.forEach((cat) => {
        const best = p.bestByCategory[cat.key];
        const pct = best ? best.percent : 0;
        const row = document.createElement('div');
        row.className = 'progress-row';
        row.innerHTML = `
          <span class="progress-name">${escapeHtml(cat.name)}</span>
          <span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span>
          <span class="progress-pct">${best ? pct + '%' : '—'}</span>
        `;
        list.appendChild(row);
      });
    }

    refreshChapterSummaryScores();
  }

  function initProfileControls() {
    qs('resetProgressBtn').addEventListener('click', () => {
      const confirmed = window.confirm('Reset all quiz progress? This cannot be undone.');
      if (!confirmed) return;
      state.progress = defaultProgress();
      saveProgress();
      renderProfile();
    });
  }

  /* ---------------------------------------------------
     ERROR STATE (e.g. ../data/apex_quiz.json missing or blocked)
  --------------------------------------------------- */
  function showLoadError() {
    qs('cardBadge').textContent = 'Error';
    qs('cardTitle').textContent = 'Could not load questions';
    qs('cardDesc').textContent = 'Make sure ../data/apex_quiz.json sits alongside index.html and that this page is served over http(s) — opening it directly as a file:// URL blocks the fetch in most browsers.';
    qs('lengthOptions').innerHTML = '';
    qs('examBadge').textContent = 'Error';
    const refApexMeta = qs('refApexMeta');
    if (refApexMeta) refApexMeta.textContent = 'Could not load';
  }

  /* =====================================================
     GUIDE TAB — SPACED REPETITION (SRS) ENGINE
  ===================================================== */
  const SRS = {
    STORAGE_SRS: 'apexlearn_srs_state_v1',
    STORAGE_SETTINGS: 'apexlearn_srs_settings_v1',
    STORAGE_OVERRIDES: 'apexlearn_card_overrides_v1',
    STORAGE_REVIEWLOG: 'apexlearn_srs_reviewlog_v1',

    allCards: [],
    allItems: [],
    selectedChapter: null,
    sessionQueue: [],
    currentIndex: 0,
    sessionGrades: { again: 0, hard: 0, good: 0, easy: 0 },
    sessionReviewed: 0,
    requeueBuffer: [],
    showingAnswer: false,
    currentItemId: null,

    todayStr() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    addDays(dateStr, days) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    loadJSON(key, fallback) {
      try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
      catch { return fallback; }
    },

    saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); },

    getSrsData() { return this.loadJSON(this.STORAGE_SRS, {}); },
    saveSrsData(d) { this.saveJSON(this.STORAGE_SRS, d); },
    getSettings() { return this.loadJSON(this.STORAGE_SETTINGS, { newCardsPerDay: 20 }); },
    saveSettings(s) { this.saveJSON(this.STORAGE_SETTINGS, s); },
    getOverrides() { return this.loadJSON(this.STORAGE_OVERRIDES, {}); },
    saveOverrides(o) { this.saveJSON(this.STORAGE_OVERRIDES, o); },
    getReviewLog() { return this.loadJSON(this.STORAGE_REVIEWLOG, {}); },
    saveReviewLog(l) { this.saveJSON(this.STORAGE_REVIEWLOG, l); },

    logReview(count) {
      const log = this.getReviewLog();
      const today = this.todayStr();
      log[today] = (log[today] || 0) + count;
      this.saveReviewLog(log);
    },

    /* SM-2 Algorithm */
    sm2Update(state, quality) {
      const s = Object.assign({}, state);
      if (quality < 3) {
        s.repetitions = 0;
        s.interval = 1;
        s.lapses = (s.lapses || 0) + 1;
      } else {
        s.repetitions += 1;
        if (s.repetitions === 1) s.interval = 1;
        else if (s.repetitions === 2) s.interval = 6;
        else s.interval = Math.round(s.interval * s.easeFactor);
        s.easeFactor = Math.max(1.3,
          s.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        );
      }
      s.dueDate = this.addDays(this.todayStr(), s.interval);
      return s;
    },

    getSrsState(cardId, srsData) {
      if (srsData[cardId]) return srsData[cardId];
      return { interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: this.todayStr(), lapses: 0 };
    },

    /* Expand cards into forward + reverse items */
    expandCards(rawCards) {
      const items = [];
      for (const card of rawCards) {
        items.push(Object.assign({}, card, { direction: 'forward', itemId: card.id }));
        if (card.reversible) {
          const rev = this.buildReverseItem(card);
          if (rev) items.push(rev);
        }
      }
      return items;
    },

    buildReverseItem(card) {
      if (card.type !== 'cloze' || !card.text) return null;
      const match = card.text.match(/\{\{c1::(.+?)\}\}/);
      if (!match) return null;
      const answer = match[1];
      const fullText = card.text.replace(/\{\{c1::(.+?)\}\}/, '<span class="cloze-reveal">$1</span>');
      return {
        id: card.id + '::rev',
        chapter: card.chapter,
        chapterTitle: card.chapterTitle,
        heading: card.heading,
        type: card.type,
        reversible: false,
        direction: 'reverse',
        itemId: card.id,
        _revAnswer: answer,
        _revFullText: fullText,
        _forwardCard: card,
      };
    },

    parseCloze(text) {
      const match = text.match(/\{\{c1::(.+?)\}\}/);
      if (!match) return { blank: text, answer: '', fullRevealed: text };
      const answer = match[1];
      const blank = text.replace(/\{\{c1::(.+?)\}\}/, '______');
      const fullRevealed = text.replace(/\{\{c1::(.+?)\}\}/, '<span class="cloze-reveal">$1</span>');
      return { blank, answer, fullRevealed };
    },

    /* Dashboard */
    updateDashboard() {
      const srsData = this.getSrsData();
      const today = this.todayStr();
      const settings = this.getSettings();
      let dueCount = 0, newCount = 0;
      const items = this.selectedChapter
        ? this.allItems.filter(i => i.chapter === this.selectedChapter)
        : this.allItems;
      for (const item of items) {
        const state = this.getSrsState(item.itemId, srsData);
        if (state.repetitions === 0 && state.interval === 0) newCount++;
        else if (state.dueDate <= today) dueCount++;
      }
      const effectiveNew = Math.min(newCount, settings.newCardsPerDay);
      const log = this.getReviewLog();
      qs('stat-due').textContent = dueCount;
      qs('stat-new').textContent = effectiveNew;
      qs('stat-reviewed').textContent = log[today] || 0;
      qs('stat-total').textContent = items.length;
      qs('new-cards-cap').value = settings.newCardsPerDay;
    },

    /* Chapter pills */
    renderChapterPills() {
      const chapters = {};
      for (const card of this.allCards) {
        if (!chapters[card.chapter]) chapters[card.chapter] = card.chapterTitle;
      }
      const container = qs('chapter-pills');
      container.innerHTML = '';
      const allPill = document.createElement('button');
      allPill.className = 'chapter-pill' + (this.selectedChapter === null ? ' active' : '');
      allPill.textContent = 'All';
      allPill.addEventListener('click', () => { this.selectedChapter = null; this.renderChapterPills(); this.updateDashboard(); });
      container.appendChild(allPill);
      for (const [num, title] of Object.entries(chapters).sort((a, b) => a[0] - b[0])) {
        const pill = document.createElement('button');
        pill.className = 'chapter-pill' + (this.selectedChapter === Number(num) ? ' active' : '');
        pill.textContent = 'Ch ' + num;
        pill.title = title;
        pill.addEventListener('click', () => { this.selectedChapter = Number(num); this.renderChapterPills(); this.updateDashboard(); });
        container.appendChild(pill);
      }
    },

    /* Build session queue */
    buildSessionQueue() {
      const srsData = this.getSrsData();
      const settings = this.getSettings();
      const today = this.todayStr();
      const candidates = this.selectedChapter
        ? this.allItems.filter(i => i.chapter === this.selectedChapter)
        : this.allItems.slice();
      const due = [], newCards = [];
      for (const item of candidates) {
        const state = this.getSrsState(item.itemId, srsData);
        if (state.repetitions === 0 && state.interval === 0) newCards.push(item);
        else if (state.dueDate <= today) due.push(item);
      }
      const cappedNew = this.shuffle(newCards).slice(0, settings.newCardsPerDay);
      return this.shuffle(due.concat(cappedNew));
    },

    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },

    /* View switching */
    showView(id) {
      ['guide-dashboard', 'guide-card-view', 'guide-summary', 'guide-empty'].forEach(elId => {
        qs(elId).classList.add('hidden');
      });
      qs(id).classList.remove('hidden');
    },

    /* Start review */
    startReview() {
      this.sessionQueue = this.buildSessionQueue();
      if (this.sessionQueue.length === 0) { this.showView('guide-empty'); return; }
      this.currentIndex = 0;
      this.sessionGrades = { again: 0, hard: 0, good: 0, easy: 0 };
      this.sessionReviewed = 0;
      this.requeueBuffer = [];
      this.showView('guide-card-view');
      this.renderCard();
    },

    /* Render card */
    renderCard() {
      if (this.currentIndex >= this.sessionQueue.length) {
        if (this.requeueBuffer.length > 0) {
          const insertAt = Math.min(this.currentIndex + 3, this.sessionQueue.length);
          while (this.requeueBuffer.length > 0) this.sessionQueue.splice(insertAt, 0, this.requeueBuffer.shift());
        }
        if (this.currentIndex >= this.sessionQueue.length) { this.endSession(); return; }
      }
      const item = this.sessionQueue[this.currentIndex];
      if (!item) { this.endSession(); return; }
      this.currentItemId = item.itemId;
      this.showingAnswer = false;

      const total = this.sessionQueue.length;
      qs('guide-progress-fill').style.width = (total > 0 ? (this.currentIndex / total * 100) : 0) + '%';
      qs('guide-progress-text').textContent = (this.currentIndex + 1) + ' / ' + total;
      qs('srs-card-chapter').textContent = 'Chapter ' + item.chapter;
      qs('srs-card-heading').textContent = item.heading;

      const body = qs('srs-card-body');
      if (item.direction === 'reverse') {
        body.innerHTML = '<div class="reverse-front">' + item._revAnswer + '</div><hr class="reverse-divider"><div class="reverse-back">' + item._revFullText + '</div>';
      } else if (item.type === 'cloze') {
        const parsed = this.parseCloze(item.text);
        body.innerHTML = parsed.blank.replace(/______/g, '<span class="cloze-blank">?</span>');
      } else if (item.type === 'basic') {
        body.textContent = item.front || '';
      } else {
        body.textContent = item.text || '';
      }

      const overrides = this.getOverrides();
      const extra = overrides[item.id] && overrides[item.id].extra ? overrides[item.id].extra : (item.extra || '');
      const extraEl = qs('srs-card-extra');
      if (extra) { extraEl.textContent = extra; extraEl.classList.remove('hidden'); }
      else { extraEl.classList.add('hidden'); }

      qs('srs-actions').classList.remove('hidden');
      qs('btn-show-answer').classList.remove('hidden');
      qs('srs-grade-buttons').classList.add('hidden');
      qs('srs-edit-row').classList.add('hidden');
      qs('srs-edit-form').classList.add('hidden');
    },

    /* Show answer */
    showAnswer() {
      this.showingAnswer = true;
      const item = this.sessionQueue[this.currentIndex];
      const body = qs('srs-card-body');
      if (item.direction === 'reverse') { /* already shown */ }
      else if (item.type === 'cloze') {
        const parsed = this.parseCloze(item.text);
        body.innerHTML = parsed.fullRevealed;
      } else if (item.type === 'basic') {
        body.innerHTML = '<div style="font-weight:700;margin-bottom:12px;">' + (item.front || '') + '</div><hr style="border:none;border-top:1px solid var(--border);margin:12px 0;"><div>' + (item.back || '') + '</div>';
      }
      qs('srs-actions').classList.add('hidden');
      qs('srs-grade-buttons').classList.remove('hidden');
      qs('srs-edit-row').classList.remove('hidden');
    },

    /* Grade card */
    gradeCard(quality) {
      const item = this.sessionQueue[this.currentIndex];
      if (!item) return;
      const srsData = this.getSrsData();
      const itemId = item.itemId;
      const currentState = this.getSrsState(itemId, srsData);
      srsData[itemId] = this.sm2Update(currentState, quality);
      this.saveSrsData(srsData);
      this.logReview(1);
      if (quality === 0) this.sessionGrades.again++;
      else if (quality === 3) this.sessionGrades.hard++;
      else if (quality === 4) this.sessionGrades.good++;
      else if (quality === 5) this.sessionGrades.easy++;
      this.sessionReviewed++;
      if (quality === 0) this.requeueBuffer.push(item);
      if (item.direction === 'forward' && item.reversible) {
        const revId = item.id + '::rev';
        if (!srsData[revId]) {
          srsData[revId] = { interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: this.todayStr(), lapses: 0 };
          this.saveSrsData(srsData);
        }
      }
      if (item.direction === 'reverse') {
        const fwdId = item.id.replace('::rev', '');
        if (!srsData[fwdId]) {
          srsData[fwdId] = { interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: this.todayStr(), lapses: 0 };
          this.saveSrsData(srsData);
        }
      }
      this.currentIndex++;
      this.renderCard();
    },

    /* End session */
    endSession() {
      this.showView('guide-summary');
      qs('summary-total').textContent = this.sessionReviewed;
      qs('summary-again').textContent = this.sessionGrades.again;
      qs('summary-hard').textContent = this.sessionGrades.hard;
      qs('summary-good').textContent = this.sessionGrades.good;
      qs('summary-easy').textContent = this.sessionGrades.easy;
      qs('guide-progress-fill').style.width = '100%';
      this.updateDashboard();
      this.renderHeatmap();
      this.updateProfileStreaks();
    },

    /* Edit in place */
    openEditForm() {
      const item = this.sessionQueue[this.currentIndex];
      if (!item) return;
      const overrides = this.getOverrides();
      qs('extra-textarea').value = (overrides[item.id] && overrides[item.id].extra) ? overrides[item.id].extra : (item.extra || '');
      qs('srs-edit-form').classList.remove('hidden');
      qs('extra-textarea').focus();
    },

    saveEdit() {
      const item = this.sessionQueue[this.currentIndex];
      if (!item) return;
      const overrides = this.getOverrides();
      if (!overrides[item.id]) overrides[item.id] = {};
      overrides[item.id].extra = qs('extra-textarea').value;
      this.saveOverrides(overrides);
      qs('srs-edit-form').classList.add('hidden');
      this.renderCard();
    },

    cancelEdit() { qs('srs-edit-form').classList.add('hidden'); },

    /* Heatmap */
    renderHeatmap() {
      const log = this.getReviewLog();
      const grid = qs('heatmap-grid');
      if (!grid) return;
      grid.innerHTML = '';
      const today = new Date();
      const todayD = today.getDay();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - (52 * 7) - todayD);
      let maxCount = 0;
      for (const val of Object.values(log)) { if (val > maxCount) maxCount = val; }
      const current = new Date(startDate);
      while (current <= today) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const ds = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
        const count = log[ds] || 0;
        let level = 0;
        if (count > 0 && maxCount > 0) {
          const ratio = count / maxCount;
          if (ratio <= 0.25) level = 1;
          else if (ratio <= 0.5) level = 2;
          else if (ratio <= 0.75) level = 3;
          else level = 4;
        }
        cell.setAttribute('data-level', level);
        cell.title = ds + ': ' + count + ' reviews';
        grid.appendChild(cell);
        current.setDate(current.getDate() + 1);
      }
    },

    /* Profile streaks */
    updateProfileStreaks() {
      const log = this.getReviewLog();
      const today = new Date();
      let currentStreak = 0, longestStreak = 0, tempStreak = 0;
      const d = new Date(today);
      while (true) {
        const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (log[ds]) {
          if (d.getTime() === today.getTime() || currentStreak > 0) currentStreak++;
          tempStreak++;
        } else {
          if (tempStreak > longestStreak) longestStreak = tempStreak;
          tempStreak = 0;
          if (d.getTime() < today.getTime()) break;
        }
        d.setDate(d.getDate() - 1);
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      const csEl = qs('profile-current-streak');
      const lsEl = qs('profile-longest-streak');
      if (csEl) csEl.textContent = currentStreak;
      if (lsEl) lsEl.textContent = longestStreak;
    },

    /* Bind events */
    bindEvents() {
      qs('btn-start-review').addEventListener('click', () => this.startReview());
      qs('btn-show-answer').addEventListener('click', () => this.showAnswer());
      qs('btn-end-session').addEventListener('click', () => this.endSession());
      qs('btn-back-dashboard').addEventListener('click', () => { this.updateDashboard(); this.showView('guide-dashboard'); });
      qs('srs-grade-buttons').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-grade');
        if (btn) this.gradeCard(Number(btn.dataset.quality));
      });
      qs('btn-edit-extra').addEventListener('click', () => this.openEditForm());
      qs('btn-save-edit').addEventListener('click', () => this.saveEdit());
      qs('btn-cancel-edit').addEventListener('click', () => this.cancelEdit());
      qs('new-cards-cap').addEventListener('change', (e) => {
        const val = Math.max(1, Math.min(100, parseInt(e.target.value) || 20));
        e.target.value = val;
        const settings = this.getSettings();
        settings.newCardsPerDay = val;
        this.saveSettings(settings);
        this.updateDashboard();
      });

      /* Keyboard shortcuts */
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const guideActive = qs('refPanelGuide').classList.contains('active');
        if (!guideActive) return;
        if (e.key === ' ' || e.key === 'Enter') {
          if (!this.showingAnswer && !qs('guide-card-view').classList.contains('hidden')) {
            e.preventDefault();
            this.showAnswer();
          }
        } else if (e.key === '1') this.gradeCard(0);
        else if (e.key === '2') this.gradeCard(3);
        else if (e.key === '3') this.gradeCard(4);
        else if (e.key === '4') this.gradeCard(5);
        else if ((e.key === 'e' || e.key === 'E') && this.showingAnswer) {
          this.openEditForm();
        }
      });
    },

    /* Init */
    async init() {
      try {
        const resp = await fetch('../data/apex_guide_cards.json', { cache: 'no-store' });
        this.allCards = await resp.json();
        this.allItems = this.expandCards(this.allCards);
      } catch (err) {
        console.error('Failed to load guide cards:', err);
        return;
      }
      const refGuideMeta = qs('refGuideMeta');
      if (refGuideMeta) {
        refGuideMeta.textContent = `${this.allCards.length} cards`;
      }

      this.bindEvents();
      this.renderChapterPills();
      this.updateDashboard();
      this.showView('guide-dashboard');
    }
  };

  /* ---------------------------------------------------
     INIT
  --------------------------------------------------- */
  async function init() {
    initNav();
    initReferenceTiles();
    state.progress = loadProgress();

    let questionsLoaded = false;
    try {
      await loadQuestions();
      questionsLoaded = true;
    } catch (err) {
      console.error(err);
      showLoadError();
    }

    if (questionsLoaded) {
      const refApexMeta = qs('refApexMeta');
      if (refApexMeta) {
        refApexMeta.textContent = `${state.allQuestions.length} questions · ${state.categories.length} topics`;
      }

      const firstCategoryKey = state.categories[0].key;

      // Quizz tab
      renderCategoryPills(qs('quizCategoryNav'), firstCategoryKey, selectQuizCategory);
      selectQuizCategory(firstCategoryKey);
      quizEngine = createQuizEngine({
        setupView: qs('quizSetupView'),
        gameView: qs('quizGameView'),
        resultsView: qs('quizResultsView'),
        progressFill: qs('quizProgressFill'),
        questionMeta: qs('quizQuestionMeta'),
        scorePill: qs('quizScorePill'),
        timerPill: qs('quizTimerPill'),
        questionText: qs('quizQuestionText'),
        optionsList: qs('quizOptionsList'),
        explanationBox: qs('quizExplanationBox'),
        explanationLabel: qs('quizExplanationLabel'),
        explanationText: qs('quizExplanationText'),
        nextBtn: qs('quizNextBtn'),
        exitBtn: qs('exitQuizBtn'),
        resultScore: qs('quizResultScore'),
        resultTitle: qs('quizResultTitle'),
        resultSubtitle: qs('quizResultSubtitle'),
        breakdown: null,
        retryBtn: qs('quizRetryBtn'),
        backBtn: qs('quizBackBtn'),
      });
      qs('startQuizBtn').addEventListener('click', startPracticeQuiz);

      // Test tab
      renderExamSetup();
      examEngine = createQuizEngine({
        setupView: qs('examSetupView'),
        gameView: qs('examGameView'),
        resultsView: qs('examResultsView'),
        progressFill: qs('examProgressFill'),
        questionMeta: qs('examQuestionMeta'),
        scorePill: null,
        timerPill: qs('examTimerPill'),
        questionText: qs('examQuestionText'),
        optionsList: qs('examOptionsList'),
        explanationBox: qs('examExplanationBox'),
        explanationLabel: qs('examExplanationLabel'),
        explanationText: qs('examExplanationText'),
        nextBtn: qs('examNextBtn'),
        exitBtn: qs('exitExamBtn'),
        resultScore: qs('examResultScore'),
        resultTitle: qs('examResultTitle'),
        resultSubtitle: qs('examResultSubtitle'),
        breakdown: qs('examBreakdown'),
        retryBtn: qs('examRetryBtn'),
        backBtn: qs('examBackBtn'),
      });
      qs('startExamBtn').addEventListener('click', startMockExam);
    }

    try {
      await loadChapters();
    } catch (err) {
      console.error(err);
      state.chapters = [];
    }

    // Learn tab
    renderChapterSummaries();
    initLearnControls();

    // Profile tab
    renderProfile();
    initProfileControls();

    // Guide (SRS) tab — independent of quiz/exam data, must init even if it failed to load
    SRS.init();

    // Heatmap & streaks (for Profile)
    SRS.renderHeatmap();
    SRS.updateProfileStreaks();
  }

  document.addEventListener('DOMContentLoaded', init);
})();