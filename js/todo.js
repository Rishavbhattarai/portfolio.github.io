// ============================================================
// 1. CONFIGURATION – pulled from config.js (APP_CONFIG.WEB_APP_URL)
// ============================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby2l-HNuSoIMr16j-wYz7H7iq64txWKGOxQzi1aOQcZ9GsoFzYw2sQ8lJgha7KSs-Gy1g/exec'
// ============================================================
// 2. HELPERS & STATE
// ============================================================
function dateKeyFor(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' })
        .format(d).replace(/\//g,'-');
}

const TODAY_KEY = dateKeyFor(new Date());

// The day currently shown on the dashboard. Defaults to today, but the
// trail-nav arrows can walk it backward/forward through the calendar.
let viewDate = TODAY_KEY;

// How many days back to scan for uncompleted tasks that should still
// show up on the current board (carried forward until finished).
// Kept modest and fetched in small batches — Apps Script Web Apps tend
// to queue/serialize a burst of concurrent requests, so firing off too
// many at once can make the whole thing appear to hang.
const CARRY_OVER_LOOKBACK_DAYS = 7;
const CARRY_OVER_BATCH_SIZE = 3;

// DOM refs
const $ = id => document.getElementById(id);
const syncStatus = $('sync-status');
const syncText = $('sync-status-text');
const kanbanCols = {
    'not-started': $('col-not-started'),
    'doing': $('col-doing'),
    'done': $('col-done')
};
const kanbanCounts = {
    'not-started': $('count-not-started'),
    'doing': $('count-doing'),
    'done': $('count-done')
};
const todoInput = $('todo-input');
const todoAddBtn = $('todo-add-btn');
const todoCount = $('todo-count');
const currentDateEl = $('current-date');
const resetBtn = $('reset-btn');
const datePrevBtn = $('date-prev');
const dateNextBtn = $('date-next');
const dateTodayToggle = $('date-today-toggle');
const viewingDateLabel = $('viewing-date-label');
const viewingDateSub = $('viewing-date-sub');

let todos = [];            // full list from sheet for viewDate, plus carried-over items
let dailyData = {};        // all habit fields for viewDate
let isLoaded = false;
let loadToken = 0;         // guards against out-of-order responses while flipping days fast

// ============================================================
// 3. API LAYER with caching
// ============================================================
function setSync(state, label) {
    syncStatus.className = 'sync-status' + (state ? ' status-'+state : '');
    syncText.textContent = label;
}

// Apps Script can queue/serialize concurrent requests and occasionally
// hang rather than error out — give every GET a hard timeout so the UI
// never gets stuck on "Loading...".
function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function apiGet(date, timeoutMs = 12000) {
    const url = `${WEB_APP_URL}?date=${encodeURIComponent(date)}&_=${Date.now()}`;
    return fetchWithTimeout(url, { cache: 'no-store' }, timeoutMs).then(r => r.json());
}

function apiPost(payload) {
    setSync('saving', 'Saving...');
    return fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        setSync(data.ok ? 'ok' : 'error', data.ok ? 'Synced' : 'Failed');
        clearCache(payload.date || viewDate);
        return data;
    })
    .catch(() => { setSync('error','Offline'); throw new Error('Network error'); });
}

// ---- Caching helpers ----
function getCacheKey(date) {
    return `focus_dashboard_${date}`;
}

function loadFromCache(date) {
    try {
        const raw = localStorage.getItem(getCacheKey(date));
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (Date.now() - cached.timestamp > 60000) {
            localStorage.removeItem(getCacheKey(date));
            return null;
        }
        return cached.data;
    } catch (_) {
        return null;
    }
}

function saveToCache(date, data) {
    try {
        localStorage.setItem(getCacheKey(date), JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    } catch (_) {}
}

function clearCache(date) {
    localStorage.removeItem(getCacheKey(date || viewDate));
}

// ============================================================
// 4. KANBAN TODO BOARD (Not Started / Doing / Done)
// ============================================================
// Status is tracked globally by task id (not per-day) so a task carried
// forward from an earlier day keeps the same column wherever it's shown.
const STATUS_KEY = `focus_dashboard_status_map`;
const VALID_STATUSES = ['not-started', 'doing', 'done'];

function loadStatusMap() {
    try {
        return JSON.parse(localStorage.getItem(STATUS_KEY)) || {};
    } catch (_) { return {}; }
}
function saveStatusMap(map) {
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(map)); } catch (_) {}
}

let statusMap = loadStatusMap();

function getStatus(todo) {
    const isCompleted = todo.completed === true || todo.completed === 'true';
    if (statusMap[todo.id]) return statusMap[todo.id];
    return isCompleted ? 'done' : 'not-started';
}

function setStatus(todo, status) {
    statusMap[todo.id] = status;
    saveStatusMap(statusMap);
}

function renderTodos() {
    VALID_STATUSES.forEach(status => {
        const container = kanbanCols[status];
        const tasksInColumn = todos.filter(t => getStatus(t) === status);
        container.innerHTML = '';

        if (tasksInColumn.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'kanban-empty';
            empty.textContent = status === 'done' ? 'Drop tasks here when finished' : 'No tasks';
            container.appendChild(empty);
        } else {
            tasksInColumn.forEach(todo => container.appendChild(buildCard(todo, status)));
        }
        kanbanCounts[status].textContent = tasksInColumn.length;
    });
    updateTodoCounter();
}

function relativeDayLabel(sourceDate) {
    if (sourceDate === viewDate) return null;
    const diffDays = Math.round((new Date(viewDate) - new Date(sourceDate)) / 86400000);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1) return `${diffDays}d ago`;
    return sourceDate;
}

