const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatAPI', {
  send: (text) => ipcRenderer.invoke('chat:send', text),
  reset: () => ipcRenderer.invoke('chat:reset'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onOpenSettings: (cb) => ipcRenderer.on('chat:open-settings', () => cb()),
});
