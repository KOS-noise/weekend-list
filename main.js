const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const { loadWeek, saveWeek, getConfig, countContentfulTasks } = require('./supabaseSync');

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DATA_FILE = () => path.join(app.getPath('userData'), 'planner-data.json');

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (_) {
    /* ignore corrupt file */
  }
  return fallback;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getSettings() {
  return readJson(SETTINGS_FILE(), { askedAutoStart: false, autoStart: false });
}

function saveSettings(settings) {
  writeJson(SETTINGS_FILE(), settings);
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    path: process.execPath,
    args: [],
  });
}

function cacheGet(weekKey) {
  const all = readJson(DATA_FILE(), { version: 3, weeks: {} });
  return all.weeks?.[weekKey] || null;
}

function cacheSet(weekKey, weekData) {
  const all = readJson(DATA_FILE(), { version: 3, weeks: {} });
  if (!all.weeks) all.weeks = {};
  all.weeks[weekKey] = weekData;
  all.version = 3;
  writeJson(DATA_FILE(), all);
}

async function askAutoStartOnFirstRun() {
  const settings = getSettings();
  if (settings.askedAutoStart) {
    return;
  }

  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['예', '아니요'],
    defaultId: 0,
    cancelId: 1,
    title: 'Weekly Planner',
    message: '컴퓨터 키면 자동으로 실행하겠습니까?',
    detail: '"예"를 누르면 Windows 시작 시 Weekly Planner가 자동으로 실행됩니다.',
  });

  const autoStart = result.response === 0;
  setAutoStart(autoStart);
  saveSettings({ askedAutoStart: true, autoStart });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 320,
    minHeight: 280,
    title: 'Weekly Planner',
    backgroundColor: '#e8e6e0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

ipcMain.handle('planner:loadWeek', async (_event, weekKey) => {
  const empty = {
    note: '',
    tasks: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  };

  try {
    const remote = await loadWeek(weekKey);
    const cached = cacheGet(weekKey);

    if (remote.ok) {
      const remoteCount = countContentfulTasks(remote.data?.tasks);
      const cachedCount = countContentfulTasks(cached?.tasks);
      // 클라우드가 비어 있는데 로컬에 할 일이 있으면 덮어쓰지 않고, 로컬 → 클라우드 복구 시도
      if (remoteCount === 0 && cachedCount > 0) {
        saveWeek(weekKey, cached).then((result) => {
          if (!result.ok) {
            console.error('[planner:loadWeek] heal cloud from local failed:', result.error);
          }
        });
        return {
          ok: true,
          source: 'cache',
          warning: 'REMOTE_EMPTY_KEPT_LOCAL',
          data: cached,
        };
      }
      cacheSet(weekKey, remote.data);
      return { ok: true, source: 'supabase', data: remote.data };
    }

    if (cached) {
      return {
        ok: true,
        source: 'cache',
        warning: remote.error,
        data: cached,
      };
    }

    return {
      ok: false,
      source: 'none',
      error: remote.error,
      data: empty,
    };
  } catch (err) {
    const cached = cacheGet(weekKey);
    return {
      ok: Boolean(cached),
      source: cached ? 'cache' : 'none',
      error: err.message || 'LOAD_FAILED',
      data: cached || empty,
    };
  }
});

ipcMain.handle('planner:saveWeek', async (_event, payload) => {
  try {
    const weekKey = payload.weekKey;
    const weekData = { note: payload.note || '', tasks: payload.tasks || {} };
    cacheSet(weekKey, weekData);

    const remote = await saveWeek(weekKey, weekData);
    if (!remote.ok) {
      console.error('[planner:saveWeek] cloud failed:', remote.error);
      return { ok: false, error: remote.error || 'UNKNOWN', cached: true };
    }
    return { ok: true };
  } catch (err) {
    console.error('[planner:saveWeek] exception:', err);
    return { ok: false, error: err.message || 'SAVE_FAILED', cached: true };
  }
});

ipcMain.handle('planner:configStatus', () => {
  const { url, key, syncCode } = getConfig();
  return {
    configured: Boolean(url && key && syncCode),
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
    hasSyncCode: Boolean(syncCode),
  };
});

ipcMain.handle('window:setCompactMode', (_event, enabled) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return false;
  win.setAlwaysOnTop(Boolean(enabled), 'floating');
  if (!enabled) {
    const [width, height] = win.getSize();
    if (width < 1100 || height < 780) {
      win.setSize(Math.max(width, 1100), Math.max(height, 780), true);
    }
  }
  return true;
});

ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle('settings:setAutoStart', (_event, enabled) => {
  setAutoStart(Boolean(enabled));
  const settings = getSettings();
  settings.autoStart = Boolean(enabled);
  settings.askedAutoStart = true;
  saveSettings(settings);
  return settings;
});

app.whenReady().then(async () => {
  await askAutoStartOnFirstRun();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