function buildCard(todo, status) {
    const card = document.createElement('div');
    const originLabel = relativeDayLabel(todo.sourceDate || viewDate);
    card.className = 'kanban-card' + (originLabel ? ' carried-over' : '');
    card.draggable = true;
    card.dataset.id = todo.id;
    card.dataset.status = status;
    card.innerHTML = `
        <div class="kanban-card-top">
            <span class="kanban-card-check"><i class="fa-solid fa-check"></i></span>
            <span class="kanban-card-text">${todo.text}</span>
        </div>
        <div class="kanban-card-footer">
            ${originLabel ? `<span class="kanban-card-origin"><i class="fa-solid fa-route"></i> ${originLabel}</span>` : ''}
            <button class="kanban-card-delete" data-id="${todo.id}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;

    card.querySelector('.kanban-card-check').addEventListener('click', (e) => {
        e.stopPropagation();
        const next = status === 'done' ? 'not-started' : 'done';
        moveTask(todo, next);
    });

    card.querySelector('.kanban-card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = todos.findIndex(t => t.id === todo.id);
        if (idx > -1) todos.splice(idx, 1);
        delete statusMap[todo.id];
        saveStatusMap(statusMap);
        renderTodos();
        apiPost({ action:'deleteTodo', id:todo.id });
    });

    card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(todo.id));
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    return card;
}

function moveTask(todo, newStatus) {
    const wasCompleted = todo.completed === true || todo.completed === 'true';
    setStatus(todo, newStatus);

    const shouldBeCompleted = newStatus === 'done';
    if (shouldBeCompleted !== wasCompleted) {
        todo.completed = shouldBeCompleted;
        apiPost({ action:'toggleTodo', id:todo.id, completed:shouldBeCompleted });
    }
    renderTodos();
}

VALID_STATUSES.forEach(status => {
    const column = document.querySelector(`.kanban-column[data-status="${status}"]`);
    column.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', (e) => {
        if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
    });
    column.addEventListener('drop', (e) => {
        e.preventDefault();
        column.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const todo = todos.find(t => String(t.id) === id);
        if (todo) moveTask(todo, status);
    });
});

function updateTodoCounter() {
    const left = todos.filter(t => getStatus(t) !== 'done').length;
    todoCount.textContent = `${left} Task${left!==1?'s':''} left`;
}

function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    todoInput.value = '';
    apiPost({ action:'addTodo', date:viewDate, text })
        .then(data => {
            if (data.ok) {
                data.result.sourceDate = viewDate;
                todos.push(data.result);
                setStatus(data.result, 'not-started');
                renderTodos();
            }
        });
}
todoAddBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keypress', e => { if (e.key==='Enter') addTodo(); });

// ============================================================
// 5. HABIT CARDS – built dynamically from config
// ============================================================
const HABIT_CONFIG = [
    { id:'coffee',   icon:'fa-mug-hot',        label:'Tea after 90m',   desc:'Earned after first vigil',   type:'toggle', field:'Coffee_Completed' },
    { id:'skincare', icon:'fa-leaf',           label:'Elven Care',      desc:'Morning & night rite',        type:'toggle', field:'Skincare_Completed' },
    { id:'jobs',     icon:'fa-scroll',         label:'Scrolls Sent',    desc:'Applications count',          type:'counter', field:'Jobs_Count' },
    { id:'projects', icon:'fa-hammer',         label:'Forged Today',    desc:'Tasks completed',             type:'counter', field:'Projects_Count' },
    { id:'nutrition',icon:'fa-wheat-awn',      label:'The Feast',       desc:'Log macros',                  type:'flip', flipId:'nutrition', fields:['Nutrition_Carbs','Nutrition_Protein','Nutrition_Completed'] },
    { id:'workout',  icon:'fa-shield-halved',  label:'Sparring',        desc:'Log muscle groups',           type:'flip', flipId:'workout', fields:['Workout_Muscles','Workout_Completed'] },
    { id:'salesforce',icon:'fa-book-open',     label:'Lore Studied',    desc:'Log chapter reviewed',        type:'flip', flipId:'salesforce', fields:['Salesforce_Chapter','Salesforce_Completed'] },
    { id:'ritual',   icon:'fa-fire',           label:'The Kindling Rite', desc:'Prime the mind before the Vigil', type:'ritual' }
];

// A small runic flash + a scatter of drifting motes from the icon,
// fired whenever a habit is logged/completed. Purely decorative —
// never touches dailyData or the API.
const MOTE_COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--success)'];
function triggerRuneCelebration(card) {
    card.classList.remove('rune-flash');
    void card.offsetWidth; // restart the flash animation if it's already mid-play
    card.classList.add('rune-flash');
    setTimeout(() => card.classList.remove('rune-flash'), 700);

    const icon = card.querySelector('.habit-icon-wrapper');
    if (!icon) return;
    const rect = icon.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    for (let i = 0; i < 10; i++) {
        const mote = document.createElement('span');
        mote.className = 'mote-burst';
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
        const dist = 30 + Math.random() * 34;
        mote.style.left = `${originX}px`;
        mote.style.top = `${originY}px`;
        mote.style.setProperty('--mote-x', `${Math.cos(angle) * dist}px`);
        mote.style.setProperty('--mote-y', `${Math.sin(angle) * dist}px`);
        mote.style.setProperty('--mote-dur', `${700 + Math.random() * 400}ms`);
        mote.style.setProperty('--mote-color', MOTE_COLORS[Math.floor(Math.random() * MOTE_COLORS.length)]);
        document.body.appendChild(mote);
        mote.addEventListener('animationend', () => mote.remove());
    }
}

// Every habit tile, whatever it logs, flips to reveal its logging
// controls — a brief gold pulse plays on each turn either direction.
function updateRitualDots(card, stepsDone) {
    card.querySelectorAll('.ritual-dot').forEach((dot, i) => dot.classList.toggle('lit', i < stepsDone));
}

function flipPulse(card) {
    card.classList.remove('flip-pulse');
    void card.offsetWidth;
    card.classList.add('flip-pulse');
    setTimeout(() => card.classList.remove('flip-pulse'), 650);
}

function buildHabitGrid() {
    const grid = document.getElementById('habit-grid');
    if (grid.children.length > 0) return;
    grid.style.setProperty('--n', HABIT_CONFIG.length);

    HABIT_CONFIG.forEach((cfg, index) => {
        const card = document.createElement('div');
        card.className = 'habit-card flip-card';
        card.id = `habit-${cfg.id}`;
        card.style.setProperty('--i', index);

        const wireFlipTrigger = (triggerClass) => {
            const trigger = card.querySelector(`.${triggerClass}`);
            trigger.addEventListener('click', e => {
                e.stopPropagation();
                card.classList.toggle('flipped');
                flipPulse(card);
            });
        };

        if (cfg.type === 'toggle') {
            card.innerHTML = `
                <div class="flip-card-inner">
                    <div class="flip-card-front card-face-wrapper">
                        <div class="habit-icon-wrapper color-${cfg.id}"><i class="fa-solid ${cfg.icon}"></i></div>
                        <div class="habit-info"><h3>${cfg.label}</h3><p class="habit-desc" id="${cfg.id}-summary">${cfg.desc}</p></div>
                        <button class="action-trigger-btn ${cfg.id}-flip-trigger">Log</button>
                        <button class="quick-complete-btn" aria-label="Mark ${cfg.label} complete"><i class="fa-solid fa-check"></i></button>
                    </div>
                    <div class="flip-card-back card-face-wrapper">
                        <h4>${cfg.label}</h4>
                        <div class="toggle-flip-row">
                            <button class="toggle-btn" id="btn-${cfg.id}"><i class="fa-solid fa-check"></i><span>Mark Complete</span></button>
                        </div>
                        <button class="save-flip-btn" id="${cfg.id}-save-btn">Done</button>
                    </div>
                </div>
            `;
            wireFlipTrigger(`${cfg.id}-flip-trigger`);
            const btn = card.querySelector('.toggle-btn');
            const btnLabel = btn.querySelector('span');
            const quickBtn = card.querySelector('.quick-complete-btn');
            const summary = card.querySelector(`#${cfg.id}-summary`);

            // Shared by the back-face toggle and the on-tile quick-complete
            // button, so both stay in sync however the habit gets sealed.
            const toggleComplete = () => {
                const completed = !card.classList.contains('completed');
                card.classList.toggle('completed', completed);
                btnLabel.textContent = completed ? 'Completed' : 'Mark Complete';
                summary.textContent = completed ? 'Sealed for today ✓' : cfg.desc;
                if (completed) triggerRuneCelebration(card);
                apiPost({ action:'updateHabit', date:viewDate, field:cfg.field, value:completed });
            };
            btn.addEventListener('click', e => { e.stopPropagation(); toggleComplete(); });
            quickBtn.addEventListener('click', e => { e.stopPropagation(); toggleComplete(); });

            const save = card.querySelector(`#${cfg.id}-save-btn`);
            save.addEventListener('click', e => {
                e.stopPropagation();
                card.classList.remove('flipped');
                if (window.__undockHabitCard) window.__undockHabitCard(card);
            });
        } else if (cfg.type === 'counter') {
            card.innerHTML = `
                <div class="flip-card-inner">
                    <div class="flip-card-front card-face-wrapper">
                        <div class="habit-icon-wrapper color-${cfg.id}"><i class="fa-solid ${cfg.icon}"></i></div>
                        <div class="habit-info"><h3>${cfg.label}</h3><p class="habit-desc" id="${cfg.id}-summary">${cfg.desc}</p></div>
                        <button class="action-trigger-btn ${cfg.id}-flip-trigger">Log</button>
                    </div>
                    <div class="flip-card-back card-face-wrapper">
                        <h4>${cfg.label}</h4>
                        <div class="habit-counter">
                            <button class="counter-btn minus" data-id="${cfg.id}"><i class="fa-solid fa-minus"></i></button>
                            <span class="counter-value" id="val-${cfg.id}">0</span>
                            <button class="counter-btn plus" data-id="${cfg.id}"><i class="fa-solid fa-plus"></i></button>
                        </div>
                        <button class="save-flip-btn" id="${cfg.id}-save-btn">Done</button>
                    </div>
                </div>
            `;
            wireFlipTrigger(`${cfg.id}-flip-trigger`);
            const summary = card.querySelector(`#${cfg.id}-summary`);
            card.querySelectorAll('.counter-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const delta = btn.classList.contains('plus') ? 1 : -1;
                    const valSpan = document.getElementById(`val-${cfg.id}`);
                    let val = parseInt(valSpan.textContent, 10) || 0;
                    val = Math.max(0, val + delta);
                    valSpan.textContent = val;
                    card.classList.toggle('active', val > 0);
                    summary.textContent = val > 0 ? `${val} logged today` : cfg.desc;
                    if (delta > 0) triggerRuneCelebration(card);
                    apiPost({ action:'updateHabit', date:viewDate, field:cfg.field, value:val });
                });
            });
            const save = card.querySelector(`#${cfg.id}-save-btn`);
            save.addEventListener('click', e => {
                e.stopPropagation();
                card.classList.remove('flipped');
                if (window.__undockHabitCard) window.__undockHabitCard(card);
            });
        } else if (cfg.type === 'flip') {
            const flipId = cfg.flipId;
            let backContent = '';
            if (flipId === 'nutrition') {
                backContent = `
                    <h4>Log Nutrition</h4>
                    <div class="input-row"><label>Carbs (g)</label><input type="number" id="nutrition-carbs" placeholder="0" min="0"></div>
                    <div class="input-row"><label>Protein (g)</label><input type="number" id="nutrition-protein" placeholder="0" min="0"></div>
                    <button class="save-flip-btn" id="nutrition-save-btn">Done</button>
                `;
            } else if (flipId === 'workout') {
                const muscles = ['Leg','Shoulder','Chest','Biceps','Triceps','Abs','Back'];
                const pills = muscles.map(m => `<button class="workout-pill" data-muscle="${m}">${m}</button>`).join('');
                backContent = `
                    <h4>Target Areas</h4>
                    <div class="workout-pill-container">${pills}</div>
                    <button class="save-flip-btn" id="workout-save-btn">Done</button>
                `;
            } else if (flipId === 'salesforce') {
                const chapters = Array.from({length:10}, (_,i) => `Chapter ${i+1}`);
                const options = chapters.map(c => `<option value="${c}">${c}</option>`).join('');
                backContent = `
                    <h4>Chapter Reviewed</h4>
                    <div class="select-wrapper"><select id="salesforce-chapter-select"><option value="" disabled selected>Select...</option>${options}</select></div>
                    <button class="save-flip-btn" id="salesforce-save-btn">Done</button>
                `;
            }
            card.innerHTML = `
                <div class="flip-card-inner">
                    <div class="flip-card-front card-face-wrapper">
                        <div class="habit-icon-wrapper color-${cfg.id}"><i class="fa-solid ${cfg.icon}"></i></div>
                        <div class="habit-info"><h3>${cfg.label}</h3><p class="habit-desc" id="${flipId}-summary">${cfg.desc}</p></div>
                        <button class="action-trigger-btn ${flipId}-flip-trigger">Log</button>
                    </div>
                    <div class="flip-card-back card-face-wrapper">${backContent}</div>
                </div>
            `;
            const trigger = card.querySelector(`.${flipId}-flip-trigger`);
            trigger.addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('flipped'); flipPulse(card); });
            if (flipId === 'nutrition') {
                const save = card.querySelector('#nutrition-save-btn');
                save.addEventListener('click', e => {
                    e.stopPropagation();
                    const carbs = document.getElementById('nutrition-carbs').value || '';
                    const protein = document.getElementById('nutrition-protein').value || '';
                    const completed = !!(carbs || protein);
                    card.classList.remove('flipped');
                    if (window.__undockHabitCard) window.__undockHabitCard(card);
                    if (completed) {
                        card.classList.add('active-nutrition');
                        document.getElementById('nutrition-summary').textContent = `Carbs: ${carbs||0}g | Protein: ${protein||0}g`;
                        triggerRuneCelebration(card);
                    } else {
                        card.classList.remove('active-nutrition');
                        document.getElementById('nutrition-summary').textContent = 'Break bread and log the feast';
                    }
                    apiPost({ action:'updateHabitFields', date:viewDate, fields: {
                        Nutrition_Carbs: carbs,
                        Nutrition_Protein: protein,
                        Nutrition_Completed: completed
                    }});
                });
            } else if (flipId === 'workout') {
                const save = card.querySelector('#workout-save-btn');
                save.addEventListener('click', e => {
                    e.stopPropagation();
                    const pills = card.querySelectorAll('.workout-pill.active');
                    const muscles = Array.from(pills).map(p => p.dataset.muscle);
                    const completed = muscles.length > 0;
                    const str = muscles.join(', ');
                    card.classList.remove('flipped');
                    if (window.__undockHabitCard) window.__undockHabitCard(card);
                    if (completed) {
                        card.classList.add('active-workout');
                        document.getElementById('workout-summary').textContent = str;
                        triggerRuneCelebration(card);
                    } else {
                        card.classList.remove('active-workout');
                        document.getElementById('workout-summary').textContent = 'Log the day\'s sparring';
                    }
                    apiPost({ action:'updateHabitFields', date:viewDate, fields: {
                        Workout_Muscles: str,
                        Workout_Completed: completed
                    }});
                });
                card.querySelectorAll('.workout-pill').forEach(p => {
                    p.addEventListener('click', e => { e.stopPropagation(); p.classList.toggle('active'); });
                });
            } else if (flipId === 'salesforce') {
                const save = card.querySelector('#salesforce-save-btn');
                save.addEventListener('click', e => {
                    e.stopPropagation();
                    const select = document.getElementById('salesforce-chapter-select');
                    const chapter = select.value;
                    const completed = !!chapter;
                    card.classList.remove('flipped');
                    if (window.__undockHabitCard) window.__undockHabitCard(card);
                    if (completed) {
                        card.classList.add('active-salesforce');
                        document.getElementById('salesforce-summary').textContent = `Learned: ${chapter}`;
                        triggerRuneCelebration(card);
                    } else {
                        card.classList.remove('active-salesforce');
                        document.getElementById('salesforce-summary').textContent = 'Log the lore studied';
                    }
                    apiPost({ action:'updateHabitFields', date:viewDate, fields: {
                        Salesforce_Chapter: chapter,
                        Salesforce_Completed: completed
                    }});
                });
            }
        } else if (cfg.type === 'ritual') {
            card.innerHTML = `
                <div class="flip-card-inner">
                    <div class="flip-card-front card-face-wrapper">
                        <div class="habit-icon-wrapper color-ritual ritual-flame"><i class="fa-solid ${cfg.icon}"></i></div>
                        <div class="habit-info">
                            <h3>${cfg.label}</h3>
                            <p class="habit-desc" id="ritual-summary">${cfg.desc}</p>
                            <div class="ritual-progress-dots" id="ritual-progress-dots">
                                <span class="ritual-dot" data-step="1"></span>
                                <span class="ritual-dot" data-step="2"></span>
                                <span class="ritual-dot" data-step="3"></span>
                                <span class="ritual-dot" data-step="4"></span>
                                <span class="ritual-dot" data-step="5"></span>
                            </div>
                        </div>
                        <button class="action-trigger-btn ritual-flip-trigger">Log</button>
                    </div>
                    <div class="flip-card-back card-face-wrapper ritual-back">
                        <h4>${cfg.label}</h4>
                        <div class="ritual-wizard">
                            <div class="ritual-nodes">
                                <button class="ritual-node" data-step="1" type="button" aria-label="Set Your Baseline"><i class="fa-solid fa-book-open"></i></button>
                                <span class="ritual-node-line" data-line="1"></span>
                                <button class="ritual-node" data-step="2" type="button" aria-label="No-Phone Zone"><i class="fa-solid fa-mobile-screen-button"></i></button>
                                <span class="ritual-node-line" data-line="2"></span>
                                <button class="ritual-node" data-step="3" type="button" aria-label="The Rite"><i class="fa-solid fa-fire"></i></button>
                                <span class="ritual-node-line" data-line="3"></span>
                                <button class="ritual-node" data-step="4" type="button" aria-label="Why This Matters"><i class="fa-solid fa-feather"></i></button>
                                <span class="ritual-node-line" data-line="4"></span>
                                <button class="ritual-node" data-step="5" type="button" aria-label="Begin the Vigil"><i class="fa-solid fa-hourglass-start"></i></button>
                            </div>
                            <div class="ritual-panels">
                                <div class="ritual-panel is-active" data-panel="1">
                                    <p class="ritual-panel-title">Set Your Baseline</p>
                                    <div class="input-row"><label>Pages read</label><input type="number" id="ritual-pages" placeholder="0" min="0"></div>
                                    <div class="ritual-stopwatch-row">
                                        <span class="ritual-stopwatch" id="ritual-stopwatch-display">00:00</span>
                                        <button class="ritual-stopwatch-btn" id="ritual-stopwatch-toggle" type="button">Start</button>
                                        <button class="ritual-stopwatch-btn ritual-stopwatch-reset" id="ritual-stopwatch-reset" type="button">Reset</button>
                                    </div>
                                </div>
                                <div class="ritual-panel" data-panel="2">
                                    <p class="ritual-panel-title">No-Phone Zone</p>
                                    <button class="toggle-btn" id="ritual-nophone-btn" type="button"><i class="fa-solid fa-mobile-screen-button"></i><span>Phone Banished</span></button>
                                </div>
                                <div class="ritual-panel" data-panel="3">
                                    <p class="ritual-panel-title">The Rite</p>
                                    <p class="ritual-flavor">Three breaths. Spine straight. Begin.</p>
                                    <button class="toggle-btn" id="ritual-primed-btn" type="button"><i class="fa-solid fa-check"></i><span>Rite Performed</span></button>
                                </div>
                                <div class="ritual-panel" data-panel="4">
                                    <p class="ritual-panel-title">Why This Matters</p>
                                    <textarea id="ritual-why" rows="3" placeholder="Why does this session matter today?"></textarea>
                                </div>
                                <div class="ritual-panel" data-panel="5">
                                    <p class="ritual-panel-title">Begin the Vigil</p>
                                    <p class="ritual-flavor" id="ritual-vigil-status">The Vigil has not yet begun.</p>
                                    <button class="save-flip-btn" id="ritual-begin-vigil-btn" type="button">Kindle the Vigil</button>
                                </div>
                            </div>
                            <div class="ritual-wizard-nav">
                                <button class="ritual-nav-btn" id="ritual-back-btn" type="button"><i class="fa-solid fa-chevron-left"></i> Back</button>
                                <button class="save-flip-btn ritual-nav-save" id="ritual-save-btn" type="button">Done</button>
                                <button class="ritual-nav-btn" id="ritual-next-btn" type="button">Next <i class="fa-solid fa-chevron-right"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            wireFlipTrigger(`${cfg.id}-flip-trigger`);

            const nodes = Array.from(card.querySelectorAll('.ritual-node'));
            const lines = Array.from(card.querySelectorAll('.ritual-node-line'));
            const panels = Array.from(card.querySelectorAll('.ritual-panel'));
            const backBtn = card.querySelector('#ritual-back-btn');
            const nextBtn = card.querySelector('#ritual-next-btn');

            let activeStep = 1;
            const goToStep = (n) => {
                activeStep = Math.min(5, Math.max(1, n));
                panels.forEach(p => p.classList.toggle('is-active', Number(p.dataset.panel) === activeStep));
                nodes.forEach(node => node.classList.toggle('is-active', Number(node.dataset.step) === activeStep));
                backBtn.classList.toggle('is-hidden', activeStep === 1);
                nextBtn.classList.toggle('is-hidden', activeStep === 5);
            };
            card.__ritualGoToStep = goToStep;
            nodes.forEach(node => node.addEventListener('click', e => { e.stopPropagation(); goToStep(Number(node.dataset.step)); }));
            backBtn.addEventListener('click', e => { e.stopPropagation(); goToStep(activeStep - 1); });
            nextBtn.addEventListener('click', e => { e.stopPropagation(); goToStep(activeStep + 1); });

            // Local stopwatch for the baseline reading step — deliberately
            // separate from the main Vigil timer below.
            let ritualElapsed = 0;
            let ritualInterval = null;
            const swDisplay = card.querySelector('#ritual-stopwatch-display');
            const swToggle = card.querySelector('#ritual-stopwatch-toggle');
            const swReset = card.querySelector('#ritual-stopwatch-reset');
            swToggle.addEventListener('click', e => {
                e.stopPropagation();
                if (ritualInterval) {
                    clearInterval(ritualInterval);
                    ritualInterval = null;
                    swToggle.textContent = 'Start';
                } else {
                    swToggle.textContent = 'Stop';
                    ritualInterval = setInterval(() => {
                        ritualElapsed++;
                        swDisplay.textContent = formatTime(ritualElapsed);
                        updateProgress();
                    }, 1000);
                }
                updateProgress();
            });
            swReset.addEventListener('click', e => {
                e.stopPropagation();
                clearInterval(ritualInterval);
                ritualInterval = null;
                ritualElapsed = 0;
                swDisplay.textContent = '00:00';
                swToggle.textContent = 'Start';
                updateProgress();
            });
            // applyDailyState restores elapsed time through this hook,
            // since ritualElapsed otherwise only lives in this closure.
            card.__ritualSetElapsed = (secs) => {
                ritualElapsed = Number(secs) || 0;
                swDisplay.textContent = formatTime(ritualElapsed);
            };

            const wireStepToggle = (btnId, onText, offText, stepNum) => {
                const btn = card.querySelector(`#${btnId}`);
                const label = btn.querySelector('span');
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const on = !btn.classList.contains('completed');
                    btn.classList.toggle('completed', on);
                    label.textContent = on ? onText : offText;
                    updateProgress();
                    // A single decisive tap — carry the ritual forward
                    // instead of waiting for another click.
                    if (on) setTimeout(() => { if (activeStep === stepNum) goToStep(stepNum + 1); }, 500);
                });
                return btn;
            };
            const noPhoneBtn = wireStepToggle('ritual-nophone-btn', 'Phone Banished ✓', 'Phone Banished', 2);
            const primedBtn = wireStepToggle('ritual-primed-btn', 'Rite Performed ✓', 'Rite Performed', 3);

            const pagesInput = card.querySelector('#ritual-pages');
            const whyInput = card.querySelector('#ritual-why');
            pagesInput.addEventListener('input', () => updateProgress());
            whyInput.addEventListener('input', () => updateProgress());

            // Recomputes which steps are satisfied and reflects that on the
            // node trail, the front-face dots, and the Vigil status line —
            // called after every edit so the wizard never looks stale.
            function updateProgress() {
                const pages = pagesInput.value || '';
                const why = whyInput.value || '';
                const noPhone = noPhoneBtn.classList.contains('completed');
                const primed = primedBtn.classList.contains('completed');
                const vigilStarted = !!(Number(dailyData.Pomodoros_Completed) > 0 || Number(dailyData.Focus_Minutes) > 0);
                // One flag per step/node, in step order: baseline (pages OR
                // stopwatch), no-phone, the rite, why-it-matters, the Vigil.
                const doneFlags = [
                    Number(pages) > 0 || ritualElapsed > 0,
                    noPhone,
                    primed,
                    !!why.trim(),
                    vigilStarted
                ];
                nodes.forEach((node, i) => node.classList.toggle('is-lit', doneFlags[i]));
                lines.forEach((line, i) => line.classList.toggle('is-lit', doneFlags[i]));
                const stepsDone = doneFlags.filter(Boolean).length;
                updateRitualDots(card, stepsDone);
                const vigilStatus = card.querySelector('#ritual-vigil-status');
                if (vigilStatus) vigilStatus.textContent = vigilStarted ? 'The Vigil has been kindled today ✓' : 'The Vigil has not yet begun.';
                return stepsDone;
            }
            card.__ritualUpdateProgress = updateProgress;
            updateProgress();

            const saveRitual = () => {
                const pages = pagesInput.value || '';
                const noPhone = noPhoneBtn.classList.contains('completed');
                const primed = primedBtn.classList.contains('completed');
                const why = whyInput.value || '';
                const stepsDone = updateProgress();
                const summary = card.querySelector('#ritual-summary');
                summary.textContent = stepsDone >= 5 ? 'The Rite is complete ✓' : `${stepsDone}/5 steps kindled`;
                card.classList.toggle('active-ritual', stepsDone >= 5);
                if (stepsDone >= 5) triggerRuneCelebration(card);
                apiPost({ action:'updateHabitFields', date:viewDate, fields: {
                    Ritual_Pages: pages,
                    Ritual_Baseline_Seconds: ritualElapsed,
                    Ritual_NoPhone: noPhone,
                    Ritual_Primed: primed,
                    Ritual_Why: why
                }});
            };

            card.querySelector('#ritual-save-btn').addEventListener('click', e => {
                e.stopPropagation();
                saveRitual();
                card.classList.remove('flipped');
                goToStep(1);
                if (window.__undockHabitCard) window.__undockHabitCard(card);
            });
            card.querySelector('#ritual-begin-vigil-btn').addEventListener('click', e => {
                e.stopPropagation();
                saveRitual();
                card.classList.remove('flipped');
                goToStep(1);
                if (window.__undockHabitCard) window.__undockHabitCard(card);
                if (window.__openTimerOverlay) window.__openTimerOverlay();
            });
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'habit-dock-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.__undockHabitCard) window.__undockHabitCard(card);
        });
        card.appendChild(closeBtn);

        grid.appendChild(card);
    });
}

