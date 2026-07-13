const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};

const COMPACT_BREAKPOINT_W = 760;
const COMPACT_BREAKPOINT_H = 560;

const dateInput = document.getElementById('dateInput');
const noteInput = document.getElementById('noteInput');
const autoStartToggle = document.getElementById('autoStartToggle');
const saveStatus = document.getElementById('saveStatus');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const thisWeekBtn = document.getElementById('thisWeekBtn');
const compactView = document.getElementById('compactView');
const compactTitle = document.getElementById('compactTitle');
const compactDate = document.getElementById('compactDate');
const compactList = document.getElementById('compactList');
const compactAddBtn = document.getElementById('compactAddBtn');
const expandBtn = document.getElementById('expandBtn');

let saveTimer = null;
let currentWeek = null;
let viewedMonday = null;
let weekData = emptyWeekData();
let isCompact = false;
let modeSwitching = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDot(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMondayOf(date) {
  const today = startOfDay(date);
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return monday;
}

function getTodayDayKey() {
  const day = new Date().getDay();
  return DAY_KEYS[day === 0 ? 6 : day - 1];
}

function getWeekFor(base = new Date()) {
  const today = startOfDay(new Date());
  const monday = getMondayOf(base);
  const days = {};
  DAY_KEYS.forEach((key, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days[key] = d;
  });

  return {
    weekKey: formatKey(monday),
    rangeLabel: `${formatDot(monday)} ~ ${formatDot(days.sun)}`,
    days,
    todayKey: formatKey(today),
    monday,
  };
}

function emptyWeekData() {
  return {
    note: '',
    tasks: Object.fromEntries(DAY_KEYS.map((key) => [key, []])),
  };
}

function applyWeekDates(week) {
  currentWeek = week;
  viewedMonday = week.monday;
  dateInput.value = week.rangeLabel;

  const thisMondayKey = formatKey(getMondayOf(new Date()));
  thisWeekBtn.disabled = week.weekKey === thisMondayKey;
  thisWeekBtn.classList.toggle('is-current', week.weekKey === thisMondayKey);

  DAY_KEYS.forEach((key) => {
    const el = document.querySelector(`[data-date-for="${key}"]`);
    const d = week.days[key];
    el.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    const col = document.querySelector(`.day-col[data-day="${key}"]`);
    col.classList.toggle('is-today', formatKey(d) === week.todayKey);
  });
}

function createTaskRow(day, task, options = {}) {
  const { largeMinHeight = 22 } = options;
  const row = document.createElement('div');
  row.className = 'task-row' + (task.is_done ? ' is-done' : '');

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = Boolean(task.is_done);

  const text = document.createElement('textarea');
  text.rows = 1;
  text.value = task.content || '';
  text.placeholder = '할 일';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'task-remove';
  remove.setAttribute('aria-label', '삭제');
  remove.textContent = '×';

  const autosize = () => {
    text.style.height = 'auto';
    text.style.height = `${Math.max(largeMinHeight, text.scrollHeight)}px`;
  };

  check.addEventListener('change', () => {
    row.classList.toggle('is-done', check.checked);
    scheduleSave();
  });
  text.addEventListener('input', () => {
    autosize();
    scheduleSave();
  });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isCompact) {
        addCompactTask(true);
      } else {
        addTask(day, true);
      }
    }
  });
  remove.addEventListener('click', () => {
    row.remove();
    scheduleSave();
  });

  row.append(check, text, remove);
  requestAnimationFrame(autosize);
  return row;
}

function renderTasks(data) {
  weekData = {
    note: data?.note || '',
    tasks: {},
  };
  noteInput.value = weekData.note;

  DAY_KEYS.forEach((day) => {
    const list = document.querySelector(`[data-tasks-for="${day}"]`);
    list.innerHTML = '';
    const tasks = Array.isArray(data?.tasks?.[day]) ? data.tasks[day] : [];
    weekData.tasks[day] = tasks;
    if (tasks.length === 0) {
      list.appendChild(createTaskRow(day, { content: '', is_done: false }));
    } else {
      tasks.forEach((task) => list.appendChild(createTaskRow(day, task)));
    }
  });

  if (isCompact) {
    renderCompactTasks();
  }
}

