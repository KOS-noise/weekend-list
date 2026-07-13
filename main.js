const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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
    minWidth: 800,
    minHeight: 600,
    title: 'Weekly Planner',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

ipcMain.handle('planner:load', () => {
  return readJson(DATA_FILE(), {
    date: '',
    days: {
      mon: '',
      tue: '',
      wed: '',
      thu: '',
      fri: '',
      sat: '',
      sun: '',
    },
    note: '',
  });
});

ipcMain.handle('planner:save', (_event, data) => {
  writeJson(DATA_FILE(), data);
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
