// Motor de la mascota: estados, físicas, objetos, partículas e interacción.
(function () {
  const { drawPet, TOYS, HEART, GRID } = window.Sprites;
  const Quips = window.Quips;

  // Si no estamos dentro de Electron (por ejemplo, abriendo el HTML en un
  // navegador para probar), usamos un API vacío.
  const api = window.petAPI || {
    setHitRects() {},
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
  const cfg = { scale: 4, name: 'Clawdy', sleepAfter: 120, chatter: 2 };
  const GRAVITY = 2400;
  const S = () => cfg.scale;
  const ground = () => H - 1;

  // ---------- utilidades ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function weighted(options) {
    const total = options.reduce((s, o) => s + o[0], 0);
    let r = Math.random() * total;
    for (const [w, fn] of options) {
      r -= w;
      if (r <= 0) return fn;
    }
    return options[options.length - 1][1];
  }

  // ---------- mundo ----------
  const cursor = { x: -9999, y: -9999 };
  let userIdle = 0;

  const pet = {
    x: W * 0.7,
    y: ground(),
    vx: 0,
    vy: 0,
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
  let bubble = null;

  const petHalfW = () => 9 * S();
  const petHeight = () => 13 * S();
  const minX = () => petHalfW() + 2;
  const maxX = () => W - petHalfW() - 2;

  function setState(name, data) {
    if (!['trip', 'air', 'dragged', 'spin'].includes(name)) pet.rot = 0;
    pet.state = name;
    pet.st = 0;
    pet.data = data || {};
  }

  const BUSY = new Set(['dragged', 'air', 'trip', 'splat', 'land', 'pickup']);

  // ---------- burbuja de diálogo ----------
  function say(text, seconds) {
    if (!text) {
      bubble = null;
      return;
    }
    ctx.font = '13px system-ui, sans-serif';
    const maxW = 230;
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
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
    if (lines.length > 7) {
      lines.length = 7;
      lines[6] += '…';
    }
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const dur = seconds || clamp(2.5 + text.length * 0.06, 3, 14);
    bubble = { lines, width, t: 0, dur };
  }

  // ---------- partículas ----------
  function emit(type, x, y, opts) {
    particles.push(Object.assign({ type, x, y, vx: 0, vy: -30, life: 1.4, t: 0 }, opts || {}));
  }

  // ---------- objetos ----------
  function spawnToy(kind, x, y) {
    const def = TOYS[kind];
    if (!def) return null;
    if (toys.length >= 10) toys.shift();
    const toy = {
      id: nextToyId++,
      kind,
      x: clamp(x, 20, W - 20),
      y: y,
      vx: rand(-40, 40),
      vy: 0,
      angle: 0,
      held: null,
    };
    toys.push(toy);
    return toy;
  }
  const toySize = (t) => ({ w: TOYS[t.kind].w * S(), h: TOYS[t.kind].h * S() });

  function findToy(kind) {
    const free = toys.filter((t) => t.held !== 'user' && (kind === 'any' || t.kind === kind));
    if (!free.length) return null;
    // el más cercano a la mascota
    return free.sort((a, b) => Math.abs(a.x - pet.x) - Math.abs(b.x - pet.x))[0];
  }

  function dropCarried(vx, vy) {
    const t = pet.carrying;
    if (!t) return;
    t.held = null;
    t.vx = vx || 0;
    t.vy = vy || -150;
    pet.carrying = null;
  }

  function cancelTask() {
    pet.task = null;
    dropCarried(pet.facing * 60, -120);
  }

  // ---------- acciones básicas ----------
  function walkTo(x, opts) {
    const o = opts || {};
    setState('walk', {
      target: clamp(x, minX(), maxX()),
      speed: (o.run ? 170 : 65) * (S() / 4),
      onArrive: o.onArrive,
      noTrip: o.noTrip,
    });
  }

  function idle(dur) {
    setState('idle', { dur: dur == null ? rand(1.2, 4) : dur });
  }

  function jump(power) {
    pet.vy = -(power || 780) * Math.sqrt(S() / 4);
    pet.vx = pet.state === 'walk' ? pet.facing * pet.data.speed : 0;
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

  function moveToyTask(toy, destX) {
    cancelTask();
    pet.task = { type: 'move', toy, destX: clamp(destX, minX(), maxX()) };
    walkTo(toy.x, {
      noTrip: true,
      onArrive: () => {
        if (!pet.task || toy.held) return idle();
        setState('pickup', { toy });
      },
    });
  }

  function kickTask(ball) {
    cancelTask();
    const dir = ball.x > W / 2 ? -1 : 1; // patear hacia el lado con más hueco
    const standX = ball.x - dir * (petHalfW() + toySize(ball).w / 2 - 4);
    pet.task = { type: 'kick', toy: ball };
    walkTo(standX, {
      noTrip: true,
      onArrive: () => {
        pet.facing = dir;
        setState('kick', { toy: ball, dir });
      },
    });
  }

  function resolveX(target) {
    switch (target) {
      case 'left':
        return W * 0.1;
      case 'center':
        return W * 0.5;
      case 'right':
        return W * 0.9;
      case 'cursor':
        return cursor.x > -1000 ? cursor.x : pet.x;
      case 'random':
        return rand(minX(), maxX());
      default:
        return typeof target === 'number' ? target : pet.x;
    }
  }

  // ---------- cerebro ----------
  function think() {
    if (pet.mode === 'stay') return idle(rand(2, 5));
    if (pet.mode === 'follow') {
      const dx = cursor.x - pet.x;
      if (Math.abs(dx) > 60 && cursor.x > -1000) return walkTo(cursor.x - Math.sign(dx) * 40, { run: Math.abs(dx) > 300 });
      pet.facing = dx >= 0 ? 1 : -1;
      return idle(0.4);
    }

    const ball = toys.find((t) => t.kind === 'ball' && !t.held);
    const anyToy = toys.filter((t) => !t.held);
    const action = weighted([
      [45, () => walkTo(rand(minX(), maxX()), { run: Math.random() < 0.15 })],
      [20, () => idle(rand(2, 5))],
      [anyToy.length ? 10 : 0, () => moveToyTask(pick(anyToy), rand(minX(), maxX()))],
      [ball ? 8 : 0, () => kickTask(ball)],
      [5, () => jump()],
      [3, () => setState('dance', { dur: rand(2.5, 4.5) })],
      [3, () => setState('yawn')],
      [cursor.x > -1000 && Math.abs(cursor.x - pet.x) < 400 ? 4 : 0, () => setState('wave')],
      [2, () => setState('spin')],
    ]);
    action();
  }

  // ---------- comandos (desde el chat con Claude o el menú) ----------
  function runCommand(cmd) {
    if (pet.state === 'dragged') return 'Ahora mismo el usuario me está sujetando con el ratón.';
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
        const x = resolveX(cmd.target);
        walkTo(x, { run: Math.abs(x - pet.x) > 400, noTrip: true });
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
        moveToyTask(toy, resolveX(cmd.destination));
        return `Voy a llevar la ${TOYS[toy.kind].label} a ${cmd.destination}.`;
      }
      case 'spawn_object': {
        const t = spawnToy(cmd.kind, pet.x + pet.facing * rand(60, 160), -40);
        return t ? `Ha aparecido un objeto: ${TOYS[t.kind].label}.` : 'No conozco ese objeto.';
      }
      case 'clear_objects':
        cancelTask();
        toys.length = 0;
        return 'Objetos recogidos.';
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
      default:
        return 'No sé hacer eso.';
    }
  }

  function snapshot() {
    const where = (x) => (x < W * 0.33 ? 'izquierda' : x > W * 0.66 ? 'derecha' : 'centro');
    return {
      name: cfg.name,
      state: pet.state,
      mode: pet.mode,
      asleep: pet.state === 'sleep',
      position: `${where(pet.x)} (${Math.round((pet.x / W) * 100)}% del ancho)`,
      carrying: pet.carrying ? TOYS[pet.carrying.kind].label : null,
      objects: toys.map((t) => `${TOYS[t.kind].label} en ${where(t.x)}${t.held === 'user' ? ' (el usuario la tiene cogida)' : ''}`),
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
        pet.vx = 0;
        relax(10);
        pet.rot = 0;
        if (cursor.x > -1000 && Math.abs(cursor.x - pet.x) < 250 && Math.random() < dt * 0.5) {
          pet.facing = cursor.x > pet.x ? 1 : -1;
        }
        if (pet.st > d.dur) think();
        break;
      }
      case 'walk': {
        relax(10);
        pet.rot = 0;
        const dx = d.target - pet.x;
        if (Math.abs(dx) < 3) {
          pet.x = d.target;
          if (d.onArrive) d.onArrive();
          else idle();
          break;
        }
        pet.facing = dx > 0 ? 1 : -1;
        pet.x += pet.facing * Math.min(Math.abs(dx), d.speed * dt);
        pet.vx = pet.facing * d.speed;
        // a veces se tropieza
        if (!d.noTrip && !pet.carrying && Math.random() < dt * 0.04) trip();
        if (pet.mode === 'follow' && pet.st > 0.4) think();
        break;
      }
      case 'air': {
        pet.vy += GRAVITY * dt;
        pet.x += pet.vx * dt;
        pet.y += pet.vy * dt;
        if (d.spin) pet.rot += d.spin * dt;
        if (pet.x < minX() || pet.x > maxX()) {
          pet.x = clamp(pet.x, minX(), maxX());
          pet.vx *= -0.5;
        }
        if (pet.vy < 0) {
          pet.sy = 1.15;
          pet.sx = 0.9;
        } else relax(6);
        if (pet.y >= ground()) {
          const impact = pet.vy;
          pet.y = ground();
          pet.vx = 0;
          pet.vy = 0;
          pet.rot = 0;
          for (let i = 0; i < 5; i++) emit('dust', pet.x + rand(-8, 8) * s, ground() - 2, { vx: rand(-60, 60), vy: rand(-60, -20), life: 0.5 });
          if (impact > 1300 && !d.soft) {
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
          pet.x = clamp(pet.x + pet.facing * 90 * dt * (s / 4), minX(), maxX());
        } else if (t < 1.9) {
          pet.rot = pet.facing * 180;
          if (!d.stars) {
            d.stars = true;
            for (let i = 0; i < 3; i++) emit('star', pet.x, pet.y - 12 * s, { orbit: i * 2.1, life: 1.5 });
            for (let i = 0; i < 6; i++) emit('dust', pet.x + pet.facing * 8 * s, ground() - 2, { vx: rand(-50, 50), vy: rand(-50, -10), life: 0.5 });
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
        if (cursor.x > -1000) pet.facing = cursor.x > pet.x ? 1 : -1;
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
      case 'pickup': {
        const toy = d.toy;
        if (!pet.task || toy.held === 'user') {
          pet.task = null;
          idle();
          break;
        }
        toy.held = 'pet';
        pet.carrying = toy;
        if (pet.st > 0.3) {
          const destX = pet.task.destX;
          walkTo(destX, {
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
          if (!ball.held && Math.abs(ball.x - pet.x) < petHalfW() + toySize(ball).w + 10) {
            ball.vx = d.dir * rand(380, 700) * (s / 4);
            ball.vy = -rand(250, 600);
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

    if (pet.state !== 'air' && pet.state !== 'dragged') pet.y = ground();
    pet.x = clamp(pet.x, minX(), maxX());
  }

  function updateToys(dt) {
    const s = S();
    for (const t of toys) {
      const def = TOYS[t.kind];
      const { w, h } = toySize(t);
      if (t.held === 'pet') {
        t.x = pet.x;
        t.y = pet.y - 12.5 * s * pet.sy;
        t.vx = t.vy = 0;
        continue;
      }
      if (t.held === 'user') continue;
      t.vy += GRAVITY * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < w / 2 || t.x > W - w / 2) {
        t.x = clamp(t.x, w / 2, W - w / 2);
        t.vx *= -0.6;
      }
      if (t.y >= ground()) {
        t.y = ground();
        t.vy = t.vy > 140 ? -t.vy * def.bounce : 0;
        t.vx *= Math.exp(-def.friction * dt);
        if (Math.abs(t.vx) < 3) t.vx = 0;
      }
      if (t.kind === 'ball') t.angle += (t.vx * dt) / (w / 2);
      else if (t.y >= ground()) t.angle = 0;
      else t.angle += t.vx * dt * 0.01;

      // la mascota empuja la pelota al pasar andando
      if (
        t.kind === 'ball' &&
        pet.state === 'walk' &&
        t.y >= ground() - 2 &&
        Math.abs(t.x - pet.x) < petHalfW() * 0.8 + w / 2 &&
        Math.sign(t.x - pet.x) === pet.facing
      ) {
        t.vx = pet.facing * Math.max(Math.abs(t.vx), pet.data.speed * 2.2);
        t.vy = -120;
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
  }

  // ---------- dibujo ----------
  function pose() {
    const st = pet.state;
    const p = { eyes: 'open', look: 0, step: 0, arms: 'down', legs: 'stand' };
    if (cursor.x > -1000 && Math.hypot(cursor.x - pet.x, cursor.y - pet.y) < 600) {
      const dx = cursor.x - pet.x;
      p.look = (dx > 30 ? 1 : dx < -30 ? -1 : 0) * pet.facing;
    }
    if (st === 'walk') {
      const period = pet.data.speed > 100 ? 0.09 : 0.16;
      p.step = Math.floor(pet.anim / period) % 2 ? 1 : 2;
      p.bob = p.step === 1 ? 1 : 0;
      p.look = pet.mode === 'follow' ? p.look : 1;
    }
    if (pet.carrying) p.arms = 'carry';
    if (pet.blinking > 0) p.eyes = 'closed';
    switch (st) {
      case 'air':
        p.legs = 'tuck';
        p.eyes = pet.vy > 300 ? 'wide' : p.eyes;
        p.arms = pet.vy > 0 ? 'up' : 'out';
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

  function drawShadow(x, height, w) {
    const s = S();
    const k = clamp(1 - height / 400, 0.3, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.16 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, ground() - 1, w * k, 1.5 * s * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPetSprite() {
    const s = S();
    const img = drawPet(pose());
    const rad = (pet.rot * Math.PI) / 180;
    const c = Math.cos(rad);
    const lieLift = -s * (8 * Math.abs(Math.sin(rad)) + (c < 0 ? 11 * -c : 0));
    drawShadow(pet.x, ground() - pet.y, 8 * s);
    ctx.save();
    ctx.translate(Math.round(pet.x), Math.round(pet.y + lieLift));
    ctx.rotate(rad);
    ctx.scale(pet.facing * s * pet.sx, s * pet.sy);
    ctx.drawImage(img, -GRID.OX, -GRID.OY);
    ctx.restore();
  }

  function drawToys() {
    const s = S();
    for (const t of toys) {
      const def = TOYS[t.kind];
      const { w, h } = toySize(t);
      if (t.held !== 'pet') drawShadow(t.x, ground() - t.y, w * 0.45);
      ctx.save();
      ctx.translate(Math.round(t.x), Math.round(t.y - h / 2));
      ctx.rotate(Math.round(t.angle / (Math.PI / 2)) * (Math.PI / 2));
      ctx.drawImage(def.sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  function drawParticles() {
    const s = S();
    for (const p of particles) {
      const a = clamp(1 - p.t / p.life, 0, 1);
      ctx.globalAlpha = a;
      if (p.type === 'z') {
        ctx.font = `bold ${Math.round(9 + p.t * 5) + s}px monospace`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText('z', p.x, p.y);
        ctx.fillStyle = '#5B5BD6';
        ctx.fillText('z', p.x, p.y);
      } else if (p.type === 'heart') {
        ctx.drawImage(HEART, p.x - 3.5 * s * 0.8, p.y, 7 * s * 0.8, 6 * s * 0.8);
      } else if (p.type === 'note') {
        ctx.font = `bold ${14 + s}px sans-serif`;
        ctx.fillStyle = '#8A5CF6';
        ctx.fillText('♪', p.x, p.y);
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
      } else if (p.type === 'dust') {
        ctx.fillStyle = 'rgba(160,150,140,0.8)';
        ctx.fillRect(p.x, p.y, s, s);
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

  function drawBubble() {
    if (!bubble) return;
    const s = S();
    const pad = 9;
    const lh = 17;
    const w = bubble.width + pad * 2;
    const h = bubble.lines.length * lh + pad * 2 - 4;
    const headY = pet.carrying ? pet.y - 22 * s : pet.y - 14 * s;
    const bx = clamp(pet.x - w / 2, 6, W - w - 6);
    const by = Math.max(6, headY - h - 12);
    const a = clamp(Math.min(bubble.t / 0.15, (bubble.dur - bubble.t) / 0.3), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFDF8';
    ctx.strokeStyle = '#3D3929';
    ctx.lineWidth = 2;
    roundRect(bx, by, w, h, 10);
    ctx.fill();
    ctx.stroke();
    // colita
    const tx = clamp(pet.x, bx + 14, bx + w - 14);
    ctx.beginPath();
    ctx.moveTo(tx - 7, by + h - 1);
    ctx.lineTo(tx, by + h + 9);
    ctx.lineTo(tx + 7, by + h - 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 6, by + h - 3, 12, 3);
    ctx.fillStyle = '#2B2620';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    bubble.lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + i * lh));
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    drawToys();
    drawPetSprite();
    // el objeto que lleva encima se dibuja delante
    if (pet.carrying) {
      const t = pet.carrying;
      const { w, h } = toySize(t);
      ctx.drawImage(TOYS[t.kind].sprite, Math.round(t.x - w / 2), Math.round(t.y - h), w, h);
    }
    drawParticles();
    drawBubble();
  }

  // ---------- ratón ----------
  function petRect() {
    const s = S();
    if (Math.abs(pet.rot) > 45 && Math.abs(pet.rot) < 135) return { x: pet.x - 13 * s, y: pet.y - 10 * s, w: 26 * s, h: 10 * s };
    return { x: pet.x - petHalfW(), y: pet.y - petHeight() - 1, w: petHalfW() * 2, h: petHeight() + 2 };
  }
  function toyRect(t) {
    const { w, h } = toySize(t);
    return { x: t.x - w / 2 - 3, y: t.y - h - 3, w: w + 6, h: h + 6 };
  }
  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const toy = [...toys].reverse().find((t) => t.held !== 'pet' && inside(toyRect(t), x, y));
    let target = null;
    if (toy) target = { kind: 'toy', toy };
    else if (inside(petRect(), x, y)) target = { kind: 'pet' };
    if (!target) return;
    canvas.setPointerCapture(e.pointerId);
    api.setCapture(true);
    const ref = target.kind === 'toy' ? target.toy : pet;
    drag = Object.assign(target, {
      offX: ref.x - x,
      offY: ref.y - y,
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
    ref.x = clamp(x + drag.offX, 0, W);
    ref.y = Math.min(ground(), y + drag.offY);
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
        d.toy.vy = -500;
        d.toy.vx = rand(-150, 150);
      }
      return;
    }
    if (d.kind === 'pet') {
      pet.vx = vx;
      pet.vy = vy;
      setState('air', { spin: Math.abs(vx) > 900 ? Math.sign(vx) * 540 : 0 });
    } else {
      d.toy.held = null;
      d.toy.vx = vx;
      d.toy.vy = vy;
    }
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
    cursor.x = p.x;
    cursor.y = p.y;
  });
  api.onIdle((secs) => {
    userIdle = secs;
  });
  api.onConfig((c) => {
    const chatterChanged = c.chatter !== cfg.chatter;
    Object.assign(cfg, c);
    if (chatterChanged) resetChatterTimer();
  });
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

  let rectTimer = 0;
  let stateTimer = 0;
  function sync(dt) {
    rectTimer -= dt;
    stateTimer -= dt;
    if (rectTimer <= 0) {
      rectTimer = 0.05;
      const rects = [petRect(), ...toys.filter((t) => t.held !== 'pet').map(toyRect)].map((r) => ({
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.w),
        h: Math.round(r.h),
      }));
      api.setHitRects(rects);
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

  // Entrada: cae desde arriba
  pet.y = -60;
  pet.x = W * 0.75;
  setState('air', {});
  spawnToy('ball', W * 0.6, -200);
  setTimeout(() => {
    say(Quips.line(Quips.greetingCategory()), 4.5);
    setTimeout(() => say(Quips.line('hint')), 5500);
  }, 1800);
  requestAnimationFrame(frame);

  // Para pruebas desde la consola
  window.__pet = { pet, toys, runCommand, snapshot, say, cfg, chatter, setUserIdle: (s) => (userIdle = s) };
})();
