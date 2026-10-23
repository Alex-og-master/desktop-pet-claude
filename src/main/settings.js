// Ajustes guardados en la carpeta de datos de la app. La API key se cifra con
// el llavero del sistema (safeStorage) cuando está disponible.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  name: 'Clawdy',
  scale: 4,
  sleepAfter: 120,
  model: 'claude-opus-5-5',
  openAtLogin: false,
  apiKey: '',
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

let cache = null;

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (_) {}
  const s = Object.assign({}, DEFAULTS, stored);
  if (stored.apiKeyEnc) {
    try {
      s.apiKey = safeStorage.decryptString(Buffer.from(stored.apiKeyEnc, 'base64'));
    } catch (_) {
      s.apiKey = '';
    }
  }
  delete s.apiKeyEnc;
  cache = s;
  return s;
}

function save(patch) {
  const s = Object.assign(load(), patch);
  const out = Object.assign({}, s);
  delete out.apiKey;
  if (s.apiKey) {
    if (safeStorage.isEncryptionAvailable()) {
      out.apiKeyEnc = safeStorage.encryptString(s.apiKey).toString('base64');
    } else {
      out.apiKey = s.apiKey;
    }
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 2));
  return s;
}

// La API key se puede dar también con la variable de entorno ANTHROPIC_API_KEY.
function apiKey() {
  return load().apiKey || process.env.ANTHROPIC_API_KEY || '';
}

// Lo que se le enseña a la ventana de chat (nunca la clave en sí).
function publicView() {
  const s = load();
  return {
    name: s.name,
    scale: s.scale,
    sleepAfter: s.sleepAfter,
    model: s.model,
    openAtLogin: s.openAtLogin,
    hasKey: !!apiKey(),
    keyFromEnv: !s.apiKey && !!process.env.ANTHROPIC_API_KEY,
  };
}

module.exports = { load, save, apiKey, publicView, DEFAULTS };
