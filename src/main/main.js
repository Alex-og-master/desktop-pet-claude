const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const settings = require('./settings');
const { PetBrain } = require('./claude');

const ROOT = path.join(__dirname, '..');
const asset = (...p) => path.join(ROOT, 'assets', ...p);

// En Wayland (GNOME, KDE…) las ventanas no pueden ponerse siempre encima ni
// saber dónde está el ratón, así que la mascota se quedaba escondida detrás de
// todo. Con XWayland (modo X11) sí funciona. Esta opción solo se puede elegir
// al arrancar, así que si hace falta nos relanzamos con ella.
if (
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) &&
  !process.argv.some((a) => a.startsWith('--ozone-platform')) &&
  !process.env.CLAWDY_WAYLAND
) {
  // En su propia sesión: si no, al cerrarse este proceso (y desmontarse el
  // AppImage) se llevaba por delante al nuevo.
  require('child_process')
    .spawn(process.env.APPIMAGE || process.execPath, [...process.argv.slice(1), '--ozone-platform=x11'], { detached: true, stdio: 'ignore' })
    .unref();
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// En Linux las ventanas transparentes necesitan esto. Se usa la GPU: sin ella
// la ventana (que ocupa todas las pantallas) se compone por software y la
// mascota iba a tirones. Si en algún equipo el fondo sale negro, se puede
// arrancar con CLAWDY_NO_GPU=1.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  if (process.env.CLAWDY_NO_GPU) app.disableHardwareAcceleration();
}

let petWin = null;
let chatWin = null;
let tray = null;

// En Linux (X11) recortamos la ventana a la forma de lo que se ve, así los
// clics fuera de la mascota llegan a las ventanas de debajo aunque no sepamos
// dónde está el ratón. En Windows y macOS se activa o desactiva el ratón según
// si el puntero está encima de la mascota.
const useShape = process.platform === 'linux';
let hitRects = [];
let drawRects = [];
let lastShape = '';
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
  runCommand: (cmd) => {
    // lo travieso que es se guarda en los ajustes, como si lo cambiaras en el menú
    if (cmd.type === 'set_mischief') applySettings({ mischief: cmd.level });
    return runPetCommand(cmd);
  },
});

// ---------- ventana de la mascota ----------
// La ventana cubre todas las pantallas a la vez (el rectángulo que las
// engloba) y la mascota sabe qué zonas se ven: así pasa de una a otra. En
// macOS una ventana no puede ocupar varias pantallas, así que allí solo usa
// la principal.
function world() {
  const primary = screen.getPrimaryDisplay();
  const displays =
    process.platform === 'darwin' ? [primary] : [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)];
  const rects = displays.map((d) => d.workArea);
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const bounds = {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
  const areas = rects.map((r) => ({ x: r.x - x, y: r.y - y, w: r.width, h: r.height }));
  return { bounds, areas };
}