function collectTasksFromList(listEl) {
  return Array.from(listEl.querySelectorAll('.task-row')).map((row, index) => {
    const check = row.querySelector('input[type="checkbox"]');
    const text = row.querySelector('textarea');
    return {
      content: text.value,
      is_done: check.checked,
      sort_order: index,
    };
  });
}

function collectWeekContent() {
  const tasks = {};
  DAY_KEYS.forEach((day) => {
    const list = document.querySelector(`[data-tasks-for="${day}"]`);
    tasks[day] = collectTasksFromList(list);
  });

  if (isCompact) {
    const todayKey = getTodayDayKey();
    tasks[todayKey] = collectTasksFromList(compactList);
    // 주간 화면의 오늘 칸도 맞춰 둠
    const weekList = document.querySelector(`[data-tasks-for="${todayKey}"]`);
    weekList.innerHTML = '';
    tasks[todayKey].forEach((task) => {
      weekList.appendChild(createTaskRow(todayKey, task));
    });
    if (tasks[todayKey].length === 0) {
      weekList.appendChild(createTaskRow(todayKey, { content: '', is_done: false }));
    }
  }

  return { note: noteInput.value, tasks };
}

function addTask(day, focus = false) {
  const list = document.querySelector(`[data-tasks-for="${day}"]`);
  const row = createTaskRow(day, { content: '', is_done: false });
  list.appendChild(row);
  if (focus) {
    row.querySelector('textarea').focus();
  }
  scheduleSave();
}

function renderCompactTasks() {
  const todayKey = getTodayDayKey();
  const todayDate = currentWeek?.days?.[todayKey] || new Date();
  compactTitle.textContent = DAY_NAMES[todayKey];
  compactDate.textContent = formatDot(todayDate);

  const sourceList = document.querySelector(`[data-tasks-for="${todayKey}"]`);
  const tasks = collectTasksFromList(sourceList);

  compactList.innerHTML = '';
  if (tasks.length === 0 || (tasks.length === 1 && !tasks[0].content.trim())) {
    compactList.appendChild(
      createTaskRow(todayKey, { content: '', is_done: false }, { largeMinHeight: 28 })
    );
  } else {
    tasks.forEach((task) => {
      compactList.appendChild(createTaskRow(todayKey, task, { largeMinHeight: 28 }));
    });
  }
}

function addCompactTask(focus = false) {
  const todayKey = getTodayDayKey();
  const row = createTaskRow(todayKey, { content: '', is_done: false }, { largeMinHeight: 28 });
  compactList.appendChild(row);
  if (focus) {
    row.querySelector('textarea').focus();
  }
  scheduleSave();
}

function showStatus(message, sticky = false) {
  saveStatus.textContent = message;
  window.clearTimeout(showStatus._t);
  if (!sticky) {
    showStatus._t = window.setTimeout(() => {
      saveStatus.textContent = '';
    }, 1600);
  }
}

async function flushSave() {
  if (!currentWeek) return { ok: true };
  window.clearTimeout(saveTimer);
  const payload = {
    weekKey: currentWeek.weekKey,
    ...collectWeekContent(),
  };
  weekData = { note: payload.note, tasks: payload.tasks };
  const result = await window.plannerAPI.saveWeek(payload);
  return result;
}

function scheduleSave() {
  if (!currentWeek) return;
  showStatus('저장 중…', true);
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const result = await flushSave();
    if (result.ok) {
      showStatus('클라우드 저장됨');
    } else {
      const reason = result.error || '알 수 없는 오류';
      showStatus(`로컬만 저장됨: ${reason}`, true);
      console.error('save failed', result);
    }
  }, 450);
}

async function showWeek(baseDate) {
  await flushSave();
  const week = getWeekFor(baseDate);
  applyWeekDates(week);
  showStatus('불러오는 중…', true);
  const result = await window.plannerAPI.loadWeek(week.weekKey);
  renderTasks(result.data);
  if (result.ok && result.source === 'supabase') {
    showStatus('동기화됨');
  } else if (result.ok && result.source === 'cache') {
    showStatus('오프라인 캐시', true);
  } else {
    showStatus(`불러오기 실패: ${result.error || '설정 확인'}`, true);
  }
}

function shouldUseCompact() {
  return window.innerWidth < COMPACT_BREAKPOINT_W || window.innerHeight < COMPACT_BREAKPOINT_H;
}

