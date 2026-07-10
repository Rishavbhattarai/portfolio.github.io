/**
 * ApexLearn Quizz — app logic
 * All question data is fetched at runtime from apex_quiz.json (never hardcoded here).
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
    selectedQuizCategory: null,
    selectedQuizLength: null,
    selectedLearnCategory: null,
    selectedExamLength: null,
    flashcards: { list: [], index: 0 },
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
     DATA LOADING (from apex_quiz.json — the single source of truth)
  --------------------------------------------------- */
  async function loadQuestions() {
    const res = await fetch('..//data/apex_quiz.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load apex_quiz.json (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('apex_quiz.json is empty or malformed');

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
        secondsLeft = initialDuration;
        updateTimerDisplay();
        timerId = setInterval(tick, 1000);
      }

      renderQuestion();
    }

    function tick() {
      secondsLeft -= 1;
      updateTimerDisplay();
      if (secondsLeft <= 0) {
        clearInterval(timerId);
        finish();
      }
    }

    function updateTimerDisplay() {
      if (!el.timerPill) return;
      el.timerPill.textContent = formatTime(secondsLeft);
      el.timerPill.classList.toggle('timer-low', secondsLeft <= 30);
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
      onFinish: (result) => {
        recordAttempt({ mode: 'practice', categoryKey: cat.key, categoryName: cat.name, correct: result.correct, total: result.total });
        renderProfile();
      },
    });
  }

  /* ---------------------------------------------------
     LEARN TAB (flashcards)
  --------------------------------------------------- */
  function selectLearnCategory(key) {
    state.selectedLearnCategory = key;
    renderCategoryPills(qs('learnCategoryNav'), key, selectLearnCategory);
    const cat = state.categories.find((c) => c.key === key);
    if (!cat) return;
    state.flashcards.list = cat.questions;
    state.flashcards.index = 0;
    renderFlashcard();
  }

  function renderFlashcard() {
    const { list, index } = state.flashcards;
    if (!list.length) return;
    const q = list[index];

    qs('flashMeta').textContent = `Card ${index + 1} of ${list.length}`;
    qs('flashcard').classList.remove('flipped');
    qs('flashQuestion').textContent = q.question;

    const correctOpt = q.options.find((o) => parseOption(o).letter === q.correct_answer);
    qs('flashAnswer').textContent = correctOpt ? parseOption(correctOpt).text : '';
    qs('flashExplanation').textContent = q.explanation || '';
  }

  function initFlashcardControls() {
    qs('flashcard').addEventListener('click', () => qs('flashcard').classList.toggle('flipped'));

    qs('flashPrevBtn').addEventListener('click', () => {
      const fc = state.flashcards;
      if (!fc.list.length) return;
      fc.index = (fc.index - 1 + fc.list.length) % fc.list.length;
      renderFlashcard();
    });

    qs('flashNextBtn').addEventListener('click', () => {
      const fc = state.flashcards;
      if (!fc.list.length) return;
      fc.index = (fc.index + 1) % fc.list.length;
      renderFlashcard();
    });

    qs('flashShuffleBtn').addEventListener('click', () => {
      state.flashcards.list = shuffle(state.flashcards.list);
      state.flashcards.index = 0;
      renderFlashcard();
    });
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
      return;
    }
    if (!categoriesPracticed) {
      list.innerHTML = '<p class="progress-empty">Take a quiz to see your best scores here.</p>';
      return;
    }

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
     ERROR STATE (e.g. apex_quiz.json missing or blocked)
  --------------------------------------------------- */
  function showLoadError() {
    qs('cardBadge').textContent = 'Error';
    qs('cardTitle').textContent = 'Could not load questions';
    qs('cardDesc').textContent = 'Make sure apex_quiz.json sits alongside index.html and that this page is served over http(s) — opening it directly as a file:// URL blocks the fetch in most browsers.';
    qs('lengthOptions').innerHTML = '';
    qs('examBadge').textContent = 'Error';
  }

  /* ---------------------------------------------------
     INIT
  --------------------------------------------------- */
  async function init() {
    initNav();
    state.progress = loadProgress();

    try {
      await loadQuestions();
    } catch (err) {
      console.error(err);
      showLoadError();
      return;
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
      timerPill: null,
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

    // Learn tab
    renderCategoryPills(qs('learnCategoryNav'), firstCategoryKey, selectLearnCategory);
    selectLearnCategory(firstCategoryKey);
    initFlashcardControls();

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

    // Profile tab
    renderProfile();
    initProfileControls();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