function createPetWindow() {
  const { bounds } = world();
  petWin = new BrowserWindow({
    ...bounds,
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
  if (useShape) petWin.setShape([]);
  else petWin.setIgnoreMouseEvents(true);
  petWin.loadFile(path.join(ROOT, 'renderer', 'pet', 'index.html'));
  if (process.env.PET_DEBUG) {
    petWin.webContents.on('console-message', (e) => console.log('[pet]', e.message));
  }
  petWin.webContents.on('did-finish-load', () => {
    sendConfig();
    petWin.showInactive();
    // GNOME encoge al abrirlas las ventanas más grandes que un monitor; si se
    // cambia el tamaño después, sí deja que ocupe todas las pantallas.
    setTimeout(fitPetWindow, 300);
  });
  petWin.on('closed', () => {
    petWin = null;
  });
}

function fitPetWindow() {
  if (!petWin) return;
  petWin.setBounds(world().bounds);
  lastShape = '';
  updateShape();
  sendConfig();
}

// Algunas ventanas (pantalla completa, menús, otras apps "siempre encima")
// se ponen por delante; cada pocos segundos volvemos a ponernos arriba.
function keepOnTop() {
  if (!petWin || petWin.isDestroyed() || paused) return;
  petWin.setAlwaysOnTop(true, 'screen-saver');
  if (!petWin.isVisible()) petWin.showInactive();
}

function updateShape() {
  if (!useShape || !petWin || petWin.isDestroyed()) return;
  let rects;
  if (capture) {
    // mientras arrastras algo, toda la ventana recibe el ratón
    const b = petWin.getBounds();
    rects = [{ x: 0, y: 0, width: b.width, height: b.height }];
  } else {
    rects = [...drawRects, ...hitRects].map((r) => ({ x: r.x, y: r.y, width: r.w, height: r.h }));
  }
  const key = JSON.stringify(rects);
  if (key === lastShape) return;
  lastShape = key;
  petWin.setShape(rects);
}

function sendConfig() {
  const s = settings.load();
  sendToPet('pet:config', {
    name: s.name,
    scale: s.scale,
    sleepAfter: s.sleepAfter,
    chatter: s.chatter,
    mischief: s.mischief,
    areas: world().areas,
  });
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
  if (useShape) return;
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
        { type: 'separator' },
        { label: 'Traer una nota', click: () => command({ type: 'action', action: 'bring_note' }) },
        { label: 'Perseguir el ratón', click: () => command({ type: 'action', action: 'chase_cursor' }) },
        { label: 'Correr como loco', click: () => command({ type: 'action', action: 'zoomies' }) },
        { label: 'Irse a dar una vuelta', click: () => command({ type: 'action', action: 'wander' }) },
        { label: 'Jugar con algo', click: () => command({ type: 'action', action: 'play' }) },
        { label: 'Ir a por un juguete', click: () => command({ type: 'action', action: 'fetch_toy' }) },
        { label: 'Escribir código', click: () => command({ type: 'action', action: 'write_code' }) },
        { label: 'Cazar un bicho', click: () => command({ type: 'action', action: 'hunt_bug' }) },
        { label: 'Tomarse un café', click: () => command({ type: 'action', action: 'drink_coffee' }) },
        { label: 'Hablar con el patito', click: () => command({ type: 'action', action: 'talk_to_duck' }) },
        { label: 'Lluvia de tokens', click: () => command({ type: 'action', action: 'token_rain' }) },
        { label: 'Pintar un garabato', click: () => command({ type: 'action', action: 'doodle' }) },
      ],
    },
    {
      label: 'Travesuras',
      submenu: [
        [0, 'Tranquilo'],
        [1, 'Travieso'],
        [2, 'Liante'],
      ].map(([mischief, label]) => ({
        label,
        type: 'radio',
        checked: s.mischief === mischief,
        click: () => applySettings({ mischief }),
      })),
    },
    {
      label: 'Objetos',
      submenu: [
        { label: 'Añadir pelota', click: () => command({ type: 'spawn_object', kind: 'ball' }) },
        { label: 'Añadir caja', click: () => command({ type: 'spawn_object', kind: 'box' }) },
        { label: 'Añadir documento', click: () => command({ type: 'spawn_object', kind: 'document' }) },
        { label: 'Añadir taza de café', click: () => command({ type: 'spawn_object', kind: 'mug' }) },
        { label: 'Añadir patito de goma', click: () => command({ type: 'spawn_object', kind: 'duck' }) },
        { label: 'Añadir avión de papel', click: () => command({ type: 'spawn_object', kind: 'plane' }) },
        { label: 'Añadir galleta', click: () => command({ type: 'spawn_object', kind: 'cookie' }) },
        { type: 'separator' },
        { label: 'Tirar las notas', click: () => command({ type: 'clear_notes' }) },
        { label: 'Borrar garabatos y código', click: () => command({ type: 'clear_doodles' }) },
        { label: 'Recoger todo (también notas y garabatos)', click: () => command({ type: 'clear_objects' }) },
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
      label: 'Comentarios (gratis, sin IA)',
      submenu: [
        [0, 'Callado'],
        [1, 'Pocos'],
        [2, 'Normal'],
        [3, 'Muchos'],
      ].map(([chatter, label]) => ({
        label,
        type: 'radio',
        checked: s.chatter === chatter,
        click: () => applySettings({ chatter }),
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
    {
      label: 'Iniciar con el ordenador',
      type: 'checkbox',
      checked: !!s.openAtLogin,
      enabled: canAutostart(),
      click: (item) => applySettings({ openAtLogin: item.checked }),
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
  if ('openAtLogin' in patch) syncAutostart();
  if (tray) tray.setToolTip(s.name);
  rebuildMenus();
  return settings.publicView();
}

// ---------- IPC ----------
ipcMain.on('pet:regions', (_e, regions) => {
  if (!regions || !Array.isArray(regions.hit) || !Array.isArray(regions.draw)) return;
  hitRects = regions.hit;
  drawRects = regions.draw;
  updateShape();
});
ipcMain.on('pet:capture', (_e, on) => {
  capture = !!on;
  updateShape();
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
    if ([0, 1, 2, 3].includes(patch.chatter)) clean.chatter = patch.chatter;
    if ([0, 1, 2].includes(patch.mischief)) clean.mischief = patch.mischief;
    if (Number.isFinite(patch.sleepAfter)) clean.sleepAfter = Math.max(10, Math.min(3600, Math.round(patch.sleepAfter)));
    if (typeof patch.model === 'string' && /^claude-[a-z0-9.-]+$/.test(patch.model)) clean.model = patch.model;
    if (typeof patch.openAtLogin === 'boolean') clean.openAtLogin = patch.openAtLogin;
    if (typeof patch.apiKey === 'string') clean.apiKey = patch.apiKey.trim();
  }
  return applySettings(clean);
});

// ---------- iniciar fácil ----------
// Cómo volver a abrir la app: en un AppImage hay que lanzar el propio
// .AppImage (no el ejecutable de dentro, que desaparece al cerrarse).
function launchCommand() {
  const q = (p) => `"${p.replace(/(["\\$`])/g, '\\$1')}"`;
  const extra = process.platform === 'linux' ? ' --ozone-platform=x11' : '';
  if (process.env.APPIMAGE) return q(process.env.APPIMAGE) + extra;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return q(process.env.PORTABLE_EXECUTABLE_FILE);
  if (app.isPackaged) return q(process.execPath) + extra;
  return `${q(process.execPath)} ${q(app.getAppPath())}${extra}`;
}

function canAutostart() {
  return process.platform === 'linux' || app.isPackaged;
}

function desktopEntry(extra) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Clawdy',
    'Comment=Una mascota de escritorio con la que puedes hablar',
    `Exec=${launchCommand()}`,
    'Icon=clawdy',
    'Terminal=false',
    'Categories=Game;',
    ...(extra || []),
    '',
  ].join('\n');
}

