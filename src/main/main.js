const path = require('path');
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const settings = require('./settings');
const { PetBrain } = require('./claude');

const ROOT = path.join(__dirname, '..');
const asset = (...p) => path.join(ROOT, 'assets', ...p);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// En Linux las ventanas transparentes necesitan esto.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}

let petWin = null;
let chatWin = null;
let tray = null;

let hitRects = [];
let capture = false;
let interactive = false;
let petState = {};
let paused = false;

// ---------- comandos hacia la mascota ----------
let nextCmdId = 1;
const pending = new Map();

function sendToPet(channel, payload) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send(channel, payload);
}

// Envía un comando a la mascota y espera su respuesta (lo usa Claude).
function runPetCommand(cmd) {
  return new Promise((resolve) => {
    if (!petWin || petWin.isDestroyed()) return resolve('La mascota no está visible.');
    const id = nextCmdId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve('Hecho.');
    }, 1500);
    pending.set(id, (res) => {
      clearTimeout(timer);
      if (res && res.state) petState = res.state;
      resolve(res && res.result ? res.result : 'Hecho.');
    });
    sendToPet('pet:command', Object.assign({ id }, cmd));
    rebuildMenus();
  });
}

function command(cmd) {
  sendToPet('pet:command', cmd);
  setTimeout(rebuildMenus, 100);
}

const brain = new PetBrain({
  getSettings: () => settings.load(),
  getApiKey: () => settings.apiKey(),
  runCommand: runPetCommand,
});

// ---------- ventana de la mascota ----------
function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  petWin = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: process.platform !== 'linux' ? false : true,
    alwaysOnTop: true,
    show: false,
    title: settings.load().name,
    webPreferences: {
      preload: path.join(ROOT, 'preload', 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true);
  petWin.loadFile(path.join(ROOT, 'renderer', 'pet', 'index.html'));
  if (process.env.PET_DEBUG) {
    petWin.webContents.on('console-message', (e) => console.log('[pet]', e.message));
  }
  petWin.webContents.on('did-finish-load', () => {
    sendConfig();
    petWin.showInactive();
  });
  petWin.on('closed', () => {
    petWin = null;
  });
}

function fitPetWindow() {
  if (!petWin) return;
  const { workArea } = screen.getPrimaryDisplay();
  petWin.setBounds(workArea);
}

function sendConfig() {
  const s = settings.load();
  sendToPet('pet:config', { name: s.name, scale: s.scale, sleepAfter: s.sleepAfter });
}