function fitToWindow() {
  const page = document.getElementById('page');
  if (!page || isCompact) return;

  const pad = 16;
  const designW = 1080;
  const designH = 740;
  const scale = Math.min(
    1,
    (window.innerWidth - pad) / designW,
    (window.innerHeight - pad) / designH
  );

  page.style.transform = `scale(${scale})`;
}

async function setCompactMode(nextCompact) {
  if (modeSwitching || nextCompact === isCompact) {
    if (!nextCompact) fitToWindow();
    return;
  }

  modeSwitching = true;
  try {
    await flushSave();

    if (nextCompact) {
      // 오늘 기준으로 이번 주 맞추기
      const thisWeek = getWeekFor(new Date());
      if (!currentWeek || currentWeek.weekKey !== thisWeek.weekKey) {
        applyWeekDates(thisWeek);
        const result = await window.plannerAPI.loadWeek(thisWeek.weekKey);
        renderTasks(result.data || emptyWeekData());
      }
      isCompact = true;
      document.body.classList.add('is-compact');
      compactView.hidden = false;
      renderCompactTasks();
      await window.plannerAPI.setCompactMode(true);
    } else {
      // 콤팩트에서 수정한 오늘 할 일을 주간 뷰에 반영
      const todayKey = getTodayDayKey();
      const tasks = collectTasksFromList(compactList);
      const weekList = document.querySelector(`[data-tasks-for="${todayKey}"]`);
      weekList.innerHTML = '';
      if (tasks.length === 0) {
        weekList.appendChild(createTaskRow(todayKey, { content: '', is_done: false }));
      } else {
        tasks.forEach((task) => weekList.appendChild(createTaskRow(todayKey, task)));
      }

      isCompact = false;
      document.body.classList.remove('is-compact');
      compactView.hidden = true;
      await window.plannerAPI.setCompactMode(false);
      fitToWindow();
      scheduleSave();
    }
  } finally {
    modeSwitching = false;
  }
}

async function syncModeToWindowSize() {
  await setCompactMode(shouldUseCompact());
  if (!isCompact) fitToWindow();
}

function bindUi() {
  noteInput.addEventListener('input', scheduleSave);

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addTask(btn.getAttribute('data-add'), true));
  });

  compactAddBtn.addEventListener('click', () => addCompactTask(true));
  expandBtn.addEventListener('click', async () => {
    // 사용자가 주간 보기를 누르면 창을 조금 키우도록 유도 + 강제 주간 모드
    await setCompactMode(false);
  });

  prevWeekBtn.addEventListener('click', async () => {
    const d = new Date(viewedMonday);
    d.setDate(d.getDate() - 7);
    await showWeek(d);
  });

  nextWeekBtn.addEventListener('click', async () => {
    const d = new Date(viewedMonday);
    d.setDate(d.getDate() + 7);
    await showWeek(d);
  });

  thisWeekBtn.addEventListener('click', async () => {
    await showWeek(new Date());
  });

  autoStartToggle.addEventListener('change', async () => {
    const next = await window.plannerAPI.setAutoStart(autoStartToggle.checked);
    autoStartToggle.checked = Boolean(next.autoStart);
    showStatus(next.autoStart ? '자동 실행이 켜졌습니다' : '자동 실행이 꺼졌습니다');
  });

  window.addEventListener('resize', () => {
    syncModeToWindowSize();
  });
  syncModeToWindowSize();
}

async function init() {
  const week = getWeekFor();
  applyWeekDates(week);
  renderTasks(emptyWeekData());
  bindUi();

  try {
    const [config, settings, loaded] = await Promise.all([
      window.plannerAPI.configStatus(),
      window.plannerAPI.getSettings(),
      window.plannerAPI.loadWeek(week.weekKey),
    ]);

    autoStartToggle.checked = Boolean(settings.autoStart);

    if (!config.configured) {
      showStatus('.env 설정 필요 (URL / KEY / SYNC_CODE)', true);
    }

    renderTasks(loaded?.data || emptyWeekData());

    if (loaded?.ok && loaded.source === 'supabase') {
      showStatus('동기화됨');
    } else if (loaded?.ok && loaded.source === 'cache') {
      showStatus('오프라인 캐시', true);
    } else if (loaded?.error) {
      showStatus(`불러오기 실패: ${loaded.error}`, true);
    }
  } catch (err) {
    showStatus(`초기화 오류: ${err.message || err}`, true);
  }
}

init();