function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return;
  } catch (_) {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Si se abre desde un AppImage, lo añadimos al menú de aplicaciones para que
// la próxima vez baste con buscar "Clawdy" (el .deb ya lo hace al instalarse).
function installLinuxLauncher() {
  if (process.platform !== 'linux' || !process.env.APPIMAGE) return;
  try {
    const share = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const icon = path.join(share, 'icons', 'hicolor', '256x256', 'apps', 'clawdy.png');
    fs.mkdirSync(path.dirname(icon), { recursive: true });
    fs.copyFileSync(asset('icon.png'), icon);
    writeIfChanged(path.join(share, 'applications', 'clawdy.desktop'), desktopEntry());
  } catch (err) {
    console.error('No se pudo crear el acceso en el menú:', err.message);
  }
}

function syncAutostart() {
  const on = !!settings.load().openAtLogin;
  if (process.platform === 'linux') {
    const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
    const file = path.join(dir, 'clawdy.desktop');
    try {
      if (on) writeIfChanged(file, desktopEntry(['X-GNOME-Autostart-enabled=true']));
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
      console.error('No se pudo cambiar el inicio automático:', err.message);
    }
  } else if (app.isPackaged) {
    // el .exe portable se descomprime en una carpeta temporal cada vez: hay
    // que arrancar el .exe de verdad, no el de dentro
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    app.setLoginItemSettings(exe ? { openAtLogin: on, path: exe } : { openAtLogin: on });
  }
}

// ---------- arranque ----------
// Si ya estaba abierta y la vuelves a abrir, la mascota reaparece.
app.on('second-instance', () => {
  if (paused || !petWin || !petWin.isVisible()) {
    paused = false;
    if (petWin) petWin.showInactive();
    sendToPet('pet:say', '¡Sigo aquí! No me había ido. Bueno, un poco.');
    rebuildMenus();
  } else openChat();
});
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
      setInterval(keepOnTop, 5000);
      installLinuxLauncher();
      syncAutostart();
    },
    process.platform === 'linux' ? 400 : 0
  );
  screen.on('display-metrics-changed', fitPetWindow);
  screen.on('display-added', fitPetWindow);
  screen.on('display-removed', fitPetWindow);
});