// ============================================================
// 6. APPLY DAILY STATE FROM SHEET
// ============================================================
function applyDailyState(daily) {
    daily = daily || {};
    dailyData = daily;
    ['coffee','skincare'].forEach(id => {
        const cfg = HABIT_CONFIG.find(h => h.id === id);
        const completed = !!daily[cfg.field];
        const card = document.getElementById(`habit-${id}`);
        card.classList.toggle('completed', completed);
        const label = card.querySelector('.toggle-btn span');
        if (label) label.textContent = completed ? 'Completed' : 'Mark Complete';
        const summary = document.getElementById(`${id}-summary`);
        if (summary) summary.textContent = completed ? 'Sealed for today ✓' : cfg.desc;
    });
    ['jobs','projects'].forEach(id => {
        const cfg = HABIT_CONFIG.find(h => h.id === id);
        const val = Number(daily[cfg.field]) || 0;
        document.getElementById(`val-${id}`).textContent = val;
        document.getElementById(`habit-${id}`).classList.toggle('active', val > 0);
        const summary = document.getElementById(`${id}-summary`);
        if (summary) summary.textContent = val > 0 ? `${val} logged today` : cfg.desc;
    });
    const nutrCard = document.getElementById('habit-nutrition');
    if (daily.Nutrition_Completed) {
        nutrCard.classList.add('active-nutrition');
        document.getElementById('nutrition-summary').textContent = `Carbs: ${daily.Nutrition_Carbs||0}g | Protein: ${daily.Nutrition_Protein||0}g`;
    } else {
        nutrCard.classList.remove('active-nutrition');
        document.getElementById('nutrition-summary').textContent = 'Break bread and log the feast';
    }
    document.getElementById('nutrition-carbs').value = daily.Nutrition_Carbs || '';
    document.getElementById('nutrition-protein').value = daily.Nutrition_Protein || '';
    const workCard = document.getElementById('habit-workout');
    const muscles = daily.Workout_Muscles ? daily.Workout_Muscles.split(',').map(s => s.trim()).filter(Boolean) : [];
    workCard.querySelectorAll('.workout-pill').forEach(p => {
        p.classList.toggle('active', muscles.includes(p.dataset.muscle));
    });
    if (daily.Workout_Completed) {
        workCard.classList.add('active-workout');
        document.getElementById('workout-summary').textContent = muscles.join(', ');
    } else {
        workCard.classList.remove('active-workout');
        document.getElementById('workout-summary').textContent = 'Log the day\'s sparring';
    }
    const sfCard = document.getElementById('habit-salesforce');
    if (daily.Salesforce_Completed) {
        sfCard.classList.add('active-salesforce');
        document.getElementById('salesforce-summary').textContent = `Learned: ${daily.Salesforce_Chapter}`;
    } else {
        sfCard.classList.remove('active-salesforce');
        document.getElementById('salesforce-summary').textContent = 'Log the lore studied';
    }
    const sfSelect = document.getElementById('salesforce-chapter-select');
    if (daily.Salesforce_Chapter) sfSelect.value = daily.Salesforce_Chapter;
    document.getElementById('pomodoro-count').textContent = daily.Pomodoros_Completed || 0;
    document.getElementById('productive-minutes').textContent = daily.Focus_Minutes || 0;

    [1, 2, 3].forEach(n => {
        const box = document.getElementById(`inspiration-${n}`);
        if (box) box.value = daily[`Inspiration_${n}`] || '';
    });

    const ritualCard = document.getElementById('habit-ritual');
    if (ritualCard) {
        const pages = daily.Ritual_Pages || '';
        const elapsed = Number(daily.Ritual_Baseline_Seconds) || 0;
        const noPhone = !!daily.Ritual_NoPhone;
        const primed = !!daily.Ritual_Primed;
        const why = daily.Ritual_Why || '';

        const pagesInput = document.getElementById('ritual-pages');
        if (pagesInput) pagesInput.value = pages;
        if (ritualCard.__ritualSetElapsed) ritualCard.__ritualSetElapsed(elapsed);

        const noPhoneBtn = document.getElementById('ritual-nophone-btn');
        if (noPhoneBtn) {
            noPhoneBtn.classList.toggle('completed', noPhone);
            const label = noPhoneBtn.querySelector('span');
            if (label) label.textContent = noPhone ? 'Phone Banished ✓' : 'Phone Banished';
        }
        const primedBtn = document.getElementById('ritual-primed-btn');
        if (primedBtn) {
            primedBtn.classList.toggle('completed', primed);
            const label = primedBtn.querySelector('span');
            if (label) label.textContent = primed ? 'Rite Performed ✓' : 'Rite Performed';
        }
        const whyInput = document.getElementById('ritual-why');
        if (whyInput) whyInput.value = why;

        // The wizard's own closure (pagesInput/toggles/textarea/elapsed)
        // now holds the source of truth for lit nodes and the Vigil line —
        // just point it at a fresh day and let it recompute.
        if (ritualCard.__ritualGoToStep) ritualCard.__ritualGoToStep(1);
        const stepsDone = ritualCard.__ritualUpdateProgress ? ritualCard.__ritualUpdateProgress() : 0;
        const ritualCfg = HABIT_CONFIG.find(h => h.id === 'ritual');
        const summary = document.getElementById('ritual-summary');
        if (summary) summary.textContent = stepsDone >= 5 ? 'The Rite is complete ✓' : (stepsDone > 0 ? `${stepsDone}/5 steps kindled` : ritualCfg.desc);
        ritualCard.classList.toggle('active-ritual', stepsDone >= 5);
    }
}

