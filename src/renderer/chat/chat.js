(function () {
  const api = window.chatAPI;
  const $ = (id) => document.getElementById(id);
  const log = $('log');
  const input = $('input');
  const sendBtn = $('send');

  // Avatar pixel art reutilizando el sprite de la mascota
  const av = $('avatar').getContext('2d');
  av.imageSmoothingEnabled = false;
  av.drawImage(window.Sprites.drawPet({ eyes: 'happy', blush: true }), 0, 0);

  const ACTION_LABELS = {
    set_mode: 'cambia de modo',
    move_to: 'camina',
    do_action: 'hace algo',
    move_object: 'mueve un objeto',
    spawn_object: 'saca un objeto',
    clear_objects: 'recoge',
  };

  function add(kind, text, extra) {
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    if (extra) {
      const small = document.createElement('span');
      small.className = 'acts';
      small.textContent = extra;
      el.appendChild(small);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  let settings = {};
  async function refreshSettings() {
    settings = await api.getSettings();
    $('pet-name').textContent = settings.name;
    document.title = 'Hablar con ' + settings.name;
    $('status').textContent = settings.hasKey ? 'en línea' : 'sin API key (abre ⚙)';
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text) return;
    add('me', text);
    input.value = '';
    autosize();
    sendBtn.disabled = true;
    $('status').textContent = 'pensando…';
    const typing = add('pet typing', '…');
    let res;
    try {
      res = await api.send(text);
    } catch (err) {
      res = { error: 'ipc', text: 'Algo ha fallado: ' + err.message };
    }
    typing.remove();
    const acts = (res.actions || []).map((a) => ACTION_LABELS[a] || a);
    add(res.error ? 'pet error' : 'pet', res.text, acts.length ? '🐾 ' + [...new Set(acts)].join(', ') : '');
    sendBtn.disabled = false;
    $('status').textContent = settings.hasKey ? 'en línea' : 'sin API key (abre ⚙)';
    if (res.error === 'nokey') openSettings();
    input.focus();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  }

  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  input.addEventListener('input', autosize);
  $('suggestions').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') send(e.target.textContent);
  });
  $('new-chat').addEventListener('click', async () => {
    await api.reset();
    log.innerHTML = '';
    add('pet', `¡Empezamos de cero! ¿Qué hacemos?`);
  });

  // ---------- ajustes ----------
  async function openSettings() {
    await refreshSettings();
    $('api-key').value = '';
    $('api-key').placeholder = settings.hasKey
      ? settings.keyFromEnv
        ? 'Usando ANTHROPIC_API_KEY del entorno'
        : '•••••••• (guardada, escribe para cambiarla)'
      : 'sk-ant-…';
    $('model').value = settings.model;
    $('name').value = settings.name;
    $('sleep-after').value = settings.sleepAfter;
    $('open-at-login').checked = settings.openAtLogin;
    $('settings').hidden = false;
  }
  function closeSettings() {
    $('settings').hidden = true;
    input.focus();
  }
  $('open-settings').addEventListener('click', openSettings);
  $('close-settings').addEventListener('click', closeSettings);
  $('save-settings').addEventListener('click', async () => {
    const patch = {
      model: $('model').value,
      name: $('name').value,
      sleepAfter: Number($('sleep-after').value),
      openAtLogin: $('open-at-login').checked,
    };
    const key = $('api-key').value.trim();
    if (key) patch.apiKey = key;
    await api.setSettings(patch);
    await refreshSettings();
    closeSettings();
  });
  api.onOpenSettings(openSettings);

  refreshSettings().then(() => {
    add('pet', `¡Hola! Soy ${settings.name}. Puedes pedirme que me quede quieto, que te siga, que baile o que mueva cosas. ¿Qué hacemos?`);
    if (new URLSearchParams(location.search).get('settings') || !settings.hasKey) openSettings();
  });
})();