// Como la ventana ocupa toda la pantalla, solo atrapa el ratón cuando el
// puntero está encima de la mascota o de un objeto; el resto de clics pasan
// a las ventanas de debajo.
function pollCursor() {
  if (!petWin || petWin.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  const x = p.x - b.x;
  const y = p.y - b.y;
  sendToPet('pet:cursor', { x, y });
  const over = !paused && (capture || hitRects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
  if (over !== interactive) {
    interactive = over;
    petWin.setIgnoreMouseEvents(!over);
  }
}

function pollIdle() {
  sendToPet('pet:idle', powerMonitor.getSystemIdleTime());
}

// ---------- ventana del chat ----------
function openChat(showSettings) {
  const wantSettings = showSettings === true;
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    if (wantSettings) chatWin.webContents.send('chat:open-settings');
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const w = 380;
  const h = 560;
  chatWin = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 320,
    minHeight: 400,
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + workArea.height - h - 140,
    title: `Hablar con ${settings.load().name}`,
    icon: asset('icon.png'),
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: '#F7F4EE',
    webPreferences: {
      preload: path.join(ROOT, 'preload', 'chat-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  chatWin.setMenu(null);
  chatWin.loadFile(path.join(ROOT, 'renderer', 'chat', 'index.html'), wantSettings ? { query: { settings: '1' } } : undefined);
  chatWin.on('closed', () => {
    chatWin = null;
  });
}

// ---------- menús ----------
function buildMenuTemplate() {
  const s = settings.load();
  const mode = petState.mode || 'free';
  return [
    { label: `Hablar con ${s.name}…`, click: () => openChat() },
    { type: 'separator' },
    {
      label: 'Quédate quieto',
      type: 'checkbox',
      checked: mode === 'stay',
      click: (item) => command({ type: 'set_mode', mode: item.checked ? 'stay' : 'free' }),
    },
    {
      label: 'Sígueme',
      type: 'checkbox',
      checked: mode === 'follow',
      click: (item) => command({ type: 'set_mode', mode: item.checked ? 'follow' : 'free' }),
    },
    petState.asleep
      ? { label: 'Despierta', click: () => command({ type: 'action', action: 'wake_up' }) }
      : { label: 'A dormir', click: () => command({ type: 'action', action: 'sleep' }) },
    {
      label: 'Haz algo',
      submenu: [
        { label: 'Saltar', click: () => command({ type: 'action', action: 'jump' }) },
        { label: 'Bailar', click: () => command({ type: 'action', action: 'dance' }) },
        { label: 'Saludar', click: () => command({ type: 'action', action: 'wave' }) },
        { label: 'Caerse', click: () => command({ type: 'action', action: 'trip' }) },
        { label: 'Patear la pelota', click: () => command({ type: 'action', action: 'kick_ball' }) },
      ],
    },
    {
      label: 'Objetos',
      submenu: [
        { label: 'Añadir pelota', click: () => command({ type: 'spawn_object', kind: 'ball' }) },
        { label: 'Añadir caja', click: () => command({ type: 'spawn_object', kind: 'box' }) },
        { label: 'Añadir documento', click: () => command({ type: 'spawn_object', kind: 'document' }) },
        { type: 'separator' },
        { label: 'Recoger todo', click: () => command({ type: 'clear_objects' }) },
      ],
    },
    {
      label: 'Tamaño',
      submenu: [
        [3, 'Pequeño'],
        [4, 'Normal'],
        [6, 'Grande'],
      ].map(([scale, label]) => ({
        label,
        type: 'radio',
        checked: s.scale === scale,
        click: () => applySettings({ scale }),
      })),
    },
    {
      label: 'Ocultar',
      type: 'checkbox',
      checked: paused,
      click: (item) => {
        paused = item.checked;
        if (!petWin) return;
        if (paused) petWin.hide();
        else petWin.showInactive();
      },
    },
    { type: 'separator' },
    { label: 'Ajustes…', click: () => openChat(true) },
    { label: 'Salir', role: 'quit' },
  ];
}

function rebuildMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function createTray() {
  let img = nativeImage.createFromPath(asset('tray.png'));
  if (process.platform === 'darwin') img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip(settings.load().name);
  tray.on('click', () => {
    if (process.platform !== 'darwin') openChat();
  });
  rebuildMenus();
}

function applySettings(patch) {
  const s = settings.save(patch);
  sendConfig();
  if ('openAtLogin' in patch && process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin });
  }
  if (tray) tray.setToolTip(s.name);
  rebuildMenus();
  return settings.publicView();
}

// ---------- IPC ----------
ipcMain.on('pet:hit-rects', (_e, rects) => {
  if (Array.isArray(rects)) hitRects = rects;
});
ipcMain.on('pet:capture', (_e, on) => {
  capture = !!on;
  pollCursor();
});
ipcMain.on('pet:open-chat', () => openChat());
ipcMain.on('pet:context-menu', () => {
  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: petWin });
});
ipcMain.on('pet:state', (_e, state) => {
  const changed = state && (state.mode !== petState.mode || state.asleep !== petState.asleep);
  petState = state || {};
  if (changed) rebuildMenus();
});
ipcMain.on('pet:command-result', (_e, id, res) => {
  const cb = pending.get(id);
  if (cb) {
    pending.delete(id);
    cb(res);
  }
});

ipcMain.handle('chat:send', async (_e, text) => {
  if (typeof text !== 'string' || !text.trim()) return { text: '' };
  const res = await brain.chat(text.trim().slice(0, 4000), petState);
  if (res.text) sendToPet('pet:say', res.text);
  return res;
});
ipcMain.handle('chat:reset', () => {
  brain.reset();
  return true;
});
ipcMain.handle('settings:get', () => settings.publicView());
ipcMain.handle('settings:set', (_e, patch) => {
  const clean = {};
  if (patch && typeof patch === 'object') {
    if (typeof patch.name === 'string' && patch.name.trim()) clean.name = patch.name.trim().slice(0, 24);
    if ([3, 4, 6].includes(patch.scale)) clean.scale = patch.scale;
    if (Number.isFinite(patch.sleepAfter)) clean.sleepAfter = Math.max(10, Math.min(3600, Math.round(patch.sleepAfter)));
    if (typeof patch.model === 'string' && /^claude-[a-z0-9.-]+$/.test(patch.model)) clean.model = patch.model;
    if (typeof patch.openAtLogin === 'boolean') clean.openAtLogin = patch.openAtLogin;
    if (typeof patch.apiKey === 'string') clean.apiKey = patch.apiKey.trim();
  }
  return applySettings(clean);
});

// ---------- arranque ----------
app.on('second-instance', () => openChat());
app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  // En Linux, crear la ventana transparente un pelín después evita que salga negra.
  setTimeout(
    () => {
      createPetWindow();
      createTray();
      setInterval(pollCursor, 33);
      setInterval(pollIdle, 1000);
    },
    process.platform === 'linux' ? 400 : 0
  );
  screen.on('display-metrics-changed', fitPetWindow);
  screen.on('display-added', fitPetWindow);
  screen.on('display-removed', fitPetWindow);
});
