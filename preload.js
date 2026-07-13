const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plannerAPI', {
  loadWeek: (weekKey) => ipcRenderer.invoke('planner:loadWeek', weekKey),
  saveWeek: (payload) => ipcRenderer.invoke('planner:saveWeek', payload),
  configStatus: () => ipcRenderer.invoke('planner:configStatus'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:setAutoStart', enabled),
  setCompactMode: (enabled) => ipcRenderer.invoke('window:setCompactMode', enabled),
});