// ============================================================
// 7. LOAD DATA – current day + carried-over tasks from prior days
// ============================================================
function priorDateKeys(fromDate, count) {
    const keys = [];
    const base = new Date(fromDate + 'T00:00:00');
    for (let i = 1; i <= count; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() - i);
        keys.push(dateKeyFor(d));
    }
    return keys;
}

async function fetchCarryOverTasks(forDate) {
    const keys = priorDateKeys(forDate, CARRY_OVER_LOOKBACK_DAYS);
    const merged = [];
    const seen = new Set();

    // Small sequential batches rather than one big Promise.all — avoids
    // slamming the Apps Script endpoint with a dozen+ concurrent hits.
    for (let i = 0; i < keys.length; i += CARRY_OVER_BATCH_SIZE) {
        const batch = keys.slice(i, i + CARRY_OVER_BATCH_SIZE);
        const results = await Promise.all(batch.map(k =>
            apiGet(k, 8000)
                .then(data => (data && data.ok && data.todos) ? data.todos.map(t => ({ ...t, sourceDate: k })) : [])
                .catch(() => [])
        ));
        results.forEach(list => list.forEach(t => {
            const isCompleted = t.completed === true || t.completed === 'true';
            if (isCompleted || seen.has(t.id)) return;
            seen.add(t.id);
            merged.push(t);
        }));
    }
    return merged;
}

