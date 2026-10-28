const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('petAPI', {
  setRegions: (regions) => ipcRenderer.send('pet:regions', regions),
  setCapture: (on) => ipcRenderer.send('pet:capture', on),
  openChat: () => ipcRenderer.send('pet:open-chat'),
  contextMenu: () => ipcRenderer.send('pet:context-menu'),
  reportState: (state) => ipcRenderer.send('pet:state', state),
  commandResult: (id, res) => ipcRenderer.send('pet:command-result', id, res),
  onCommand: on('pet:command'),
  onCursor: on('pet:cursor'),
  onIdle: on('pet:idle'),
  onConfig: on('pet:config'),
  onSay: on('pet:say'),
});
