// Motor de la mascota: estados, físicas, objetos, partículas e interacción.
//
// El mundo es "2D y medio": cada cosa tiene una posición en el suelo (x, y),
// que puede ser cualquier punto de la pantalla, y una altura z sobre ese suelo
// para los saltos y los lanzamientos. Se dibuja en (x, y - z) con la sombra
// en (x, y), así que la mascota puede pasear por toda la pantalla.
(function () {
  const { drawPet, TOYS, HEART, DOODLES, GRID } = window.Sprites;
  const Quips = window.Quips;

  // Si no estamos dentro de Electron (por ejemplo, abriendo el HTML en un
  // navegador para probar), usamos un API vacío.
  const api = window.petAPI || {
    setRegions() {},
    setCapture() {},
    openChat() {},
    contextMenu() {},
    reportState() {},
    commandResult() {},
    onCommand() {},
    onCursor() {},
    onIdle() {},
    onConfig() {},
    onSay() {},
  };

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let DPR = 1;
  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // chatter: 0 = callado, 1 = pocos comentarios, 2 = normal, 3 = muchos
  // mischief: 0 = tranquilo, 1 = travieso, 2 = liante
  const cfg = { scale: 4, name: 'Clawdy', sleepAfter: 120, chatter: 2, mischief: 2 };
  const GRAVITY = 2400;
  const S = () => cfg.scale;

  // ---------- utilidades ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function weighted(options) {
    const total = options.reduce((s, o) => s + o[0], 0);
    let r = Math.random() * total;
    for (const [w, fn] of options) {
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return fn;
    }
    return options.filter((o) => o[0] > 0).pop()[1];
  }

  // ---------- mundo ----------
  // seen: cuándo se movió el puntero por última vez. En Wayland solo sabemos
  // dónde está cuando pasa por encima de ventanas X11, así que si lleva rato
  // sin moverse no nos fiamos de él para perseguirlo.
  const cursor = { x: -9999, y: -9999, seen: -1e9 };
  const cursorKnown = () => cursor.x > -1000 && performance.now() - cursor.seen < 6000;
  let userIdle = 0;

  const pet = {
    x: W * 0.7,
    y: H - 2,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: -1,
    state: 'idle',
    st: 0,
    data: { dur: 1 },
    mode: 'free', // free | stay | follow
    forcedSleep: false,
    carrying: null,
    task: null,
    rot: 0,
    sx: 1,
    sy: 1,
    anim: 0,
    blinkT: 3,
    blinking: 0,
  };

  const toys = [];
  let nextToyId = 1;
  const particles = [];
  const marks = []; // garabatos pintados en la pantalla
  const codes = []; // tarjetas con código que escribe en la pantalla
  let tokens = 0; // tokens que ha ido recogiendo
  let bubble = null;

  const petHalfW = () => 9 * S();
  const petHeight = () => 13 * S();
  const petHW = () => petHalfW() + 2;
  const petTop = () => petHeight() + 6;

  // ---------- pantallas ----------
  // La ventana cubre el rectángulo que engloba todas las pantallas; areas son
  // las zonas que de verdad se ven (una por pantalla, la principal primero).
  let areas = [{ x: 0, y: 0, w: W, h: H }];
  const areaAt = (x, y) => areas.find((a) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h);
  function nearestArea(x, y) {
    let best = areas[0];
    let bd = Infinity;
    for (const a of areas) {
      const dx = Math.max(a.x - x, 0, x - (a.x + a.w));
      const dy = Math.max(a.y - y, 0, y - (a.y + a.h));
      if (dx * dx + dy * dy < bd) {
        bd = dx * dx + dy * dy;
        best = a;
      }
    }
    return best;
  }
  const areaOf = (o) => areaAt(o.x, o.y) || nearestArea(o.x, o.y);

  // Mete un punto del suelo dentro de las pantallas, dejando sitio para algo
  // de medio ancho hw y alto top junto a los bordes de fuera (por los bordes
  // que dan a otra pantalla se puede pasar).
  function confine(x, y, hw, top) {
    const a = areaAt(x, y) || nearestArea(x, y);
    x = clamp(x, a.x, a.x + a.w - 1);
    y = clamp(y, a.y, a.y + a.h - 2);
    if (!areaAt(x + hw, y)) x = Math.min(x, a.x + a.w - hw);
    if (!areaAt(x - hw, y)) x = Math.max(x, a.x + hw);
    if (!areaAt(x, y - top)) y = Math.max(y, a.y + top);
    return { x, y };
  }
  const confinePet = (x, y) => confine(x, y, petHW(), petTop());

  const randomSpotIn = (a) => ({ x: rand(a.x + petHW(), a.x + a.w - petHW()), y: rand(a.y + petTop(), a.y + a.h - 2) });
  // Paseos cortos por la pantalla en la que está; de vez en cuando, a otra.
  function randomSpot() {
    const here = areaOf(pet);
    const others = areas.filter((a) => a !== here);
    if (others.length && Math.random() < 0.15) return randomSpotIn(pick(others));
    const r = 550 * (S() / 4);
    return {
      x: clamp(pet.x + rand(-r, r), here.x + petHW(), here.x + here.w - petHW()),
      y: clamp(pet.y + rand(-r, r) * 0.6, here.y + petTop(), here.y + here.h - 2),
    };
  }

  // Por dónde pasar de una pantalla a otra (el centro del borde que comparten).
  function portal(a, b) {
    const near = (u, v) => Math.abs(u - v) < 150;
    if (near(a.x + a.w, b.x) || near(b.x + b.w, a.x)) {
      const y0 = Math.max(a.y, b.y) + petTop();
      const y1 = Math.min(a.y + a.h, b.y + b.h) - 2;
      if (y0 < y1) return { x: near(a.x + a.w, b.x) ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2, y: clamp(pet.y, y0, y1) };
    }
    if (near(a.y + a.h, b.y) || near(b.y + b.h, a.y)) {
      const x0 = Math.max(a.x, b.x) + petHW();
      const x1 = Math.min(a.x + a.w, b.x + b.w) - petHW();
      if (x0 < x1) return { x: clamp(pet.x, x0, x1), y: near(a.y + a.h, b.y) ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2 };
    }
    return null;
  }

  // Puntos para salir de (o entrar a) la pantalla: bordes izquierdo y derecho
  // que no dan a otra pantalla. Con y, a esa altura; sin y, a una al azar.
  function exits(y) {
    const out = [];
    for (const a of areas) {
      const yy = clamp(y == null ? rand(a.y + petTop(), a.y + a.h - 2) : y, a.y + petTop(), a.y + a.h - 2);
      if (!areaAt(a.x - 2, yy)) out.push({ x: a.x - petHalfW() * 3, y: yy, area: a });
      if (!areaAt(a.x + a.w + 1, yy)) out.push({ x: a.x + a.w + petHalfW() * 3, y: yy, area: a });
    }
    return out;
  }

  function setState(name, data) {
    if (!['trip', 'air', 'dragged', 'spin'].includes(name)) pet.rot = 0;
    pet.state = name;
    pet.st = 0;
    pet.data = data || {};
  }

  const BUSY = new Set(['dragged', 'air', 'trip', 'splat', 'land', 'pickup', 'away']);

  // ---------- burbuja de diálogo ----------
  function say(text, seconds) {
    if (!text) {
      bubble = null;
      return;
    }
    ctx.font = '13px system-ui, sans-serif';
    const maxW = 230;
    const lines = wrap(String(text), maxW);
    if (lines.length > 7) {
      lines.length = 7;
      lines[6] += '…';
    }
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const dur = seconds || clamp(2.5 + text.length * 0.06, 3, 14);
    bubble = { lines, width, t: 0, dur };
  }

  // Parte un texto en líneas que quepan en maxW con la fuente actual de ctx.
  function wrap(text, maxW) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---------- partículas ----------
  function emit(type, x, y, opts) {
    particles.push(Object.assign({ type, x, y, vx: 0, vy: -30, life: 1.4, t: 0 }, opts || {}));
  }
  function poof(x, y, n) {
    for (let i = 0; i < (n || 8); i++) emit('dust', x + rand(-10, 10), y + rand(-10, 10), { vx: rand(-90, 90), vy: rand(-90, 30), life: 0.6 });
  }

  // ---------- objetos ----------
  function spawnToy(kind, x, y, extra) {
    const def = TOYS[kind];
    if (!def) return null;
    if (toys.length >= 10) {
      const old = toys.findIndex((t) => !t.held);
      toys.splice(old >= 0 ? old : 0, 1);
    }
    // como mucho 3 notas: la más vieja se va
    const notes = toys.filter((t) => t.kind === 'note' && !t.held);
    if (kind === 'note' && notes.length >= MAX_NOTES) crumple(notes[0]);
    const toy = Object.assign(
      {
        id: nextToyId++,
        kind,
        x,
        y,
        z: 0,
        vx: rand(-40, 40),
        vy: rand(-20, 20),
        vz: 0,
        angle: 0,
        held: null,
      },
      extra || {}
    );
    const c = confine(toy.x, toy.y, (def.w * S()) / 2, def.h * S() + 2);
    toy.x = c.x;
    toy.y = c.y;
    toy.age = 0;
    toy.born = performance.now();
    toys.push(toy);
    return toy;
  }

  const MAX_NOTES = 3;
  const NOTE_LIFE = 300; // segundos hasta que una nota se despega sola

  function crumple(t) {
    removeToy(t);
    poof(t.x, t.y - t.z - toySize(t).h / 2, 12);
  }
  // Aparece cayendo desde lo alto, cerca de un punto del suelo.
  function dropToyFromSky(kind, x, y) {
    const t = spawnToy(kind, x, y);
    if (t) t.z = Math.min(500, t.y - areaOf(t).y + 40);
    return t;
  }
  const toySize = (t) => ({ w: TOYS[t.kind].w * S(), h: TOYS[t.kind].h * S() });

  function removeToy(t) {
    const i = toys.indexOf(t);
    if (i >= 0) toys.splice(i, 1);
    if (pet.carrying === t) pet.carrying = null;
    if (pet.task && pet.task.toy === t) pet.task = null;
  }

  function findToy(kind, near) {
    const free = toys.filter((t) => t.held !== 'user' && (kind === 'any' ? isToy(t) : t.kind === kind));
    if (!free.length) return null;
    const ref = near || pet;
    return free.sort((a, b) => dist(a, ref) - dist(b, ref))[0];
  }

  function dropCarried(vx, vy) {
    const t = pet.carrying;
    if (!t) return;
    t.held = null;
    t.vx = vx || 0;
    t.vy = 0;
    t.vz = vy ? -vy : 150;
    pet.carrying = null;
  }

  function cancelTask() {
    pet.task = null;
    dropCarried(pet.facing * 60, -120);
  }

  // ---------- acciones básicas ----------
  function walkTo(x, y, opts) {
    const o = opts || {};
    const t = o.offscreen ? { x, y } : confinePet(x, y);
    // si el destino está en otra pantalla, pasa por el borde que comparten
    const from = areaOf(pet);
    const to = o.area || areaOf(t);
    const cross = from !== to;
    setState('walk', {
      tx: t.x,
      ty: t.y,
      via: cross ? portal(from, to) : null,
      speed: (o.speed || (o.run ? 170 : 65)) * (S() / 4),
      onArrive: o.onArrive,
      noTrip: o.noTrip || cross,
      free: o.offscreen || cross,
    });
  }

  // Avanza hacia (tx, ty) y devuelve la distancia que falta.
  function stepToward(tx, ty, speed, dt) {
    const dx = tx - pet.x;
    const dy = ty - pet.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return 0;
    if (Math.abs(dx) > 2) pet.facing = dx > 0 ? 1 : -1;
    const step = Math.min(d, speed * dt);
    pet.x += (dx / d) * step;
    pet.y += (dy / d) * step;
    pet.vx = (dx / d) * speed;
    pet.vy = (dy / d) * speed;
    if (speed > 150 * (S() / 4) && Math.random() < dt * 12) emit('dust', pet.x - pet.facing * 6 * S(), pet.y - 2, { vx: -pet.facing * rand(20, 60), vy: rand(-40, -10), life: 0.4 });
    return d - step;
  }

  function idle(dur) {
    if (dur == null) dur = cfg.mischief >= 2 ? rand(0.6, 2.5) : rand(1.2, 4);
    setState('idle', { dur });
  }

  function jump(power) {
    pet.vz = (power || 780) * Math.sqrt(S() / 4);
    if (pet.state === 'walk') {
      pet.vx = Math.sign(pet.vx) * Math.min(Math.abs(pet.vx), pet.data.speed);
      pet.vy = Math.sign(pet.vy) * Math.min(Math.abs(pet.vy), pet.data.speed);
    } else pet.vx = pet.vy = 0;
    setState('air', { soft: true });
  }

  function trip() {
    dropCarried(pet.facing * 220, -260);
    pet.task = null;
    setState('trip');
    if (Math.random() < 0.6) say(Quips.line('trip'), 2.2);
  }

  function fallAsleep(forced) {
    cancelTask();
    pet.forcedSleep = !!forced;
    setState('sleep');
  }

  function wakeUp() {
    pet.forcedSleep = false;
    if (pet.state === 'sleep') setState('wake');
  }

  function moveToyTask(toy, dest) {
    cancelTask();
    const to = confinePet(dest.x, dest.y);
    pet.task = { type: 'move', toy, dest: to };
    walkTo(toy.x, toy.y, {
      noTrip: true,
      onArrive: () => {
        if (!pet.task || toy.held) return idle();
        setState('pickup', { toy });
      },
    });
  }

  // Patea la pelota hacia "aim" (un punto) o hacia donde haya más hueco.
  function kickTask(ball, aim) {
    cancelTask();
    const goal = aim || randomSpot();
    let dx = goal.x - ball.x;
    let dy = goal.y - ball.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const side = dx >= 0 ? 1 : -1;
    const standX = ball.x - side * (petHalfW() + toySize(ball).w / 2 - 4);
    pet.task = { type: 'kick', toy: ball };
    walkTo(standX, ball.y, {
      noTrip: true,
      onArrive: () => {
        pet.facing = side;
        setState('kick', { toy: ball, dx, dy });
      },
    });
  }

  function resolvePoint(target) {
    const a = areaOf(pet);
    switch (target) {
      case 'left':
        return { x: a.x + a.w * 0.1, y: pet.y };
      case 'right':
        return { x: a.x + a.w * 0.9, y: pet.y };
      case 'top':
        return { x: pet.x, y: a.y + petTop() + a.h * 0.05 };
      case 'bottom':
        return { x: pet.x, y: a.y + a.h - 2 };
      case 'center':
        return { x: a.x + a.w * 0.5, y: a.y + a.h * 0.55 };
      case 'other_screen': {
        const others = areas.filter((o) => o !== a);
        return randomSpotIn(others.length ? pick(others) : a);
      }
      case 'cursor':
        return cursor.x > -1000 ? { x: cursor.x, y: cursor.y + 4 * S() } : { x: pet.x, y: pet.y };
      case 'random':
        return randomSpot();
      default:
        return { x: pet.x, y: pet.y };
    }
  }

  // ---------- travesuras ----------
  // Se va de la pantalla por el borde más cercano y vuelve al rato, quizá por
  // otro sitio u otra pantalla. take: objeto que se lleva (y no devuelve);
  // bring: lo que trae al volver ('note', 'ball'…) o nada.
  function leaveTask(opts) {
    const o = opts || {};
    cancelTask();
    if (pet.state === 'sleep') pet.forcedSleep = false;
    pet.task = { type: 'leave', bring: o.bring, text: o.text, play: o.play, dur: o.dur || rand(1.2, 2.5) };
    const go = () => {
      const ex = exits(pet.y).sort((a, b) => dist(a, pet) - dist(b, pet));
      const e = ex.length > 1 && ex[1].area === areaOf(pet) && Math.random() < 0.25 ? ex[1] : ex[0];
      if (!e) return idle();
      walkTo(e.x, e.y, {
        run: true,
        noTrip: true,
        offscreen: true,
        area: e.area,
        onArrive: () => setState('away', { dur: pet.task ? pet.task.dur : 2 }),
      });
    };
    if (o.take) {
      pet.task.toy = o.take;
      pet.task.onPicked = go;
      walkTo(o.take.x, o.take.y, {
        noTrip: true,
        onArrive: () => {
          if (!pet.task || o.take.held) return idle();
          setState('pickup', { toy: o.take });
        },
      });
    } else go();
  }

  function fetchNoteTask(text) {
    leaveTask({ bring: 'note', text });
  }

  // Irse a dar una vuelta: tarda más y a veces vuelve con algo (o se lleva
  // una nota vieja).
  function wanderTask() {
    const notes = toys.filter((t) => t.kind === 'note' && !t.held);
    const take = tooManyToys() || (notes.length && Math.random() < 0.5 ? notes[0] : null);
    const missing = missingToys();
    const bring = weighted([
      [5, () => null],
      [take ? 0 : 2, () => 'note'],
      [missing.length ? 4 : 0, () => pick(missing)],
    ])();
    if (take) say(Quips.line('tidy'), 2.5);
    else if (Math.random() < 0.5) say(Quips.line('leaving'), 2.5);
    leaveTask({ dur: rand(8, 40), bring, take });
  }

  // Si hay demasiados juguetes, el más viejo (para llevárselo al salir).
  // Juguetes de verdad. Los bichos y los tokens no lo son: aparecen solos de
  // vez en cuando (ver updateSpawner) y las notas van aparte.
  const PLAY_KINDS = ['ball', 'box', 'document', 'mug', 'duck', 'plane', 'cookie'];
  const MAX_TOYS = 4;
  const isToy = (t) => PLAY_KINDS.includes(t.kind);
  const looseToys = () => toys.filter((t) => !t.held && isToy(t));
  const oldestToy = () => looseToys().sort((a, b) => a.born - b.born)[0] || null;
  // Juguetes que no están ya en la pantalla (para no traer dos iguales).
  const missingToys = () => PLAY_KINDS.filter((k) => !toys.some((t) => t.kind === k));
  function tooManyToys() {
    return looseToys().length > MAX_TOYS ? oldestToy() : null;
  }

  // Sale un momento a por algo para jugar (mejor algo que no haya en la
  // pantalla) y al volver se pone a jugar con ello.
  function fetchToyTask() {
    const bring = pick(missingToys());
    if (Math.random() < 0.6) say(Quips.line('fetch_toy'), 2.5);
    // con 3 o más juguetes, cambia el más viejo por el nuevo
    leaveTask({ dur: rand(2, 5), bring, play: true, take: looseToys().length >= 3 ? oldestToy() : null });
  }

  // Juega con un juguete; cada uno a su manera.
  // El juguete con el que hace más rato que no juega (para no usar siempre la pelota).
  function leastPlayed(list) {
    return list.slice().sort((a, b) => (a.played || 0) - (b.played || 0) || Math.random() - 0.5)[0];
  }

  function playWith(toy) {
    toy.played = performance.now();
    switch (toy.kind) {
      case 'ball':
        return kickTask(toy, cfg.mischief && cursorKnown() && Math.random() < 0.5 ? cursor : null);
      case 'token':
        return collectTokenTask(toy);
      case 'mug':
        return drinkCoffeeTask(toy);
      case 'cookie':
        return goToToy(toy, 'play', (t) => setState('drink', { toy: t, eat: true }));
      case 'plane':
        return goToToy(toy, 'play', tossToy);
      case 'bug':
        return huntTask(toy);
      case 'duck':
        return Math.random() < 0.6 ? talkToDuckTask(toy) : goToToy(toy, 'play', tossToy);
      case 'box':
        return goToToy(toy, 'play', (t) => (Math.random() < 0.6 ? jumpOver(t) : tossToy(t)));
      case 'document':
      case 'note':
        return goToToy(toy, 'play', (t) => {
          setState('read', { toy: t, dur: 3.2 });
          say(t.kind === 'note' ? Quips.line('read_note', { text: t.text || '…' }) : Quips.line('read_doc'), 3.5);
        });
      default:
        return goToToy(toy, 'play', tossToy);
    }
  }

  // Lo coge, lo levanta y lo lanza por los aires.
  function tossToy(t) {
    t.held = 'pet';
    pet.carrying = t;
    setState('toss', { toy: t });
  }

  function jumpOver(t) {
    const across = petHalfW() * 2 + toySize(t).w + 10;
    pet.vz = 700 * Math.sqrt(S() / 4);
    const air = (2 * pet.vz) / GRAVITY;
    pet.vx = (pet.facing * across) / air;
    pet.vy = 0;
    setState('air', { soft: true, spin: Math.random() < 0.4 ? pet.facing * 720 : 0 });
    if (Math.random() < 0.6) say(Quips.line('box_jump'), 2.5);
  }

  function comeBack() {
    const task = pet.task || {};
    // lo que se había llevado se queda fuera
    if (pet.carrying) removeToy(pet.carrying);
    const e = pick(exits());
    pet.x = e.x;
    pet.y = e.y;
    pet.facing = e.x < e.area.x ? 1 : -1;
    let toy = null;
    if (task.bring) {
      const text = task.bring === 'note' ? task.text || Quips.line('note_texts') : undefined;
      toy = spawnToy(task.bring, e.x, e.y, { held: 'pet', text });
      pet.carrying = toy;
    }
    const a = e.area;
    const dest = toy ? { x: a.x + a.w * rand(0.2, 0.8), y: a.y + a.h * rand(0.35, 0.9) } : randomSpotIn(a);
    pet.task = toy ? { type: 'return', toy } : null;
    walkTo(dest.x, dest.y, {
      run: true,
      noTrip: true,
      offscreen: true,
      onArrive: () => {
        pet.task = null;
        if (pet.carrying) {
          const brought = pet.carrying;
          dropCarried(pet.facing * 30, -100);
          setState('proud');
          if (task.play) pet.wantPlay = brought;
          if (Math.random() < 0.7) say(Quips.line(brought.kind === 'note' ? 'note_drop' : 'brought'), 4);
        } else {
          if (Math.random() < 0.5) say(Quips.line('back'), 3);
          idle(0.5);
        }
      },
    });
  }

  // ---------- juguetes con vida propia ----------
  const ofKind = (k) => toys.filter((t) => t.kind === k && !t.held);

  // Va al lado de un juguete y, al llegar, hace algo con él.
  function goToToy(toy, type, then) {
    cancelTask();
    pet.task = { type, toy };
    const side = toy.x >= pet.x ? -1 : 1;
    walkTo(toy.x + side * (petHalfW() + toySize(toy).w / 2), toy.y, {
      noTrip: true,
      run: type === 'token',
      onArrive: () => {
        if (!pet.task || pet.task.toy !== toy || !toys.includes(toy) || toy.held) return idle();
        pet.facing = toy.x >= pet.x ? 1 : -1;
        pet.task = null;
        then(toy);
      },
    });
  }

  function drinkCoffeeTask(mug) {
    goToToy(mug, 'coffee', () => setState('drink', { toy: mug }));
  }

  function talkToDuckTask(duck) {
    goToToy(duck, 'duck', () => {
      setState('explain', { toy: duck, dur: 4.2 });
      say(Quips.line('duck'), 3.5);
    });
  }

  function collectTokenTask(tok) {
    goToToy(tok, 'token', () => {
      removeToy(tok);
      tokens++;
      for (let i = 0; i < 4; i++) emit('star', tok.x + rand(-12, 12), tok.y - rand(5, 30), { vx: rand(-40, 40), vy: rand(-80, -30), life: 0.6 });
      say(Quips.line('token', { n: tokens }), 2.5);
      setState('proud');
    });
  }

  function quack(t) {
    t.vz = 260;
    emit('text', t.x, t.y - t.z - toySize(t).h - 6, { text: Quips.line('quack'), vy: -30, life: 1.4 });
  }

  function squash(bug, byUser) {
    removeToy(bug);
    for (let i = 0; i < 8; i++) emit('goo', bug.x + rand(-6, 6), bug.y - rand(0, 8), { vx: rand(-90, 90), vy: rand(-90, 10), life: 0.6 });
    emit('text', bug.x, bug.y - 20, { text: '¡chof!', vy: -30, life: 1 });
    if (byUser) {
      if (canTalk()) say('¡Eh! Ese bug era mío.', 2.5);
    } else say(Quips.line('bug_fixed'), 3);
  }

  function huntTask(bug) {
    cancelTask();
    pet.task = { type: 'hunt', toy: bug };
    // tiempo para llegar hasta el bicho y unos segundos de persecución
    setState('hunt', { toy: bug, until: dist(bug, pet) / (200 * (S() / 4)) + rand(5, 8) });
    if (Math.random() < 0.6) say(Quips.line('bug_spotted'), 2);
  }

  // Un bicho entra por un borde de la pantalla... y va a por él.
  function spawnBugTask() {
    const here = exits().filter((e) => e.area === areaOf(pet));
    const e = pick(here.length ? here : exits());
    const bug = spawnToy('bug', e.x, e.y);
    if (bug) huntTask(bug);
    else idle();
  }

  function tokenRain() {
    for (let i = 0; i < 4; i++) dropToyFromSky('token', pet.x + rand(-220, 220), pet.y + rand(-80, 80));
    if (canTalk()) say('¡Lluvia de tokens! ¡Son todos míos!', 3);
    idle(0.6);
  }

  // ---------- escribir en la pantalla ----------
  const CODE_FONT = '12px "Ubuntu Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';
  const CODE_LH = 16;
  function codeTask(text) {
    cancelTask();
    const src = String(text || Quips.line('code'));
    const lines = src.split('\n').slice(0, 10);
    ctx.font = CODE_FONT;
    const w = Math.min(420, Math.max(160, ...lines.map((l) => ctx.measureText(l).width)) + 24);
    const h = 22 + lines.length * CODE_LH + 10;
    const a = areaOf(pet);
    const s = S();
    // al lado de la mascota, por donde haya sitio
    const right = pet.x + 12 * s + w < a.x + a.w - 6;
    const x = right ? pet.x + 12 * s : pet.x - 12 * s - w;
    const y = clamp(pet.y - h + 4, a.y + 6, a.y + a.h - h - 6);
    if (codes.length >= 2) codes.shift();
    const card = { x: clamp(x, a.x + 6, a.x + a.w - w - 6), y, w, h, lines, chars: 0, total: lines.join('').length, t: 0, life: 30, done: false };
    codes.push(card);
    pet.facing = right ? 1 : -1;
    setState('type', { card });
    if (!text && Math.random() < 0.4) say(Quips.line('typing'), 2.5);
  }

  function chaseTask() {
    cancelTask();
    pet.task = { type: 'chase' };
    setState('chase', { until: rand(4, 7) });
    if (Math.random() < 0.6) say(Quips.line('chase'), 2);
  }

  function zoomiesTask(legs) {
    cancelTask();
    pet.task = { type: 'zoomies', left: legs || 3 + Math.floor(Math.random() * 4) };
    if (Math.random() < 0.6) say(Quips.line('zoomies'), 2.2);
    nextZoom();
  }
  function nextZoom() {
    if (!pet.task || pet.task.type !== 'zoomies') return idle();
    if (pet.task.left-- <= 0) {
      pet.task = null;
      return idle(rand(0.5, 1));
    }
    const p = randomSpot();
    walkTo(p.x, p.y, { speed: 260, noTrip: true, onArrive: nextZoom });
  }

  function doodleTask() {
    cancelTask();
    setState('doodle', { dur: 1.6 });
  }

  // Coge el objeto más cercano al puntero y se lo lleva lejos.
  function stealTask() {
    const toy = findToy('any', cursorKnown() ? cursor : pet);
    if (!toy) return idle();
    const ref = cursorKnown() ? cursor : toy;
    const a = areaOf(ref);
    const others = areas.filter((o) => o !== a);
    const dest =
      others.length && Math.random() < 0.4
        ? randomSpotIn(pick(others))
        : { x: ref.x < a.x + a.w / 2 ? rand(a.x + a.w * 0.7, a.x + a.w) : rand(a.x, a.x + a.w * 0.3), y: rand(a.y + petTop(), a.y + a.h - 2) };
    moveToyTask(toy, dest);
    if (Math.random() < 0.6) say(Quips.line('steal'), 2.5);
  }

  // ---------- cerebro ----------
  function think() {
    if (pet.mode === 'stay') return idle(rand(2, 5));
    if (pet.mode === 'follow') {
      if (cursor.x > -1000) {
        const tx = cursor.x;
        const ty = cursor.y + 4 * S();
        const d = Math.hypot(tx - pet.x, ty - pet.y);
        if (d > 60) {
          const k = (d - 40) / d;
          return walkTo(pet.x + (tx - pet.x) * k, pet.y + (ty - pet.y) * k, { run: d > 300 });
        }
        pet.facing = tx >= pet.x ? 1 : -1;
      }
      return idle(0.4);
    }

    const m = cfg.mischief;
    // si acaba de traer algo para jugar, juega con ello
    // al poco de llegar, sale a por algo con lo que jugar
    if (!pet.fetchedOnce && performance.now() - bornAt > 12000) {
      pet.fetchedOnce = true;
      return fetchToyTask();
    }
    if (pet.wantPlay) {
      const t = pet.wantPlay;
      pet.wantPlay = null;
      if (toys.includes(t) && !t.held) return playWith(t);
    }
    // lo que más le interesa: cazar bichos y recoger tokens
    const bugs = ofKind('bug');
    const toks = ofKind('token');
    if (bugs.length && Math.random() < 0.45) return huntTask(pick(bugs));
    if (toks.length && Math.random() < 0.3) return collectTokenTask(toks.sort((a, b) => dist(a, pet) - dist(b, pet))[0]);
    const anyToy = toys.filter((t) => !t.held && (isToy(t) || t.kind === 'note'));
    const notes = toys.filter((t) => t.kind === 'note').length;
    const near = cursorKnown() && dist(cursor, pet) < 500;
    const action = weighted([
      [32, () => {
        const p = randomSpot();
        walkTo(p.x, p.y, { run: Math.random() < 0.15 });
      }],
      [m >= 2 ? 10 : 20, () => idle(rand(2, 5))],
      [anyToy.length ? 4 : 0, () => moveToyTask(pick(anyToy), randomSpot())],
      [anyToy.length ? 14 : 0, () => playWith(leastPlayed(anyToy))],
      // con pocos juguetes, sale a buscar más
      [looseToys().length < 3 ? 14 + 2 * m : 6 + m, fetchToyTask],
      [5, () => jump()],
      [3, () => setState('dance', { dur: rand(2.5, 4.5) })],
      [3, () => setState('yawn')],
      [near ? 4 : 0, () => setState('wave')],
      [2, () => setState('spin')],
      // travesuras
      [notes < MAX_NOTES ? 5 + 3 * m : 0, () => fetchNoteTask()],
      [1 + 2 * m, wanderTask],
      // juguetes
      [ofKind('bug').length ? 25 : 0, () => huntTask(pick(ofKind('bug')))],
      [ofKind('token').length ? 6 : 0, () => collectTokenTask(ofKind('token').sort((a, b) => dist(a, pet) - dist(b, pet))[0])],
      [5 + 3 * m, () => codeTask()],
      [m && cursorKnown() ? 4 * m : 0, chaseTask],
      [m ? 3 * m : 0, () => zoomiesTask()],
      [m && marks.length < 6 ? 2 * m : 0, doodleTask],
      [m && anyToy.length ? 2 * m : 0, stealTask],
    ]);
    action();
  }

  // ---------- comandos (desde el chat con Claude o el menú) ----------
  function runCommand(cmd) {
    if (pet.state === 'dragged') return 'Ahora mismo el usuario me está sujetando con el ratón.';
    // si estaba fuera de la pantalla, vuelve corriendo
    if (pet.state === 'away' && !['say', 'set_mischief', 'clear_notes', 'clear_doodles'].includes(cmd.type)) comeBack();
    const awake = () => {
      if (pet.state === 'sleep') pet.forcedSleep = false;
    };
    switch (cmd.type) {
      case 'set_mode': {
        pet.mode = cmd.mode;
        if (cmd.mode === 'stay') {
          cancelTask();
          if (!BUSY.has(pet.state) && pet.state !== 'sleep') idle(rand(2, 5));
          return 'Modo quieto activado: no me moveré por mi cuenta.';
        }
        if (cmd.mode === 'follow') {
          cancelTask();
          if (pet.state === 'sleep') wakeUp();
          return 'Modo seguir el ratón activado.';
        }
        return 'Modo libre activado: vuelvo a moverme a mi aire.';
      }
      case 'move_to': {
        awake();
        cancelTask();
        const p = resolvePoint(cmd.target);
        walkTo(p.x, p.y, { run: dist(p, pet) > 400, noTrip: true });
        return `Caminando hacia ${cmd.target}.`;
      }
      case 'action':
        awake();
        return doAction(cmd.action);
      case 'move_object': {
        awake();
        const toy = findToy(cmd.object || 'any');
        if (!toy) {
          const names = toys.map((t) => TOYS[t.kind].label).join(', ') || 'ninguno';
          return `No hay ningún objeto así en el escritorio (hay: ${names}). Puedes crear uno con spawn_object.`;
        }
        moveToyTask(toy, resolvePoint(cmd.destination));
        return `Voy a llevar ${TOYS[toy.kind].label} a ${cmd.destination}.`;
      }
      case 'spawn_object': {
        const t = dropToyFromSky(cmd.kind, pet.x + pet.facing * rand(60, 160), pet.y + rand(-30, 30));
        return t ? `Ha aparecido un objeto: ${TOYS[t.kind].label}.` : 'No conozco ese objeto.';
      }
      case 'clear_objects':
        cancelTask();
        toys.length = 0;
        marks.length = 0;
        codes.length = 0;
        return 'Objetos, notas, garabatos y código recogidos.';
      case 'leave_note':
        awake();
        fetchNoteTask(cmd.text);
        return 'Voy a por una nota adhesiva para escribir eso. Ahora vuelvo.';
      case 'clear_notes':
        toys.filter((t) => t.kind === 'note' && t.held !== 'pet').forEach(crumple);
        return 'Notas a la papelera.';
      case 'clear_doodles':
        marks.forEach((m) => poof(m.x, m.y - 10));
        codes.forEach((c) => poof(c.x + c.w / 2, c.y + c.h / 2, 14));
        marks.length = 0;
        codes.length = 0;
        return 'Garabatos y código borrados.';
      case 'write':
        awake();
        codeTask(cmd.text);
        return 'Escribiendo eso en la pantalla.';
      case 'set_mischief':
        cfg.mischief = cmd.level;
        return ['Modo tranquilo: me portaré bien. Aburrido, pero bien.', 'Modo travieso activado.', 'Modo liante activado. Tú lo has querido.'][cmd.level];
      case 'say':
        say(cmd.text);
        return 'ok';
      default:
        return 'Comando desconocido.';
    }
  }

  function doAction(action) {
    switch (action) {
      case 'jump':
        cancelTask();
        jump();
        return 'Saltando.';
      case 'dance':
        cancelTask();
        setState('dance', { dur: 5 });
        return 'Bailando.';
      case 'wave':
        setState('wave');
        return 'Saludando.';
      case 'trip':
        trip();
        return 'Me he caído a propósito (¡ay!).';
      case 'spin':
        setState('spin');
        return 'Dando una vuelta.';
      case 'yawn':
        setState('yawn');
        return 'Bostezando.';
      case 'sleep':
        fallAsleep(true);
        return 'Durmiendo hasta que me despierten.';
      case 'wake_up':
        if (pet.state !== 'sleep') return 'Ya estaba despierto.';
        wakeUp();
        return 'Despertando.';
      case 'kick_ball': {
        const ball = toys.find((t) => t.kind === 'ball' && !t.held);
        if (!ball) return 'No hay ninguna pelota. Puedes crear una con spawn_object.';
        kickTask(ball);
        return 'Voy a por la pelota para darle una patada.';
      }
      case 'bring_note':
        fetchNoteTask();
        return 'Voy a por una nota adhesiva. Ahora vuelvo.';
      case 'chase_cursor':
        if (!cursorKnown()) return 'Ahora mismo no veo dónde está el ratón (muévelo un poco por encima de mí).';
        chaseTask();
        return 'Persiguiendo el ratón.';
      case 'zoomies':
        zoomiesTask();
        return 'Corriendo como loco por la pantalla.';
      case 'doodle':
        doodleTask();
        return 'Pintando un garabato en la pantalla.';
      case 'wander':
        wanderTask();
        return 'Me voy a dar una vuelta fuera de la pantalla. Ya volveré.';
      case 'write_code':
        codeTask();
        return 'Escribiendo código en la pantalla.';
      case 'hunt_bug': {
        const bug = ofKind('bug')[0];
        if (bug) huntTask(bug);
        else spawnBugTask();
        return 'A cazar bichos.';
      }
      case 'drink_coffee': {
        const mug = ofKind('mug')[0] || dropToyFromSky('mug', pet.x + pet.facing * rand(80, 140), pet.y);
        drinkCoffeeTask(mug);
        return 'Voy a por un café. Agárrate.';
      }
      case 'talk_to_duck': {
        const duck = ofKind('duck')[0] || dropToyFromSky('duck', pet.x + pet.facing * rand(80, 140), pet.y);
        talkToDuckTask(duck);
        return 'Voy a explicarle mis bugs al patito de goma.';
      }
      case 'fetch_toy':
        fetchToyTask();
        return 'Voy a por algo para jugar. Ahora vuelvo.';
      case 'play': {
        const loose = toys.filter((t) => !t.held && t.kind !== 'bug');
        if (loose.length) {
          const t = pick(loose);
          playWith(t);
          return `Jugando con: ${TOYS[t.kind].label}.`;
        }
        fetchToyTask();
        return 'No hay juguetes, así que voy a por uno.';
      }
      case 'token_rain':
        tokenRain();
        return 'Han caído tokens del cielo.';
      case 'tidy_notes':
        runCommand({ type: 'clear_notes' });
        return 'He tirado todas las notas.';
      default:
        return 'No sé hacer eso.';
    }
  }

  function snapshot() {
    const where = (o) => {
      const a = areaOf(o);
      const fx = (o.x - a.x) / a.w;
      const fy = (o.y - a.y) / a.h;
      const h = fx < 0.33 ? 'izquierda' : fx > 0.66 ? 'derecha' : 'centro';
      const v = fy < 0.33 ? 'arriba' : fy > 0.66 ? 'abajo' : 'en medio';
      const screenName = areas.length > 1 ? ` de la pantalla ${areas.indexOf(a) + 1}` : '';
      if (h === 'centro') return (v === 'en medio' ? 'en el centro' : `${v} en el centro`) + screenName;
      return `${v} a la ${h}${screenName}`;
    };
    return {
      name: cfg.name,
      state: pet.state,
      mode: pet.mode,
      mischief: cfg.mischief,
      asleep: pet.state === 'sleep',
      screens: areas.length,
      position: pet.state === 'away' ? 'fuera de la pantalla, dando una vuelta' : where(pet),
      carrying: pet.carrying ? TOYS[pet.carrying.kind].label : null,
      objects: toys.map((t) => `${TOYS[t.kind].label} ${where(t)}${t.held === 'user' ? ' (el usuario la tiene cogida)' : ''}`),
      doodles: marks.length,
      codeCards: codes.length,
      tokensCollected: tokens,
      userIdleSeconds: Math.round(userIdle),
    };
  }

  // ---------- actualización ----------
  function updatePet(dt) {
    pet.st += dt;
    pet.anim += dt;
    const d = pet.data;
    const s = S();

    // parpadeo
    pet.blinkT -= dt;
    if (pet.blinkT <= 0) {
      pet.blinking = 0.12;
      pet.blinkT = rand(2.5, 5.5);
    }
    pet.blinking = Math.max(0, pet.blinking - dt);

    // relajar squash/rotación por defecto
    const relax = (k) => {
      pet.sx += (1 - pet.sx) * Math.min(1, dt * k);
      pet.sy += (1 - pet.sy) * Math.min(1, dt * k);
    };

    // dormirse si el usuario no hace nada
    if (
      userIdle >= cfg.sleepAfter &&
      (pet.state === 'idle' || pet.state === 'walk') &&
      !pet.task &&
      pet.mode !== 'follow'
    ) {
      if (cfg.chatter > 0) say(Quips.line('going_to_sleep'), 3);
      fallAsleep(false);
    }

    switch (pet.state) {
      case 'idle': {
        pet.vx = pet.vy = 0;
        relax(10);
        pet.rot = 0;
        if (cursorKnown() && dist(cursor, pet) < 300 && Math.random() < dt * 0.5) {
          pet.facing = cursor.x > pet.x ? 1 : -1;
        }
        if (pet.st > d.dur) think();
        break;
      }
      case 'walk': {
        relax(10);
        pet.rot = 0;
        if (d.via) {
          if (stepToward(d.via.x, d.via.y, d.speed, dt) < 3) d.via = null;
          break;
        }
        if (stepToward(d.tx, d.ty, d.speed, dt) < 3) {
          pet.x = d.tx;
          pet.y = d.ty;
          if (d.onArrive) d.onArrive();
          else idle();
          break;
        }
        // a veces se tropieza
        if (!d.noTrip && !pet.carrying && Math.random() < dt * 0.04) trip();
        if (pet.mode === 'follow' && pet.st > 0.4) think();
        break;
      }
      case 'hunt': {
        relax(10);
        const bug = d.toy;
        if (!toys.includes(bug) || bug.held) {
          pet.task = null;
          idle(0.5);
          break;
        }
        if (pet.st > d.until) {
          pet.task = null;
          say(Quips.line('bug_escaped'), 3);
          idle(rand(0.8, 1.5));
          break;
        }
        const left = stepToward(bug.x, bug.y, 200 * (s / 4), dt);
        if (left < 14 * s) {
          // ¡salta encima!
          pet.task = null;
          pet.vx = (bug.x + bug.vx * 0.4 - pet.x) * 2.5;
          pet.vy = (bug.y + bug.vy * 0.4 - pet.y) * 2.5;
          pet.vz = 520 * Math.sqrt(s / 4);
          setState('air', { soft: true, stomp: bug, tries: d.tries || 0 });
        }
        break;
      }
      case 'toss': {
        const t = d.toy;
        if (!toys.includes(t) || t.held !== 'pet') {
          pet.carrying = null;
          idle();
          break;
        }
        if (pet.st > 0.5) {
          // ¡allá va!
          t.held = null;
          pet.carrying = null;
          t.vx = pet.facing * rand(250, 480) * (s / 4);
          t.vy = rand(-90, 90);
          t.vz = rand(550, 850);
          if (t.kind === 'plane') {
            // el avión planea lejos
            t.glide = true;
            t.vx = pet.facing * rand(380, 600) * (s / 4);
            t.vz = rand(250, 400);
          }
          if (Math.random() < 0.5) say(Quips.line('toss'), 2.2);
          // a veces va a buscarlo para seguir jugando
          if (Math.random() < 0.4) pet.wantPlay = t;
          setState('wave');
        }
        break;
      }
      case 'read': {
        relax(10);
        if (toys.includes(d.toy)) pet.facing = d.toy.x >= pet.x ? 1 : -1;
        if (pet.st > d.dur) idle();
        break;
      }
      case 'drink': {
        relax(10);
        if (d.eat && Math.random() < dt * 8) emit('crumb', pet.x + pet.facing * 6 * s, pet.y - 8 * s, { vx: rand(-50, 50), vy: rand(-40, 20), life: 0.7 });
        if (pet.st > 1.8) {
          if (toys.includes(d.toy)) removeToy(d.toy);
          if (d.eat) {
            for (let i = 0; i < 3; i++) emit('heart', pet.x + rand(-8, 8) * s, pet.y - 14 * s, { vx: rand(-30, 30), vy: rand(-70, -40), life: 1.3 });
            say(Quips.line('cookie'), 3);
            setState('proud');
          } else {
            say(Quips.line('coffee'), 3);
            zoomiesTask(7 + Math.floor(Math.random() * 4));
          }
        }
        break;
      }
      case 'explain': {
        relax(10);
        if (toys.includes(d.toy)) pet.facing = d.toy.x >= pet.x ? 1 : -1;
        if (pet.st > 3.4 && !d.quacked) {
          d.quacked = true;
          if (toys.includes(d.toy)) quack(d.toy);
        }
        if (pet.st > d.dur) idle();
        break;
      }
      case 'type': {
        relax(10);
        const card = d.card;
        if (!codes.includes(card)) {
          idle();
          break;
        }
        card.chars = Math.min(card.total, card.chars + dt * 24);
        if (card.chars >= card.total) card.done = true;
        if (card.done && pet.st > card.total / 24 + 0.8) setState('proud');
        break;
      }
      case 'chase': {
        relax(10);
        if (!cursorKnown() || pet.st > d.until) {
          pet.task = null;
          if (Math.random() < 0.5) say(Quips.line('chase_giveup'), 2.5);
          idle(rand(0.8, 1.5));
          break;
        }
        const { x: tx, y: ty } = confinePet(cursor.x, cursor.y + 4 * s);
        const left = stepToward(tx, ty, 210 * (s / 4), dt);
        if (left < 12 * s) {
          // ¡salta sobre el puntero!
          pet.task = null;
          pet.vx = (cursor.x - pet.x) * 2;
          pet.vy = 0;
          pet.vz = 620 * Math.sqrt(s / 4);
          setState('air', { soft: true, spin: pet.facing * 360 });
          if (Math.random() < 0.6) say(Quips.line('pounce'), 2);
        }
        break;
      }
      case 'away':
        // fuera de la pantalla, buscando una nota
        if (pet.st > d.dur) comeBack();
        break;
      case 'air': {
        pet.vz -= GRAVITY * dt;
        pet.z += pet.vz * dt;
        pet.x += pet.vx * dt;
        pet.y += pet.vy * dt;
        if (d.spin) pet.rot += d.spin * dt;
        const c = confinePet(pet.x, pet.y);
        if (c.x !== pet.x) pet.vx *= -0.5;
        if (c.y !== pet.y) pet.vy *= -0.5;
        pet.x = c.x;
        pet.y = c.y;
        if (pet.vz > 0) {
          pet.sy = 1.15;
          pet.sx = 0.9;
        } else relax(6);
        if (pet.z <= 0) {
          const impact = -pet.vz;
          pet.z = 0;
          pet.vx = pet.vy = pet.vz = 0;
          pet.rot = 0;
          for (let i = 0; i < 5; i++) emit('dust', pet.x + rand(-8, 8) * s, pet.y - 2, { vx: rand(-60, 60), vy: rand(-60, -20), life: 0.5 });
          if (d.stomp) {
            const b = d.stomp;
            const alive = toys.includes(b) && !b.held;
            if (alive && Math.abs(b.x - pet.x) < 12 * s && Math.abs(b.y - pet.y) < 9 * s) squash(b);
            else if (alive && d.tries < 3) {
              // se ha escapado: otra vez a por él
              pet.task = { type: 'hunt', toy: b };
              setState('hunt', { toy: b, until: rand(3, 5), tries: d.tries + 1 });
              break;
            } else if (alive) say(Quips.line('bug_escaped'), 3);
          }
          if ((impact > 1300 || d.hard) && !d.soft) {
            setState('splat');
            say(Quips.line('splat'), 2.5);
          } else setState('land');
        }
        break;
      }
      case 'land': {
        pet.sy = 0.78 + (pet.st / 0.18) * 0.22;
        pet.sx = 1.18 - (pet.st / 0.18) * 0.18;
        if (pet.st > 0.18) {
          pet.sx = pet.sy = 1;
          idle(rand(0.5, 2));
        }
        break;
      }
      case 'splat': {
        if (pet.st < 0.25) {
          pet.sy = 0.5;
          pet.sx = 1.45;
        } else relax(4);
        if (pet.st > 0.3 && !d.stars) {
          d.stars = true;
          for (let i = 0; i < 3; i++) emit('star', pet.x, pet.y - 10 * s, { orbit: i * 2.1, life: 1.4 });
        }
        if (pet.st > 1.7) idle(rand(0.8, 2));
        break;
      }
      case 'trip': {
        const t = pet.st;
        if (t < 0.35) {
          pet.rot = pet.facing * 180 * (t / 0.35);
          pet.x += pet.facing * 90 * dt * (s / 4);
        } else if (t < 1.9) {
          pet.rot = pet.facing * 180;
          if (!d.stars) {
            d.stars = true;
            for (let i = 0; i < 3; i++) emit('star', pet.x, pet.y - 12 * s, { orbit: i * 2.1, life: 1.5 });
            for (let i = 0; i < 6; i++) emit('dust', pet.x + pet.facing * 8 * s, pet.y - 2, { vx: rand(-50, 50), vy: rand(-50, -10), life: 0.5 });
          }
        } else if (t < 2.3) {
          pet.rot = pet.facing * 180 * (1 - (t - 1.9) / 0.4);
        } else {
          pet.rot = 0;
          idle(rand(0.6, 1.5));
        }
        break;
      }
      case 'dragged':
        pet.rot = clamp(-pet.vx * 0.03, -30, 30);
        break;
      case 'sleep': {
        pet.rot = 0;
        const br = Math.sin(pet.anim * 2.2);
        pet.sy = 0.9 + br * 0.03;
        pet.sx = 1.06 - br * 0.03;
        d.z = (d.z || 0) - dt;
        if (d.z <= 0) {
          d.z = 1.3;
          emit('z', pet.x + pet.facing * 5 * s, pet.y - 11 * s, { vx: pet.facing * 12, vy: -22, life: 2.6 });
        }
        if (!pet.forcedSleep && userIdle < 1 && pet.st > 1) setState('wake');
        break;
      }
      case 'wake': {
        pet.sy = 1 + Math.sin(Math.min(1, pet.st / 1.1) * Math.PI) * 0.12;
        pet.sx = 2 - pet.sy;
        if (pet.st > 1.2) {
          pet.sx = pet.sy = 1;
          idle(rand(1, 2));
        }
        break;
      }
      case 'yawn':
        relax(10);
        if (pet.st > 1.6) idle();
        break;
      case 'wave':
        relax(10);
        if (cursorKnown()) pet.facing = cursor.x > pet.x ? 1 : -1;
        if (pet.st > 2) idle();
        break;
      case 'dance': {
        const beat = Math.floor(pet.st / 0.25);
        pet.sy = beat % 2 ? 0.92 : 1.06;
        pet.sx = 2 - pet.sy;
        if (beat !== d.beat) {
          d.beat = beat;
          if (beat % 2 === 0) pet.facing *= -1;
          if (beat % 3 === 0) emit('note', pet.x + rand(-10, 10) * s, pet.y - 13 * s, { vx: rand(-20, 20), vy: -40, life: 1.4 });
        }
        if (pet.st > d.dur) {
          pet.sx = pet.sy = 1;
          idle();
        }
        break;
      }
      case 'spin':
        pet.rot = (pet.st / 0.8) * 360 * pet.facing;
        if (pet.st > 0.8) {
          pet.rot = 0;
          idle();
        }
        break;
      case 'doodle': {
        relax(10);
        if (Math.random() < dt * 10) emit('dust', pet.x + pet.facing * 10 * s, pet.y - 2, { vx: rand(-30, 30), vy: rand(-30, -5), life: 0.4 });
        if (pet.st > d.dur) {
          const img = pick(DOODLES);
          if (marks.length >= 6) marks.shift();
          const half = (img.width * s * DOODLE_SCALE) / 2;
          const spot = confine(pet.x + pet.facing * (12 * s + half), pet.y, half + 4, img.height * s * DOODLE_SCALE + 4);
          marks.push({ img, x: spot.x, y: spot.y, t: 0, life: rand(60, 120) });
          if (Math.random() < 0.6) say(Quips.line('doodle'), 3);
          setState('proud');
        }
        break;
      }
      case 'pickup': {
        const toy = d.toy;
        if (!pet.task || toy.held === 'user') {
          pet.task = null;
          idle();
          break;
        }
        toy.held = 'pet';
        pet.carrying = toy;
        if (pet.st > 0.3 && pet.task.onPicked) {
          const go = pet.task.onPicked;
          pet.task.onPicked = null;
          go();
        } else if (pet.st > 0.3) {
          const dest = pet.task.dest;
          walkTo(dest.x, dest.y, {
            noTrip: true,
            onArrive: () => {
              dropCarried(pet.facing * 40, -180);
              pet.task = null;
              setState('proud');
            },
          });
        }
        break;
      }
      case 'proud':
        if (pet.st > 1.2) idle();
        break;
      case 'kick': {
        const ball = d.toy;
        if (pet.st > 0.15 && !d.done) {
          d.done = true;
          if (!ball.held && Math.abs(ball.x - pet.x) < petHalfW() + toySize(ball).w + 10 && Math.abs(ball.y - pet.y) < 12 * s) {
            const power = rand(450, 800) * (s / 4);
            ball.vx = d.dx * power;
            ball.vy = d.dy * power;
            ball.vz = rand(200, 500);
            emit('star', ball.x, ball.y - toySize(ball).h, { life: 0.5 });
          }
        }
        if (pet.st > 0.6) {
          pet.task = null;
          idle(rand(1, 2));
        }
        break;
      }
      default:
        idle();
    }

    if (pet.state !== 'air' && pet.state !== 'dragged') pet.z = 0;
    const free = pet.state === 'away' || (pet.state === 'walk' && pet.data.free);
    if (!free && pet.state !== 'dragged') {
      const c = confinePet(pet.x, pet.y);
      pet.x = c.x;
      pet.y = c.y;
    }
  }

  function updateToys(dt) {
    const s = S();
    for (const t of toys) {
      const def = TOYS[t.kind];
      const { w, h } = toySize(t);
      if (t.held === 'pet') {
        t.x = pet.x;
        t.y = pet.y;
        t.z = pet.z + 12.5 * s * pet.sy;
        t.vx = t.vy = t.vz = 0;
        continue;
      }
      if (t.held === 'user') continue;
      // el avión de papel cae despacito mientras planea
      t.vz -= (t.glide && t.z > 0 ? GRAVITY * 0.12 : GRAVITY) * dt;
      t.z += t.vz * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      const c = confine(t.x, t.y, w / 2, h + 2);
      if (c.x !== t.x) t.vx *= -0.6;
      if (c.y !== t.y) t.vy *= -0.6;
      t.x = c.x;
      t.y = c.y;
      t.age += dt;
      if (t.glide && t.z <= 0) t.glide = false;
      if (t.kind === 'bug' && t.z <= 0) moveBug(t, dt);
      const onGround = t.z <= 0;
      if (onGround) {
        t.z = 0;
        t.vz = t.vz < -140 ? -t.vz * def.bounce : 0;
        const k = Math.exp(-def.friction * dt);
        t.vx *= k;
        t.vy *= k;
        if (Math.hypot(t.vx, t.vy) < 3) t.vx = t.vy = 0;
      }
      if (t.kind === 'ball') t.angle += (Math.hypot(t.vx, t.vy) * Math.sign(t.vx || 1) * dt) / (w / 2);
      else if (t.kind === 'note' || onGround) t.angle = 0;
      else t.angle += t.vx * dt * 0.01;

      // la mascota empuja la pelota al pasar andando
      if (t.kind === 'ball' && (pet.state === 'walk' || pet.state === 'chase') && t.z < 2) {
        const sp = Math.hypot(pet.vx, pet.vy) || 1;
        const ux = pet.vx / sp;
        const uy = pet.vy / sp;
        const ahead = (t.x - pet.x) * ux + (t.y - pet.y) * uy;
        if (Math.abs(t.x - pet.x) < petHalfW() * 0.8 + w / 2 && Math.abs(t.y - pet.y) < 5 * s && ahead > 0) {
          const v = Math.max(Math.hypot(t.vx, t.vy), sp * 2.2);
          t.vx = ux * v;
          t.vy = uy * v;
          t.vz = 120;
        }
      }
    }
  }

  // Los bichos cruzan la pantalla de un sitio a otro, haciendo eses, con
  // alguna parada, y huyen de la mascota si se acerca.
  function moveBug(t, dt) {
    const s = S();
    const near = pet.state !== 'sleep' && pet.state !== 'away' && dist(t, pet) < 70 * s;
    if (!t.goal || dist(t, t.goal) < 30) {
      // un sitio lejos de donde está, en su pantalla
      const a = areaOf(t);
      let g = randomSpotIn(a);
      for (let i = 0; i < 5 && dist(g, t) < a.w * 0.4; i++) g = randomSpotIn(a);
      t.goal = g;
    }
    t.turn = (t.turn || rand(1, 3)) - dt;
    if (t.turn <= 0) {
      t.turn = rand(1, 3);
      t.pause = !near && Math.random() < 0.2 ? rand(0.3, 0.9) : 0;
    }
    if (t.pause > 0) t.pause -= dt;
    let heading = Math.atan2(t.goal.y - t.y, t.goal.x - t.x) + Math.sin(t.age * 5) * 0.6;
    if (near) {
      heading = Math.atan2(t.y - pet.y, t.x - pet.x) + rand(-0.4, 0.4);
      t.pause = 0;
      t.goal = null;
    }
    const v = t.pause > 0 ? 0 : (near ? 120 : 75) * (s / 4);
    t.vx = Math.cos(heading) * v;
    t.vy = Math.sin(heading) * v;
  }

  function updateCodes(dt) {
    for (let i = codes.length - 1; i >= 0; i--) {
      const c = codes[i];
      // si le interrumpen, la tarjeta se termina de escribir sola
      if (!c.done && !(pet.state === 'type' && pet.data.card === c)) {
        c.chars = c.total;
        c.done = true;
      }
      if (c.done) c.t += dt;
      if (c.t > c.life) codes.splice(i, 1);
    }
  }

  // Las notas se despegan a los 5 minutos; los tokens y los bichos que nadie
  // recoge también se acaban yendo.
  const LIFE = { note: NOTE_LIFE, token: 90, bug: 120 };
  function expireNotes() {
    toys.filter((t) => LIFE[t.kind] && !t.held && t.age > LIFE[t.kind]).forEach(crumple);
  }

  // Bichos y tokens aparecen solos de vez en cuando.
  const spawner = { bug: rand(90, 180), token: rand(45, 90) };
  function updateSpawner(dt) {
    if (!entered || pet.state === 'sleep' || pet.state === 'away') return;
    spawner.bug -= dt;
    spawner.token -= dt;
    if (spawner.bug <= 0) {
      spawner.bug = rand(180, 360);
      if (!ofKind('bug').length) {
        // entra correteando por un borde de la pantalla
        const e = pick(exits());
        spawnToy('bug', e.x, e.y);
      }
    }
    if (spawner.token <= 0) {
      spawner.token = rand(90, 200);
      if (ofKind('token').length < 2) {
        const p = randomSpotIn(pick(areas));
        const t = spawnToy('token', p.x, p.y);
        t.z = 40;
        for (let i = 0; i < 5; i++) emit('star', t.x + rand(-14, 14), t.y - rand(10, 40), { vx: rand(-40, 40), vy: rand(-60, -20), life: 0.7 });
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      if (p.orbit != null) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'z') p.x += Math.sin(p.t * 3) * 0.5;
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      marks[i].t += dt;
      if (marks[i].t >= marks[i].life) marks.splice(i, 1);
    }
  }

  // ---------- dibujo ----------
  // Todo lo que se dibuja apunta aquí su rectángulo: en Linux la ventana se
  // recorta a estas zonas (lo de fuera deja pasar los clics).
  let drawn = [];
  function mark(x, y, w, h, pad) {
    const p = pad || 2;
    drawn.push({ x: x - p, y: y - p, w: w + p * 2, h: h + p * 2 });
  }

  function pose() {
    const st = pet.state;
    const p = { eyes: 'open', look: 0, step: 0, arms: 'down', legs: 'stand' };
    if (cursorKnown() && Math.hypot(cursor.x - pet.x, cursor.y - pet.y) < 600) {
      const dx = cursor.x - pet.x;
      p.look = (dx > 30 ? 1 : dx < -30 ? -1 : 0) * pet.facing;
    }
    if (st === 'walk' || st === 'chase' || st === 'hunt') {
      const fast = st !== 'walk' || pet.data.speed > 100;
      p.step = Math.floor(pet.anim / (fast ? 0.09 : 0.16)) % 2 ? 1 : 2;
      p.bob = p.step === 1 ? 1 : 0;
      p.look = pet.mode === 'follow' ? p.look : 1;
    }
    if (st === 'chase' || st === 'hunt') {
      p.eyes = 'wide';
      p.arms = 'out';
    }
    if (pet.carrying) p.arms = 'carry';
    if (pet.blinking > 0) p.eyes = 'closed';
    switch (st) {
      case 'air':
        p.legs = 'tuck';
        p.eyes = pet.vz < -300 ? 'wide' : p.eyes;
        p.arms = pet.vz < 0 ? 'up' : 'out';
        break;
      case 'dragged':
        p.legs = 'dangle';
        p.armFrame = Math.floor(pet.anim / 0.12) % 2;
        p.eyes = 'wide';
        p.arms = 'up';
        p.mouth = true;
        break;
      case 'trip':
        p.eyes = pet.st < 0.35 ? 'wide' : 'x';
        p.arms = 'out';
        // patalea boca arriba
        if (pet.st > 0.35 && pet.st < 1.9) p.step = Math.floor(pet.st / 0.1) % 2 ? 1 : 2;
        break;
      case 'splat':
        p.eyes = 'x';
        p.arms = 'out';
        break;
      case 'sleep':
        p.eyes = 'sleep';
        p.legs = 'tuck';
        break;
      case 'wake':
        p.eyes = pet.st < 0.8 ? 'closed' : 'open';
        p.arms = pet.st < 0.9 ? 'up' : 'down';
        p.mouth = pet.st < 0.8;
        break;
      case 'yawn':
        p.eyes = 'closed';
        p.mouth = true;
        break;
      case 'wave':
        p.arms = 'wave';
        p.armFrame = Math.floor(pet.st / 0.2) % 2;
        p.eyes = pet.blinking > 0 ? 'closed' : 'happy';
        p.blush = true;
        break;
      case 'dance':
        p.arms = 'dance';
        p.armFrame = Math.floor(pet.st / 0.25) % 2;
        p.step = p.armFrame ? 1 : 2;
        p.eyes = 'happy';
        break;
      case 'toss':
        p.arms = 'carry';
        p.eyes = 'happy';
        break;
      case 'read':
        p.look = 1;
        p.eyes = Math.floor(pet.st / 0.7) % 3 === 2 ? 'closed' : 'open';
        p.arms = 'out';
        break;
      case 'drink':
        p.arms = 'up';
        p.eyes = pet.data.eat ? 'happy' : pet.st > 1.4 ? 'wide' : 'closed';
        p.mouth = !pet.data.eat || Math.floor(pet.st / 0.15) % 2 === 0;
        break;
      case 'explain':
        p.arms = 'wave';
        p.armFrame = Math.floor(pet.st / 0.3) % 2;
        p.mouth = Math.floor(pet.st / 0.15) % 2 === 0;
        break;
      case 'type':
        p.arms = 'dance';
        p.armFrame = Math.floor(pet.st / 0.08) % 2;
        p.look = 1;
        break;
      case 'doodle':
        p.arms = 'dance';
        p.armFrame = Math.floor(pet.st / 0.1) % 2;
        p.eyes = 'happy';
        p.look = 1;
        break;
      case 'pickup':
        p.arms = 'up';
        break;
      case 'proud':
      case 'land':
        p.eyes = st === 'proud' ? 'happy' : p.eyes;
        p.blush = st === 'proud';
        break;
      case 'kick':
        p.step = pet.st < 0.3 ? 1 : 0;
        p.arms = 'out';
        p.eyes = 'wide';
        break;
      case 'spin':
        p.eyes = 'happy';
        p.arms = 'out';
        break;
    }
    if (pet.data && pet.data.mood === 'happy') p.eyes = 'happy';
    return p;
  }

  function drawShadow(x, y, height, w) {
    const s = S();
    const k = clamp(1 - height / 400, 0.3, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.16 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, w * k, 1.5 * s * k, 0, 0, Math.PI * 2);
    ctx.fill();
    mark(x - w, y - 2 * s, w * 2, 3 * s);
  }

  function drawPetSprite() {
    const s = S();
    const img = drawPet(pose());
    const rad = (pet.rot * Math.PI) / 180;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);
    const lieLift = -s * (8 * Math.abs(sn) + (c < 0 ? 11 * -c : 0));
    drawShadow(pet.x, pet.y, pet.z, 8 * s);
    const ax = Math.round(pet.x);
    const ay = Math.round(pet.y - pet.z + lieLift);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(rad);
    ctx.scale(pet.facing * s * pet.sx, s * pet.sy);
    ctx.drawImage(img, -GRID.OX, -GRID.OY);
    ctx.restore();
    // caja que ocupa el monigote (de x=-10 a 10 y de y=-14 a 1 en la rejilla), girada
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [gx, gy] of [[-10, -14], [10, -14], [-10, 1], [10, 1]]) {
      const lx = gx * s * pet.sx;
      const ly = gy * s * pet.sy;
      const px = ax + lx * c - ly * sn;
      const py = ay + lx * sn + ly * c;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    mark(x0, y0, x1 - x0, y1 - y0, 2 + Math.hypot(pet.vx, pet.vy) / 25);
  }

  function drawToy(t, cx, bottom) {
    const def = TOYS[t.kind];
    const { w, h } = toySize(t);
    const s = S();
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(bottom - h / 2));
    ctx.rotate(Math.round(t.angle / (Math.PI / 2)) * (Math.PI / 2));
    // las notas se despegan poco a poco al final de su vida
    if (LIFE[t.kind] && t.held !== 'pet') ctx.globalAlpha = clamp((LIFE[t.kind] - t.age) / 8, 0, 1);
    if (t.kind === 'plane' && t.vx < 0) ctx.scale(-1, 1);
    if (t.kind === 'bug') {
      // mira hacia donde corre y mueve las patitas
      ctx.scale(t.vx < 0 ? -1 : 1, 1);
      ctx.translate(0, Math.hypot(t.vx, t.vy) > 1 && Math.floor(performance.now() / 90) % 2 ? -s / 2 : 0);
    }
    ctx.drawImage(def.sprite, -w / 2, -h / 2, w, h);
    if (t.kind === 'note') {
      // ✕ en la esquina: un clic en la nota la tira
      const bx = w / 2 - 2.5 * s;
      const by = -h / 2 + 1.5 * s;
      ctx.strokeStyle = '#8A7420';
      ctx.lineWidth = Math.max(1.5, s * 0.5);
      ctx.beginPath();
      ctx.moveTo(bx - s, by - s);
      ctx.lineTo(bx + s, by + s);
      ctx.moveTo(bx + s, by - s);
      ctx.lineTo(bx - s, by + s);
      ctx.stroke();
    }
    if (t.kind === 'note' && t.text) {
      const fs = Math.max(11, Math.round(3.4 * s));
      ctx.font = `bold ${fs}px "Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive, sans-serif`;
      if (!t.lines || t.linesFor !== fs) {
        t.lines = wrap(t.text, w - 4 * s).slice(0, 4);
        t.linesFor = fs;
      }
      ctx.fillStyle = '#4A3B12';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const lh = fs * 1.15;
      const top = 1.5 * s - (t.lines.length - 1) * lh * 0.5;
      t.lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const side = Math.max(w, h);
    mark(cx - side / 2, bottom - h / 2 - side / 2, side, side, 3 + Math.hypot(t.vx, t.vy) / 25);
  }

  // Los garabatos se pintan bien grandes, que se vean.
  const DOODLE_SCALE = 4;
  function drawMarks() {
    const s = S() * DOODLE_SCALE;
    for (const m of marks) {
      const w = m.img.width * s;
      const h = m.img.height * s;
      ctx.globalAlpha = clamp(Math.min(m.t / 0.3, (m.life - m.t) / 8), 0, 0.85);
      ctx.drawImage(m.img, Math.round(m.x - w / 2), Math.round(m.y - h), w, h);
      mark(m.x - w / 2, m.y - h, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function drawCodes() {
    for (const c of codes) {
      ctx.globalAlpha = clamp((c.life - c.t) / 1.5, 0, 1);
      ctx.fillStyle = 'rgba(30,27,25,0.94)';
      ctx.strokeStyle = '#3D3929';
      ctx.lineWidth = 2;
      roundRect(c.x, c.y, c.w, c.h, 8);
      ctx.fill();
      ctx.stroke();
      // tres puntitos de "ventana de terminal"
      ['#D97757', '#E8C35A', '#7FB069'].forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(c.x + 12 + i * 11, c.y + 11, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.font = CODE_FONT;
      ctx.textBaseline = 'top';
      let left = Math.floor(c.chars);
      let cx = c.x + 12;
      let cy = c.y + 22;
      for (const line of c.lines) {
        if (left <= 0) break;
        const shown = line.slice(0, left);
        left -= line.length;
        const t = line.trim();
        ctx.fillStyle = /^[$>›]/.test(t)
          ? '#F0A78B'
          : /^(\/\/|--|#)/.test(t)
            ? '#8C857B'
            : /^[✻●⏺⎿]/.test(t)
              ? '#D97757'
              : '#EDE6DA';
        ctx.fillText(shown, c.x + 12, cy);
        cx = c.x + 12 + ctx.measureText(shown).width;
        if (left > 0) cy += CODE_LH;
      }
      // cursor parpadeando mientras escribe
      if (!c.done && Math.floor(performance.now() / 300) % 2) {
        ctx.fillStyle = '#EDE6DA';
        ctx.fillRect(cx + 1, cy, 7, 13);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
      mark(c.x, c.y, c.w, c.h, 2);
    }
  }

  function drawParticles() {
    const s = S();
    for (const p of particles) {
      const a = clamp(1 - p.t / p.life, 0, 1);
      ctx.globalAlpha = a;
      if (p.type === 'z') {
        const size = Math.round(9 + p.t * 5) + s;
        ctx.font = `bold ${size}px monospace`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText('z', p.x, p.y);
        ctx.fillStyle = '#5B5BD6';
        ctx.fillText('z', p.x, p.y);
        mark(p.x, p.y - size, size, size + 4);
      } else if (p.type === 'heart') {
        ctx.drawImage(HEART, p.x - 3.5 * s * 0.8, p.y, 7 * s * 0.8, 6 * s * 0.8);
        mark(p.x - 3.5 * s * 0.8, p.y, 7 * s * 0.8, 6 * s * 0.8, 4);
      } else if (p.type === 'note') {
        const size = 14 + s;
        ctx.font = `bold ${size}px sans-serif`;
        ctx.fillStyle = '#8A5CF6';
        ctx.fillText('♪', p.x, p.y);
        mark(p.x, p.y - size, size, size + 4);
      } else if (p.type === 'star') {
        let x = p.x;
        let y = p.y;
        if (p.orbit != null) {
          const ang = p.orbit + p.t * 6;
          x = (pet.state === 'trip' || pet.state === 'splat' ? pet.x : p.x) + Math.cos(ang) * 7 * s;
          y = (pet.state === 'trip' ? pet.y - 13 * s : pet.y - 7 * s) + Math.sin(ang) * 1.5 * s;
        }
        ctx.fillStyle = '#F5C542';
        ctx.fillRect(x - s / 2, y - s * 1.5, s, s * 3);
        ctx.fillRect(x - s * 1.5, y - s / 2, s * 3, s);
        mark(x - s * 1.5, y - s * 1.5, s * 3, s * 3, 4);
      } else if (p.type === 'text') {
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = '#2B2620';
        ctx.fillText(p.text, p.x, p.y);
        ctx.textAlign = 'left';
        const tw = ctx.measureText(p.text).width;
        mark(p.x - tw / 2, p.y - 16, tw, 22, 4);
      } else if (p.type === 'crumb') {
        ctx.fillStyle = '#B9874F';
        ctx.fillRect(p.x, p.y, s, s);
        mark(p.x, p.y, s, s, 4);
      } else if (p.type === 'goo') {
        ctx.fillStyle = '#6DB06B';
        ctx.fillRect(p.x, p.y, s, s);
        mark(p.x, p.y, s, s, 4);
      } else if (p.type === 'dust') {
        ctx.fillStyle = 'rgba(160,150,140,0.8)';
        ctx.fillRect(p.x, p.y, s, s);
        mark(p.x, p.y, s, s, 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bubbleRect() {
    if (!bubble || pet.state === 'away') return null;
    const s = S();
    const pad = 9;
    const lh = 17;
    const w = bubble.width + pad * 2;
    const h = bubble.lines.length * lh + pad * 2 - 4;
    const top = pet.y - pet.z - (pet.carrying ? 12.5 * s + toySize(pet.carrying).h : 14 * s);
    const a = areaOf(pet);
    const x = clamp(pet.x - w / 2, a.x + 6, a.x + a.w - w - 6);
    let y = top - h - 12;
    // si no cabe encima de la cabeza, debajo de los pies
    const below = y < a.y + 6;
    if (below) y = Math.min(a.y + a.h - h - 6, pet.y + 14);
    return { x, y, w, h, below, pad, lh };
  }

  function drawBubble() {
    const r = bubbleRect();
    if (!r) return;
    const { x: bx, y: by, w, h, below, pad, lh } = r;
    const a = clamp(Math.min(bubble.t / 0.15, (bubble.dur - bubble.t) / 0.3), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFDF8';
    ctx.strokeStyle = '#3D3929';
    ctx.lineWidth = 2;
    roundRect(bx, by, w, h, 10);
    ctx.fill();
    ctx.stroke();
    // colita, apuntando a la mascota
    const tx = clamp(pet.x, bx + 14, bx + w - 14);
    const edge = below ? by + 1 : by + h - 1;
    const tip = below ? by - 9 : by + h + 9;
    ctx.beginPath();
    ctx.moveTo(tx - 7, edge);
    ctx.lineTo(tx, tip);
    ctx.lineTo(tx + 7, edge);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 6, below ? by : by + h - 3, 12, 3);
    ctx.fillStyle = '#2B2620';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    bubble.lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + i * lh));
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
    mark(bx, below ? by - 10 : by, w, h + 10, 3);
  }

  // Solo se borra lo que se dibujó en el fotograma anterior: la ventana ocupa
  // todas las pantallas y en Linux se compone sin GPU, así que repintarla
  // entera 60 veces por segundo saturaba la CPU y la mascota iba a tirones.
  let prevDrawn = [];
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const r of prevDrawn) ctx.clearRect(Math.floor(r.x) - 2, Math.floor(r.y) - 2, Math.ceil(r.w) + 4, Math.ceil(r.h) + 4);
    drawn = [];
    drawMarks();
    drawCodes();
    // lo que está más abajo en la pantalla se dibuja delante
    const things = toys.filter((t) => t.held !== 'pet');
    if (pet.state !== 'away') things.push(pet);
    things.sort((a, b) => a.y - b.y);
    for (const o of things) {
      if (o === pet) {
        drawPetSprite();
        // el objeto que lleva encima se dibuja delante
        if (pet.carrying) drawToy(pet.carrying, pet.x, pet.y - pet.carrying.z);
      } else {
        drawShadow(o.x, o.y, o.z, toySize(o).w * 0.45);
        drawToy(o, o.x, o.y - o.z);
      }
    }
    drawParticles();
    drawBubble();
    prevDrawn = drawn;
  }

  // ---------- ratón ----------
  function petRect() {
    const s = S();
    const y = pet.y - pet.z;
    if (Math.abs(pet.rot) > 45 && Math.abs(pet.rot) < 135) return { x: pet.x - 13 * s, y: y - 10 * s, w: 26 * s, h: 10 * s };
    return { x: pet.x - petHalfW(), y: y - petHeight() - 1, w: petHalfW() * 2, h: petHeight() + 2 };
  }
  function toyRect(t) {
    const { w, h } = toySize(t);
    return { x: t.x - w / 2 - 3, y: t.y - t.z - h - 3, w: w + 6, h: h + 6 };
  }
  function markRect(m) {
    const w = m.img.width * S() * DOODLE_SCALE;
    const h = m.img.height * S() * DOODLE_SCALE;
    return { x: m.x - w / 2, y: m.y - h, w, h };
  }
  const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const PET_LIFT = () => 8 * S();
  const TOY_LIFT = () => 4 * S();

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const toy = [...toys].sort((a, b) => b.y - a.y).find((t) => t.held !== 'pet' && inside(toyRect(t), x, y));
    let target = null;
    if (toy) target = { kind: 'toy', toy };
    else if (pet.state !== 'away' && inside(petRect(), x, y)) target = { kind: 'pet' };
    else {
      // clic en la burbuja: se cierra; clic en un garabato o en el código: se borra
      if (inside(bubbleRect(), x, y)) bubble = null;
      const code = [...codes].reverse().find((c) => inside(c, x, y));
      if (code) {
        codes.splice(codes.indexOf(code), 1);
        poof(code.x + code.w / 2, code.y + code.h / 2, 14);
        if (Math.random() < 0.4 && canTalk()) say(Quips.line('erase'), 2.5);
        return;
      }
      const m = marks.find((mk) => inside(markRect(mk), x, y));
      if (m) {
        marks.splice(marks.indexOf(m), 1);
        poof(m.x, m.y - 10);
        if (Math.random() < 0.4 && canTalk()) say(Quips.line('erase'), 2.5);
      }
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    api.setCapture(true);
    const ref = target.kind === 'toy' ? target.toy : pet;
    drag = Object.assign(target, {
      offX: ref.x - x,
      offY: ref.y - ref.z - y,
      startX: x,
      startY: y,
      t0: performance.now(),
      moved: false,
      lastX: x,
      lastY: y,
      lastT: performance.now(),
      vx: 0,
      vy: 0,
    });
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = e.clientX;
    const y = e.clientY;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > 5) {
      drag.moved = true;
      if (drag.kind === 'pet') {
        if (pet.state === 'sleep') pet.forcedSleep = false;
        cancelTask();
        setState('dragged');
        say(Quips.line('grabbed'), 2);
      } else {
        if (pet.carrying === drag.toy) pet.carrying = null;
        if (pet.task && pet.task.toy === drag.toy) pet.task = null;
        drag.toy.held = 'user';
      }
    }
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT) / 1000;
    drag.vx = drag.vx * 0.6 + ((x - drag.lastX) / dt) * 0.4;
    drag.vy = drag.vy * 0.6 + ((y - drag.lastY) / dt) * 0.4;
    drag.lastX = x;
    drag.lastY = y;
    drag.lastT = now;
    if (!drag.moved) return;
    const ref = drag.kind === 'toy' ? drag.toy : pet;
    // lo que tienes cogido cuelga un poco por encima de su sitio en el suelo
    const lift = drag.kind === 'toy' ? TOY_LIFT() : PET_LIFT();
    const visY = clamp(y + drag.offY, 0, H - 2);
    ref.x = clamp(x + drag.offX, 0, W);
    ref.y = Math.min(H - 2, visY + lift);
    ref.z = ref.y - visY;
    if (drag.kind === 'pet') pet.vx = drag.vx;
  });

  function endDrag(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    api.setCapture(false);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const vx = clamp(d.vx, -1800, 1800);
    const vy = clamp(d.vy, -1800, 1800);
    if (!d.moved) {
      if (d.kind === 'pet') clickPet();
      else if (d.toy.kind === 'ball') {
        d.toy.vz = 500;
        d.toy.vx = rand(-150, 150);
        d.toy.vy = rand(-60, 60);
      } else if (d.toy.kind === 'note') {
        // un clic en la nota la arruga y la tira
        crumple(d.toy);
        if (Math.random() < 0.5 && canTalk()) say(Quips.line('crumple'), 2.5);
      } else if (d.toy.kind === 'duck') quack(d.toy);
      else if (d.toy.kind === 'bug') squash(d.toy, true);
      else if (d.toy.kind === 'token') {
        d.toy.vz = 450;
        emit('star', d.toy.x, d.toy.y - 20, { life: 0.5 });
      }
      return;
    }
    // al soltar, lo que lanzas sigue moviéndose en esa dirección y sube un poco
    const ref = d.kind === 'toy' ? d.toy : pet;
    ref.vx = vx * 0.8;
    ref.vy = vy * 0.4;
    ref.vz = Math.max(0, -vy * 0.5) + 150;
    if (d.kind === 'pet') {
      setState('air', { spin: Math.abs(vx) > 900 ? Math.sign(vx) * 540 : 0, hard: Math.hypot(vx, vy) > 1300 });
    } else d.toy.held = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('dblclick', (e) => {
    if (inside(petRect(), e.clientX, e.clientY)) api.openChat();
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (inside(petRect(), e.clientX, e.clientY)) api.contextMenu();
  });

  let clicks = 0;
  function clickPet() {
    if (pet.state === 'sleep') {
      wakeUp();
      say(Quips.line('woken'), 3);
      return;
    }
    if (BUSY.has(pet.state)) return;
    clicks++;
    if (clicks > 6 && Math.random() < 0.5) {
      clicks = 0;
      say(Quips.line('tickled_too_much'), 3);
      return trip();
    }
    weighted([
      [3, () => {
        for (let i = 0; i < 3; i++) emit('heart', pet.x + rand(-8, 8) * S(), pet.y - 14 * S(), { vx: rand(-30, 30), vy: rand(-70, -40), life: 1.3 });
        setState('proud');
        say(Quips.line('poke', { name: cfg.name }), 2.5);
      }],
      [2, () => jump(650)],
      [1, () => setState('wave')],
      [1, () => setState('spin')],
    ])();
  }

  // ---------- comunicación con el proceso principal ----------
  api.onCursor((p) => {
    if (p.x !== cursor.x || p.y !== cursor.y) cursor.seen = performance.now();
    cursor.x = p.x;
    cursor.y = p.y;
  });
  api.onIdle((secs) => {
    userIdle = secs;
  });
  api.onConfig((c) => {
    const chatterChanged = c.chatter !== cfg.chatter;
    if (Array.isArray(c.areas) && c.areas.length) setAreas(c.areas);
    Object.assign(cfg, c);
    if (chatterChanged) resetChatterTimer();
    if (!entered) enter();
  });

  // Cambian las pantallas (conectas o quitas un monitor): todo vuelve a sitio visible.
  function setAreas(list) {
    areas = list.map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h }));
    if (pet.state !== 'away' && !(pet.state === 'walk' && pet.data.free)) Object.assign(pet, confinePet(pet.x, pet.y));
    for (const t of toys) Object.assign(t, confine(t.x, t.y, toySize(t).w / 2, toySize(t).h + 2));
    for (let i = marks.length - 1; i >= 0; i--) if (!areaAt(marks[i].x, marks[i].y - 1)) marks.splice(i, 1);
    for (let i = codes.length - 1; i >= 0; i--) if (!areaAt(codes[i].x, codes[i].y)) codes.splice(i, 1);
  }
  api.onSay((text) => say(text));
  api.onCommand((cmd) => {
    let result;
    try {
      result = runCommand(cmd);
    } catch (err) {
      result = 'Error: ' + err.message;
    }
    if (cmd.id) api.commandResult(cmd.id, { result, state: snapshot() });
  });

  const round = (r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.w) + 1, h: Math.ceil(r.h) + 1 });
  let rectTimer = 0;
  let stateTimer = 0;
  function sync(dt) {
    rectTimer -= dt;
    stateTimer -= dt;
    if (rectTimer <= 0) {
      rectTimer = 1 / 30;
      // hit: zonas que reaccionan al ratón; draw: todo lo que se ve
      const hit = [];
      if (pet.state !== 'away') hit.push(petRect());
      toys.filter((t) => t.held !== 'pet').forEach((t) => hit.push(toyRect(t)));
      marks.forEach((m) => hit.push(markRect(m)));
      codes.forEach((c) => hit.push(c));
      const b = bubbleRect();
      if (b) hit.push(b);
      api.setRegions({
        hit: hit.map(round),
        draw: drawn.filter((r) => r.x + r.w > 0 && r.y + r.h > 0 && r.x < W && r.y < H).map(round),
      });
    }
    if (stateTimer <= 0) {
      stateTimer = 1;
      api.reportState(snapshot());
    }
  }

  // ---------- comentarios espontáneos (frases prefijadas, sin IA) ----------
  const CHATTER_GAP = { 1: [12, 20], 2: [5, 10], 3: [2, 4] }; // minutos
  const AWAY = 300; // segundos sin tocar nada para considerar que te has ido
  const chatter = { timer: 0, activeFor: 0, streaks: 0, away: false, dream: 60 };
  function resetChatterTimer() {
    const [a, b] = CHATTER_GAP[cfg.chatter] || CHATTER_GAP[2];
    chatter.timer = rand(a, b) * 60;
  }
  resetChatterTimer();

  const canTalk = () => !bubble && !BUSY.has(pet.state) && pet.state !== 'sleep' && pet.state !== 'wake' && !drag;

  function updateChatter(dt) {
    // seguimiento de tu actividad (con o sin comentarios activados)
    if (userIdle < AWAY) chatter.activeFor += dt;
    else {
      chatter.activeFor = 0;
      chatter.streaks = 0;
      chatter.away = true;
    }
    if (!cfg.chatter) return;

    // vuelves después de un rato fuera
    if (chatter.away && userIdle < 2) {
      chatter.away = false;
      chatter.pendingWelcome = 2.5; // deja que se despierte primero
    }
    if (chatter.pendingWelcome != null) {
      chatter.pendingWelcome -= dt;
      if (chatter.pendingWelcome <= 0 && canTalk()) {
        chatter.pendingWelcome = null;
        say(Quips.line('welcome_back'));
        resetChatterTimer();
      }
      return;
    }

    // llevas mucho rato sin parar (cada hora)
    const hours = Math.floor(chatter.activeFor / 3600);
    if (hours > chatter.streaks && canTalk()) {
      chatter.streaks = hours;
      say(Quips.line('long_streak', { mins: hours * 60 }), 7);
      resetChatterTimer();
      return;
    }

    // habla en sueños de vez en cuando
    if (pet.state === 'sleep') {
      chatter.dream -= dt;
      if (chatter.dream <= 0 && !bubble) {
        chatter.dream = rand(60, 150);
        if (Math.random() < 0.5) say(Quips.line('dream'), 3.5);
      }
      return;
    }

    chatter.timer -= dt;
    if (chatter.timer <= 0 && canTalk()) {
      say(Quips.line(Quips.ambientCategory({ mode: pet.mode, toys: toys.length }), { name: cfg.name }));
      resetChatterTimer();
    }
  }

  // ---------- bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updatePet(dt);
    updateToys(dt);
    updateSpawner(dt);
    expireNotes();
    updateCodes(dt);
    updateParticles(dt);
    updateChatter(dt);
    if (bubble) {
      bubble.t += dt;
      if (bubble.t > bubble.dur) bubble = null;
    }
    render();
    sync(dt);
    requestAnimationFrame(frame);
  }

  const bornAt = performance.now();

  // Entrada: cae desde arriba en algún sitio de la pantalla principal. Se
  // espera a la configuración para saber dónde están las pantallas.
  let entered = false;
  function enter() {
    entered = true;
    const a = areas[0];
    pet.x = a.x + a.w * rand(0.3, 0.8);
    pet.y = a.y + a.h * rand(0.5, 0.9);
    pet.z = pet.y - a.y + 60;
    setState('air', {});
    dropToyFromSky('ball', pet.x - a.w * 0.15, pet.y + rand(-40, 40));
    setTimeout(() => {
      say(Quips.line(Quips.greetingCategory()), 4.5);
      setTimeout(() => say(Quips.line('hint')), 5500);
    }, 1800);
  }
  if (!window.petAPI) enter();
  requestAnimationFrame(frame);

  // Para pruebas desde la consola
  window.__pet = { pet, toys, marks, think, spawner, runCommand, snapshot, say, cfg, chatter, setUserIdle: (s) => (userIdle = s) };
})();