function loadFromSheet() {
    const cached = loadFromCache(viewDate);
    if (cached) {
        applyDailyState(cached.daily);
        todos = (cached.todos || []).map(t => ({ ...t, sourceDate: t.sourceDate || viewDate }));
        renderTodos();
        setSync('ok', 'Cached');
        isLoaded = true;
        fetchFreshData();
        return;
    }
    fetchFreshData();
}

function fetchFreshData() {
    const myToken = ++loadToken;
    setSync('saving', 'Loading...');
    apiGet(viewDate)
        .then(data => {
            if (myToken !== loadToken) return; // a newer day was requested meanwhile
            if (!data.ok) { setSync('error','Failed'); console.error(data.error); return; }
            saveToCache(viewDate, { daily: data.daily, todos: data.todos });
            applyDailyState(data.daily);
            todos = (data.todos || []).map(t => ({ ...t, sourceDate: viewDate }));
            renderTodos();
            setSync('ok', 'Synced');
            isLoaded = true;

            // Carry-over tasks are a nice-to-have — fetch them in the
            // background so a slow/stuck Apps Script call never blocks
            // the main board from rendering.
            fetchCarryOverTasks(viewDate)
                .then(carryOver => {
                    if (myToken !== loadToken) return;
                    const ownIds = new Set(todos.map(t => t.id));
                    const extra = carryOver.filter(t => !ownIds.has(t.id));
                    if (extra.length) {
                        todos = todos.concat(extra);
                        renderTodos();
                    }
                })
                .catch(() => { /* silently skip carry-over on failure */ });
        })
        .catch(() => { if (myToken === loadToken) setSync('error','Offline'); });
}

