const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const dateInput = document.getElementById('dateInput');
const noteInput = document.getElementById('noteInput');
const autoStartToggle = document.getElementById('autoStartToggle');
const saveStatus = document.getElementById('saveStatus');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const thisWeekBtn = document.getElementById('thisWeekBtn');
const dayInputs = Object.fromEntries(
  DAY_KEYS.map((key) => [key, document.querySelector(`textarea[data-key="${key}"]`)])
);

let saveTimer = null;
let currentWeek = null;
let viewedMonday = null;
let allWeeks = {};

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

/** 특정 날짜가 속한 주 (월~일) */
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
    days: Object.fromEntries(DAY_KEYS.map((key) => [key, ''])),
    note: '',
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

function applyWeekContent(weekData) {
  const data = weekData || emptyWeekData();
  noteInput.value = data.note || '';
  DAY_KEYS.forEach((key) => {
    dayInputs[key].value = (data.days && data.days[key]) || '';
  });
}

function collectWeekContent() {
  return {
    days: Object.fromEntries(DAY_KEYS.map((key) => [key, dayInputs[key].value])),
    note: noteInput.value,
  };
}

function normalizeStored(raw) {
  if (raw && raw.weeks && typeof raw.weeks === 'object') {
    return raw.weeks;
  }

  if (raw && (raw.days || raw.note || raw.date)) {
    const week = getWeekFor();
    return {
      [week.weekKey]: {
        days: raw.days || emptyWeekData().days,
        note: raw.note || '',
      },
    };
  }

  return {};
}

function showSaved() {
  saveStatus.textContent = '저장됨';
  window.clearTimeout(showSaved._t);
  showSaved._t = window.setTimeout(() => {
    saveStatus.textContent = '';
  }, 1200);
}

async function flushSave() {
  if (!currentWeek) return;
  window.clearTimeout(saveTimer);
  allWeeks[currentWeek.weekKey] = collectWeekContent();
  await window.plannerAPI.save({
    version: 2,
    weeks: allWeeks,
  });
}

function scheduleSave() {
  if (!currentWeek) return;
  saveStatus.textContent = '저장 중…';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await flushSave();
    showSaved();
  }, 350);
}

async function showWeek(baseDate) {
  await flushSave();
  const week = getWeekFor(baseDate);
  applyWeekDates(week);
  applyWeekContent(allWeeks[week.weekKey]);
}

async function init() {
  const week = getWeekFor();
  applyWeekDates(week);

  const [raw, settings] = await Promise.all([
    window.plannerAPI.load(),
    window.plannerAPI.getSettings(),
  ]);

  allWeeks = normalizeStored(raw);
  applyWeekContent(allWeeks[week.weekKey]);

  autoStartToggle.checked = Boolean(settings.autoStart);

  [noteInput, ...Object.values(dayInputs)].forEach((el) => {
    el.addEventListener('input', scheduleSave);
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
    saveStatus.textContent = next.autoStart
      ? '자동 실행이 켜졌습니다'
      : '자동 실행이 꺼졌습니다';
  });
}

init();
