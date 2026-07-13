const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const dateInput = document.getElementById('dateInput');
const noteInput = document.getElementById('noteInput');
const autoStartToggle = document.getElementById('autoStartToggle');
const saveStatus = document.getElementById('saveStatus');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const thisWeekBtn = document.getElementById('thisWeekBtn');

let saveTimer = null;
let currentWeek = null;
let viewedMonday = null;
let weekData = emptyWeekData();

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

function createTaskRow(day, task) {
  const row = document.createElement('div');
  row.className = 'task-row' + (task.is_done ? ' is-done' : '');

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = Boolean(task.is_done);

  const text = document.createElement('input');
  text.type = 'text';
  text.value = task.content || '';
  text.placeholder = '할 일';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'task-remove';
  remove.setAttribute('aria-label', '삭제');
  remove.textContent = '×';

  check.addEventListener('change', () => {
    row.classList.toggle('is-done', check.checked);
    scheduleSave();
  });
  text.addEventListener('input', scheduleSave);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTask(day, true);
    }
  });
  remove.addEventListener('click', () => {
    row.remove();
    scheduleSave();
  });

  row.append(check, text, remove);
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
}

function collectWeekContent() {
  const tasks = {};
  DAY_KEYS.forEach((day) => {
    const list = document.querySelector(`[data-tasks-for="${day}"]`);
    tasks[day] = Array.from(list.querySelectorAll('.task-row')).map((row, index) => {
      const check = row.querySelector('input[type="checkbox"]');
      const text = row.querySelector('input[type="text"]');
      return {
        content: text.value,
        is_done: check.checked,
        sort_order: index,
      };
    });
  });
  return { note: noteInput.value, tasks };
}

function addTask(day, focus = false) {
  const list = document.querySelector(`[data-tasks-for="${day}"]`);
  const row = createTaskRow(day, { content: '', is_done: false });
  list.appendChild(row);
  if (focus) {
    row.querySelector('input[type="text"]').focus();
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
      showStatus(result.cached ? '로컬만 저장됨' : `저장 실패: ${result.error || ''}`, true);
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

function bindUi() {
  noteInput.addEventListener('input', scheduleSave);

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addTask(btn.getAttribute('data-add'), true));
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
}

async function init() {
  const week = getWeekFor();
  applyWeekDates(week);
  // 클라우드 실패해도 입력칸은 먼저 그림
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