// ============================================================
// 8. TRAIL NAVIGATION — walk between days
// ============================================================
function shiftViewDate(deltaDays) {
    const d = new Date(viewDate + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    viewDate = dateKeyFor(d);
    onViewDateChanged();
}

function jumpToToday() {
    if (viewDate === TODAY_KEY) return;
    viewDate = TODAY_KEY;
    onViewDateChanged();
}

function onViewDateChanged() {
    updateDateNavUI();
    updateTimerAvailability();
    loadFromSheet();
}

function updateDateNavUI() {
    const isToday = viewDate === TODAY_KEY;
    dateTodayToggle.classList.toggle('is-today', isToday);
    if (isToday) {
        viewingDateLabel.textContent = 'Today';
        viewingDateSub.textContent = 'The Present Hour';
    } else {
        const d = new Date(viewDate + 'T00:00:00');
        viewingDateLabel.textContent = d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
        const diffDays = Math.round((new Date(TODAY_KEY) - new Date(viewDate)) / 86400000);
        viewingDateSub.textContent = diffDays > 0 ? `${diffDays} Day${diffDays!==1?'s':''} Past` : 'Yet To Come';
    }
}

datePrevBtn.addEventListener('click', () => shiftViewDate(-1));
dateNextBtn.addEventListener('click', () => shiftViewDate(1));
dateTodayToggle.addEventListener('click', jumpToToday);

// ============================================================
// 9. TIMER — a stopwatch ascent: counts up until tapped, no fixed
//    duration. Logs the trekked minutes to the sheet once stopped.
// ============================================================
let elapsedSeconds = 0;
let timerInterval = null;
let isRunning = false;

const timerBox = $('timer-box');
const timerDisplay = $('timer-display');
const timerStatus = $('timer-status');
const phaseBadge = $('timer-phase-badge');
const pomodoroCountEl = $('pomodoro-count');
const productiveMinutesEl = $('productive-minutes');
const circle = document.querySelector('.progress-ring__circle');
const iconField = $('timer-icon-field');

const radius = circle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = circumference;

// One lap of the ring = 25 minutes kept, purely a visual cue.
const RING_LAP_SECONDS = 25 * 60;

const SPACE_ICONS = [
    'fa-ring', 'fa-shield-halved', 'fa-scroll', 'fa-book-open', 'fa-feather',
    'fa-leaf', 'fa-tree', 'fa-mountain', 'fa-fire-flame-curved', 'fa-gem',
    'fa-crown', 'fa-hat-wizard', 'fa-wand-magic-sparkles', 'fa-dove', 'fa-moon',
    'fa-sun', 'fa-compass', 'fa-map', 'fa-hammer', 'fa-key',
    'fa-eye', 'fa-star', 'fa-wind', 'fa-mug-hot', 'fa-khanda'
];

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerUI() {
    timerDisplay.textContent = formatTime(elapsedSeconds);
    const lapProgress = (elapsedSeconds % RING_LAP_SECONDS) / RING_LAP_SECONDS * 100;
    const offset = circumference - (lapProgress / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

// Scatter 25 themed sigils around the ring; they drift/fade on a loop
// for as long as a vigil is kept.
function spawnDriftIcons() {
    iconField.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const el = document.createElement('i');
        const icon = SPACE_ICONS[Math.floor(Math.random() * SPACE_ICONS.length)];
        el.className = `fa-solid ${icon} drift-icon`;
        const angle = Math.random() * Math.PI * 2;
        const radiusPct = 34 + Math.random() * 22; // keep icons near the ring, not center
        const left = 50 + Math.cos(angle) * radiusPct;
        const top = 50 + Math.sin(angle) * radiusPct;
        el.style.left = `${left}%`;
        el.style.top = `${top}%`;
        el.style.fontSize = `${8 + Math.random() * 8}px`;
        el.style.setProperty('--drift-op', (0.35 + Math.random() * 0.4).toFixed(2));
        el.style.animationDuration = `${3 + Math.random() * 4}s`;
        el.style.animationDelay = `${Math.random() * 4}s`;
        const palette = ['var(--accent)','var(--accent-2)','var(--success)','var(--warn)','var(--c-projects)','var(--text-dim)'];
        el.style.color = palette[Math.floor(Math.random() * palette.length)];
        iconField.appendChild(el);
    }
}

function clearDriftIcons() {
    iconField.innerHTML = '';
}

function startTimer() {
    if (viewDate !== TODAY_KEY) return; // the vigil is only kept for the live day
    if (timerInterval) clearInterval(timerInterval);
    isRunning = true;
    timerBox.classList.add('running');
    timerStatus.textContent = 'TOUCH TO SEAL THE VIGIL';
    spawnDriftIcons();

    timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimerUI();
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    timerBox.classList.remove('running');
    clearDriftIcons();

    const minutes = Math.round(elapsedSeconds / 60);
    if (minutes >= 1) {
        timerStatus.textContent = 'INSCRIBING THE SCROLL...';
        apiPost({ action: 'logFocusSession', date: TODAY_KEY, minutes: minutes })
            .then(data => {
                if (data.ok) {
                    pomodoroCountEl.textContent = data.result.Pomodoros_Completed || 0;
                    productiveMinutesEl.textContent = data.result.Focus_Minutes || 0;
                }
                timerStatus.textContent = 'TOUCH TO KINDLE';
            })
            .catch(() => { timerStatus.textContent = 'TOUCH TO KINDLE'; });
    } else {
        timerStatus.textContent = 'TOUCH TO KINDLE';
    }

    elapsedSeconds = 0;
    updateTimerUI();
}

function toggleTimer() {
    if (viewDate !== TODAY_KEY) {
        jumpToToday();
        return;
    }
    if (isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function updateTimerAvailability() {
    const isToday = viewDate === TODAY_KEY;
    timerBox.classList.toggle('inactive-day', !isToday);
    if (!isToday) {
        if (isRunning) stopTimer();
        timerStatus.textContent = 'RETURN TO TODAY TO KINDLE';
    } else if (!isRunning) {
        timerStatus.textContent = 'TOUCH TO KINDLE';
    }
}

timerBox.addEventListener('click', () => toggleTimer());

// ============================================================
// 10. RESET DAY
// ============================================================
resetBtn.addEventListener('click', () => {
    if (!confirm(`Unmake the day's record and clear the ledger for ${viewDate}?`)) return;

    apiPost({ action: 'resetDay', date: viewDate }).then(data => {
        if (data.ok) {
            applyDailyState(data.result);
            loadFromSheet();
        }
    });

    if (viewDate === TODAY_KEY) {
        if (isRunning) stopTimer();
        elapsedSeconds = 0;
        updateTimerUI();
        timerStatus.textContent = 'TOUCH TO KINDLE';
    }
});

// ============================================================
// 11. DATE HEADER (wall-clock "today", independent of viewDate)
// ============================================================
function updateDate() {
    const options = {
        timeZone: 'America/Los_Angeles',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    currentDateEl.textContent = `${new Date().toLocaleDateString('en-US', options)} (Pacific Time)`;
}

// ============================================================
// 12. INIT
// ============================================================
function init() {
    buildHabitGrid();
    updateDate();
    updateDateNavUI();
    updateTimerUI();
    loadFromSheet();
}
init();

// ============================================================
// 13. FRONT-END-ONLY ENHANCEMENTS (console UI + light motion)
// Purely presentational: no Sheet reads/writes, no changes to any
// habit/todo/timer data. Safe to strip out without touching state.
// ============================================================

// ---- Ambient motes (a handful of twinkling dots over the ambient glow) ----
(function buildStarfield() {
    const field = document.createElement('div');
    field.className = 'starfield';
    field.setAttribute('aria-hidden', 'true');
    document.body.prepend(field);

    // Kept deliberately light (a few dozen elements, CSS-only keyframes)
    // so it stays smooth on low-powered phones and GitHub Pages' static
    // hosting — no per-frame JS anywhere in here.
    const small = window.matchMedia('(max-width: 600px)').matches;
    const count = small ? 22 : 35;
    for (let i = 0; i < count; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
        star.style.top = `${(Math.random() * 100).toFixed(2)}%`;
        const size = (Math.random() * 1.6 + 0.6).toFixed(2);
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
        star.style.animationDuration = `${(3 + Math.random() * 3).toFixed(2)}s`;
        field.appendChild(star);
    }

    // Forge-ash: a slow updraft of embers crossing the whole hall.
    // Long, staggered durations keep any two from pulsing in sync.
    const EMBER_COLORS = ['var(--accent)', 'var(--accent-2)', '#d99a52'];
    const emberCount = small ? 10 : 18;
    for (let i = 0; i < emberCount; i++) {
        const ember = document.createElement('span');
        ember.className = 'ember';
        ember.style.left = `${(Math.random() * 100).toFixed(2)}%`;
        ember.style.setProperty('--ember-size', `${(Math.random() * 2.2 + 1.4).toFixed(2)}px`);
        ember.style.setProperty('--ember-x', `${(Math.random() * 120 - 60).toFixed(0)}px`);
        ember.style.setProperty('--ember-dur', `${(13 + Math.random() * 14).toFixed(1)}s`);
        ember.style.setProperty('--ember-delay', `${(Math.random() * -26).toFixed(1)}s`);
        ember.style.setProperty('--ember-op', (0.3 + Math.random() * 0.45).toFixed(2));
        ember.style.setProperty('--ember-color', EMBER_COLORS[i % EMBER_COLORS.length]);
        field.appendChild(ember);
    }
})();

// ---- Inspiration strip: three standing, always-visible verses the
// steward writes for themself. Autosaves on blur — no dock, no modal,
// just three big boxes above the ledger. ----
(function initInspirationBoxes() {
    [1, 2, 3].forEach(n => {
        const box = document.getElementById(`inspiration-${n}`);
        if (!box) return;
        const wrapper = box.closest('.inspiration-box');
        let lastSaved = box.value;
        box.addEventListener('blur', () => {
            if (box.value === lastSaved) return;
            lastSaved = box.value;
            apiPost({ action: 'updateHabit', date: viewDate, field: `Inspiration_${n}`, value: box.value });
            if (wrapper) {
                wrapper.classList.remove('flash');
                void wrapper.offsetWidth;
                wrapper.classList.add('flash');
            }
        });
    });
})();

// ---- Habit orbit docking: everything lives on one screen now, so
// tapping a satellite tile pulls it into the center to log it instead
// of switching to a separate "Habits" tab. First tap always docks
// (even if it lands on an inner button); once docked, the tile's own
// toggle/counter/flip controls behave exactly as before. ----
(function setupHabitDocking() {
    const orbit = document.getElementById('habit-grid');
    const backdrop = document.getElementById('orbit-backdrop');
    if (!orbit || !backdrop) return;

    function dock(card) {
        const already = orbit.querySelector('.habit-card.docked');
        if (already && already !== card) undock(already);
        card.classList.add('docked');
        orbit.classList.add('has-docked');
        backdrop.classList.add('is-active');
    }
    function undock(card) {
        card.classList.remove('docked');
        card.classList.remove('flipped');
        orbit.classList.remove('has-docked');
        backdrop.classList.remove('is-active');
    }
    window.__undockHabitCard = undock;

    Array.from(orbit.children).forEach(card => {
        card.addEventListener('click', (e) => {
            // The quick-complete badge acts straight away, no docking
            // detour required — let its own click handler run instead.
            if (e.target.closest('.quick-complete-btn')) return;
            if (!card.classList.contains('docked')) {
                e.preventDefault();
                e.stopPropagation();
                dock(card);
            }
        }, true); // capture: intercept before the tile's own button handlers
    });

    backdrop.addEventListener('click', () => {
        const docked = orbit.querySelector('.habit-card.docked');
        if (docked) undock(docked);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const docked = orbit.querySelector('.habit-card.docked');
        if (docked) undock(docked);
    });
})();

// ---- Palantír orb: a floating seeing-stone that docks the timer
// to the center of the screen, same pattern as the habit tiles. ----
(function enableFocusPod() {
    const podBtn = document.getElementById('focus-pod-btn');
    const overlay = document.getElementById('timer-overlay');
    const overlayBackdrop = document.getElementById('timer-overlay-backdrop');
    const closeBtn = document.getElementById('timer-overlay-close');
    if (!podBtn || !overlay) return;

    function open() {
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
    }
    function close() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
    }
    window.__openTimerOverlay = open;

    podBtn.addEventListener('click', open);
    if (overlayBackdrop) overlayBackdrop.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });
})();

// ---- Mobile checkpoint swipe: segmented control <-> snap-scroll board ----
// On narrow screens the three kanban columns become a horizontally
// swipeable strip (native scroll-snap, so it stays smooth with zero
// JS-driven animation). The pill row above just mirrors/drives which
// column is currently in view.
(function enableKanbanSwipe() {
    const board = document.getElementById('kanban-board');
    const tabs = document.getElementById('kanban-tabs');
    if (!board || !tabs) return;

    const pills = Array.from(tabs.querySelectorAll('.kanban-tab-btn'));
    const columns = Array.from(board.querySelectorAll('.kanban-column'));

    function setActivePill(status) {
        pills.forEach(p => p.classList.toggle('is-active', p.dataset.status === status));
    }

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            const col = columns.find(c => c.dataset.status === pill.dataset.status);
            if (col) col.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
            setActivePill(pill.dataset.status);
        });
    });

    // Keep the pill row honest when the person swipes by hand instead
    // of tapping a pill.
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                    setActivePill(entry.target.dataset.status);
                }
            });
        }, { root: board, threshold: [0.6] });
        columns.forEach(col => observer.observe(col));
    }

    // Keep counts on the pills in sync with the column headers, since
    // renderTodos() only touches #count-*, not the mobile pill copies.
    const countSync = new MutationObserver(() => {
        ['not-started', 'doing', 'done'].forEach(status => {
            const src = document.getElementById(`count-${status}`);
            const dst = document.getElementById(`tab-count-${status}`);
            if (src && dst) dst.textContent = src.textContent;
        });
    });
    ['count-not-started', 'count-doing', 'count-done'].forEach(id => {
        const el = document.getElementById(id);
        if (el) countSync.observe(el, { childList: true, characterData: true, subtree: true });
    });
})();

// ---- Focus pod badge: mirrors the running stopwatch onto the floating
// pod so a session in progress stays visible without opening the timer
// overlay. ----
(function mirrorTimerBadge() {
    const badge = document.getElementById('focus-pod-badge');
    const podBtn = document.getElementById('focus-pod-btn');
    const display = document.getElementById('timer-display');
    if (!badge || !display) return;

    setInterval(() => {
        const running = typeof isRunning !== 'undefined' && isRunning;
        badge.hidden = !running;
        if (podBtn) podBtn.classList.toggle('is-running', running);
        if (running) badge.textContent = display.textContent;
    }, 1000);
})();

// ---- Orbit placement ----
// The sigils used to be pinned to a circle by a pure-CSS angle
// formula. A circle can't clear a rectangle, though: the ledger is
// ~560x490, so tiles landing near the diagonals sat right on top of
// its corners, and on a phone (a 345px console inside a 375px
// viewport) an orbit is geometrically impossible — the tiles simply
// piled onto the task list.
//
// So placement is measured instead of assumed:
//   wide  — two gently bowed columns hanging in the page margins,
//           positions written to --tx/--ty per tile
//   narrow— no orbit at all; CSS lays the tiles out as a swipeable
//           rail beneath the ledger (see .habit-orbit:not(.is-orbiting))
// Purely visual: nothing here reads or writes habit state.
(function layoutOrbit() {
    const system = document.getElementById('orbit-system');
    const orbit = document.getElementById('habit-grid');
    const consoleEl = document.getElementById('core-console');
    if (!system || !orbit || !consoleEl) return;

    const wideQuery = window.matchMedia('(min-width: 1024px)');
    const BOW = 26;      // how far the middle of each column bulges outward
    const MIN_GAP = 16;
    const MAX_GAP = 64;

    let placements = [];  // { card, x, y, depth } in orbit mode; empty otherwise
    let pointerX = 0, pointerY = 0;
    let frame = 0;

    function cards() {
        return Array.from(orbit.children).filter(el => el.classList.contains('habit-card'));
    }

    function place() {
        const list = cards();
        placements = [];

        if (!wideQuery.matches) {
            orbit.classList.remove('is-orbiting');
            list.forEach(card => {
                card.style.removeProperty('--tx');
                card.style.removeProperty('--ty');
            });
            system.style.removeProperty('--decor-px');
            system.style.removeProperty('--decor-py');
            return;
        }

        orbit.classList.add('is-orbiting');
        if (!list.length) return;

        const consoleBox = consoleEl.getBoundingClientRect();
        const tileW = list[0].offsetWidth || 112;
        const tileH = list[0].offsetHeight || 112;
        const availHalf = system.clientWidth / 2;

        // Push the columns as far into the margin as the page allows,
        // never closer than MIN_GAP to the console's edge.
        const spare = availHalf - (consoleBox.width / 2 + tileW + BOW);
        const gap = Math.max(MIN_GAP, Math.min(MAX_GAP, spare));
        const baseX = consoleBox.width / 2 + tileW / 2 + gap;

        // Same vertical rhythm on both sides, each column centred, so
        // the shorter column doesn't read as stretched.
        // Spread to match a tall console, but never tighter than one
        // tile plus breathing room — an empty ledger is short enough
        // that a pure "divide the height" step would stack them.
        const perSide = Math.ceil(list.length / 2);
        const span = Math.max(0, consoleBox.height - tileH);
        // Never let a column's spread outgrow the room actually on
        // screen — bigger sigils otherwise push the outer tiles of a
        // short column above/below the viewport on a compact window.
        const availV = Math.max(tileH, (system.parentElement ? system.parentElement.clientHeight : window.innerHeight) - 40);
        const heightCap = perSide > 1 ? Math.max(40, (availV - tileH) / (perSide - 1)) : Infinity;
        const step = perSide > 1
            ? Math.min(heightCap, Math.max(tileH + 14, Math.min(tileH + 34, span / (perSide - 1))))
            : 0;

        const leftCount = perSide;
        list.forEach((card, i) => {
            const onLeft = i < leftCount;
            const j = onLeft ? i : i - leftCount;
            const count = onLeft ? leftCount : list.length - leftCount;

            const y = (j - (count - 1) / 2) * step;
            // bulge outward toward the middle of the column
            const t = count > 1 ? j / (count - 1) : 0.5;
            const bow = BOW * Math.sin(Math.PI * t);
            const x = (baseX + bow) * (onLeft ? -1 : 1);

            // nearer tiles drift further under the pointer
            const depth = 0.6 + (j % 3) * 0.28;
            placements.push({ card, x, y, depth });
        });

        applyParallax();
    }

    function applyParallax() {
        placements.forEach(({ card, x, y, depth }) => {
            card.style.setProperty('--tx', `${(x + pointerX * depth).toFixed(1)}px`);
            card.style.setProperty('--ty', `${(y + pointerY * depth).toFixed(1)}px`);
        });
        system.style.setProperty('--decor-px', `${(pointerX * 1.8).toFixed(1)}px`);
        system.style.setProperty('--decor-py', `${(pointerY * 1.8).toFixed(1)}px`);
    }

    // Pointer parallax. The tiles carry a 420ms ease-out transition, so
    // they trail the cursor rather than tracking it — reads as weight.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('pointermove', (e) => {
        if (!placements.length || reduceMotion.matches || e.pointerType !== 'mouse') return;
        pointerX = ((e.clientX / window.innerWidth) - 0.5) * 22;
        pointerY = ((e.clientY / window.innerHeight) - 0.5) * 16;
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = 0; applyParallax(); });
    }, { passive: true });

    // In rail mode, only fade the edge the tiles actually continue past.
    function syncRailFades() {
        if (orbit.classList.contains('is-orbiting')) return;
        const max = orbit.scrollWidth - orbit.clientWidth;
        orbit.classList.toggle('rail-scrolled', orbit.scrollLeft > 4);
        orbit.classList.toggle('rail-at-end', orbit.scrollLeft >= max - 4);
    }

    function relayout() {
        place();
        syncRailFades();
    }

    orbit.addEventListener('scroll', syncRailFades, { passive: true });

    // The console grows and shrinks as tasks come and go, and the
    // columns are measured off it, so follow its size.
    if ('ResizeObserver' in window) {
        new ResizeObserver(relayout).observe(consoleEl);
    }
    window.addEventListener('resize', relayout);
    wideQuery.addEventListener('change', relayout);

    window.__layoutOrbit = relayout;
    relayout();
})();

// ---- Draggable habit tiles (visual reorder only) ----
// Reordering only changes the DOM position of the cards already built
// by buildHabitGrid() above — it never touches HABIT_CONFIG, dailyData,
// or fires any apiPost. The chosen order is remembered locally so it
// stays put next time the page loads.
(function enableHabitDrag() {
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const ORDER_KEY = 'focus_dashboard_habit_order';

    function applySavedOrder() {
        try {
            const order = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
            if (!Array.isArray(order)) return;
            order.forEach(id => {
                const el = document.getElementById(`habit-${id}`);
                if (el) grid.appendChild(el);
            });
        } catch (_) { /* ignore */ }
    }

    function saveOrder() {
        const order = Array.from(grid.children).map(c => c.id.replace('habit-', ''));
        try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (_) {}
    }

    // --i drives each tile's animation stagger; the actual coordinates
    // come from layoutOrbit(), which reads DOM order — so a reorder has
    // to refresh both.
    function reindexOrbit() {
        Array.from(grid.children).forEach((card, i) => card.style.setProperty('--i', i));
        if (window.__layoutOrbit) window.__layoutOrbit();
    }

    function getDragAfterElement(container, x, y) {
        const cards = [...container.querySelectorAll('.habit-card:not(.dragging)')];
        return cards.reduce((closest, card) => {
            const box = card.getBoundingClientRect();
            const dx = x - (box.left + box.width / 2);
            const dy = y - (box.top + box.height / 2);
            const offset = Math.hypot(dx, dy);
            if (offset < closest.offset) return { offset, element: card };
            return closest;
        }, { offset: Number.POSITIVE_INFINITY, element: null }).element;
    }

    applySavedOrder();
    reindexOrbit();

    Array.from(grid.children).forEach(card => {
        card.setAttribute('draggable', 'true');
        card.classList.add('habit-draggable');

        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
            grid.classList.add('reordering');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            grid.classList.remove('reordering');
            reindexOrbit();
            saveOrder();
        });
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingCard = grid.querySelector('.habit-card.dragging');
        if (!draggingCard) return;
        const after = getDragAfterElement(grid, e.clientX, e.clientY);
        if (after == null) grid.appendChild(draggingCard);
        else grid.insertBefore(draggingCard, after);
    });
})();

// ---- Task cards glide between columns (FLIP) ----
// renderTodos() tears the board down and rebuilds it, so a task
// changing status used to blink from one column to the other. Wrap
// the render: note where every card was, let it rebuild, then play
// each surviving card back from its old position. Presentation only —
// the wrapper adds no state and always delegates the real work.
(function animateTaskMoves() {
    const board = document.getElementById('kanban-board');
    if (!board || typeof renderTodos !== 'function') return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const render = renderTodos;

    window.renderTodos = function patchedRenderTodos() {
        if (reduce.matches) return render.apply(this, arguments);

        const before = new Map();
        board.querySelectorAll('.kanban-card').forEach(el => {
            before.set(el.dataset.id, el.getBoundingClientRect());
        });

        const result = render.apply(this, arguments);

        board.querySelectorAll('.kanban-card').forEach(el => {
            const prev = before.get(el.dataset.id);
            if (!prev) return;                     // brand new — let card-in play
            const next = el.getBoundingClientRect();
            const dx = prev.left - next.left;
            const dy = prev.top - next.top;
            el.style.animation = 'none';           // suppress the entrance
            if (!dx && !dy) return;
            el.animate(
                [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                { duration: 460, easing: 'cubic-bezier(.16, 1, .3, 1)' }
            );
        });

        return result;
    };
})();

// ---- Tallies flare when they change ----
// One observer over every counter in the app; when the rendered text
// changes it gets a short scale-up. Reads textContent, never writes.
(function pulseTallies() {
    const SELECTOR = '.kanban-column-count, .kanban-tab-count, .counter-value,'
        + ' .timer-stat-value, .core-console-count';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const seen = new WeakMap();
    const flare = (el) => {
        const value = el.textContent;
        if (seen.get(el) === value) return;
        const first = !seen.has(el);
        seen.set(el, value);
        if (first) return;                          // don't flare the initial paint
        el.classList.remove('value-pop');
        void el.offsetWidth;
        el.classList.add('value-pop');
    };

    const scan = () => document.querySelectorAll(SELECTOR).forEach(flare);

    // The observer sees every DOM change in the app (ripples, mote
    // bursts, each re-render), so coalesce them into one scan a frame.
    let queued = 0;
    const schedule = () => {
        if (queued) return;
        queued = requestAnimationFrame(() => { queued = 0; scan(); });
    };

    new MutationObserver(schedule).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
    });
    scan();
})();

// ---- Press ripples ----
// A single delegated listener; the ripple element removes itself.
(function rippleOnPress() {
    const SELECTOR = '#todo-add-btn, .save-flip-btn, .reset-btn, .trail-nav-arrow,'
        + ' .kanban-tab-btn, .toggle-btn, .counter-btn, .action-trigger-btn, .workout-pill';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest(SELECTOR);
        if (!btn) return;

        const box = btn.getBoundingClientRect();
        const size = Math.max(box.width, box.height) * 2.4;
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - box.left}px`;
        ripple.style.top = `${e.clientY - box.top}px`;

        // these buttons aren't all positioned/clipped by default
        const style = getComputedStyle(btn);
        if (style.position === 'static') btn.style.position = 'relative';
        if (style.overflow === 'visible') btn.style.overflow = 'hidden';

        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    }, { passive: true });
})();
