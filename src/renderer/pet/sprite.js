// Pixel art del monigote y de los objetos. Todo se dibuja en una rejilla
// pequeña y luego se escala sin suavizado para que se vea pixelado.
(function () {
  const COLORS = {
    body: '#D97757',
    shade: '#BE6146',
    light: '#E8957A',
    eye: '#1E1B19',
    blush: '#F4A99A',
  };

  // Rejilla del monigote: el origen (0,0) está entre los pies, en el suelo.
  const GW = 28;
  const GH = 24;
  const OX = 14;
  const OY = 22;

  function makeBuffer(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
  }

  const petBuf = makeBuffer(GW, GH);

  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(OX + x, OY + y, w, h);
  }

  // Patas (x de cada pata de 2px de ancho). El cuerpo va de x=-7 a x=6.
  const LEGS = [-6, -3, 1, 4];

  /**
   * Dibuja un fotograma del monigote en el buffer y lo devuelve.
   * pose: {
   *   step: 0 | 1 | 2      (0 = quieto, 1/2 = fases de andar)
   *   legs: 'stand' | 'dangle' | 'tuck'
   *   eyes: 'open' | 'closed' | 'wide' | 'happy' | 'x' | 'sleep'
   *   look: -1 | 0 | 1     (hacia dónde miran los ojos)
   *   arms: 'down' | 'up' | 'wave' | 'out' | 'carry'
   *   armFrame: 0 | 1
   *   bob: 0 | 1           (rebote del cuerpo)
   *   mouth: bool
   *   blush: bool
   * }
   */
  function drawPet(pose) {
    const ctx = petBuf.ctx;
    ctx.clearRect(0, 0, GW, GH);
    const p = Object.assign(
      { step: 0, legs: 'stand', eyes: 'open', look: 0, arms: 'down', armFrame: 0, bob: 0, mouth: false, blush: false },
      pose
    );
    const lift = p.bob ? -1 : 0;

    // Patas
    LEGS.forEach((lx, i) => {
      let len = 3;
      let top = -3;
      if (p.legs === 'tuck') len = 2;
      if (p.legs === 'dangle') len = 4 - ((i + p.armFrame) % 2);
      if (p.step === 1 && (i === 0 || i === 2)) len = 2;
      if (p.step === 2 && (i === 1 || i === 3)) len = 2;
      if (p.legs === 'dangle') top = -3;
      px(ctx, lx, top + lift, 2, len - lift, COLORS.shade);
      px(ctx, lx, top + lift, 2, Math.max(1, len - 1 - lift), COLORS.body);
    });

    // Cuerpo
    const by = -11 + lift;
    px(ctx, -7, by, 14, 8, COLORS.body);
    px(ctx, -7, by + 7, 14, 1, COLORS.shade);
    px(ctx, -6, by, 12, 1, COLORS.light);

    // Brazos
    const armY = by + 3;
    const drawArm = (side, mode) => {
      const x = side < 0 ? -9 : 7;
      if (mode === 'down') px(ctx, x, armY, 2, 2, COLORS.body);
      else if (mode === 'out') px(ctx, side < 0 ? -10 : 7, armY - 1, 3, 2, COLORS.body);
      else if (mode === 'up') px(ctx, x, by - 2, 2, 4, COLORS.body);
    };
    if (p.arms === 'wave') {
      drawArm(-1, 'down');
      drawArm(1, p.armFrame ? 'up' : 'out');
    } else if (p.arms === 'carry' || p.arms === 'up') {
      drawArm(-1, 'up');
      drawArm(1, 'up');
    } else if (p.arms === 'dance') {
      drawArm(-1, p.armFrame ? 'up' : 'down');
      drawArm(1, p.armFrame ? 'down' : 'up');
    } else {
      drawArm(-1, p.arms);
      drawArm(1, p.arms);
    }

    // Ojos (simétricos respecto al centro del cuerpo)
    const ey = by + 2;
    const lk = p.look || 0;
    const E = COLORS.eye;
    switch (p.eyes) {
      case 'closed':
      case 'sleep':
        px(ctx, -5 + lk, ey + (p.eyes === 'sleep' ? 2 : 1), 2, 1, E);
        px(ctx, 3 + lk, ey + (p.eyes === 'sleep' ? 2 : 1), 2, 1, E);
        break;
      case 'wide':
        px(ctx, -5 + lk, ey, 2, 2, E);
        px(ctx, 3 + lk, ey, 2, 2, E);
        break;
      case 'happy':
        [[-5, 1], [-4, 0], [-3, 1], [2, 1], [3, 0], [4, 1]].forEach(([x, y]) => px(ctx, x, ey + y, 1, 1, E));
        break;
      case 'x':
        [-5, 2].forEach((x0) => {
          [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]].forEach(([x, y]) => px(ctx, x0 + x, ey - 1 + y, 1, 1, E));
        });
        break;
      default:
        px(ctx, -4 + lk, ey, 1, 2, E);
        px(ctx, 3 + lk, ey, 1, 2, E);
    }
    if (p.blush) {
      px(ctx, -6, ey + 3, 1, 1, COLORS.blush);
      px(ctx, 5, ey + 3, 1, 1, COLORS.blush);
    }
    if (p.mouth) px(ctx, -1, ey + 3, 2, 1, E);

    return petBuf.canvas;
  }

  // ---------- Objetos ----------
  function buildToy(w, h, draw) {
    const b = makeBuffer(w, h);
    draw(b.ctx);
    return b.canvas;
  }
  const r = (ctx, x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  const TOYS = {
    ball: {
      label: 'pelota',
      w: 9,
      h: 9,
      bounce: 0.62,
      friction: 0.35,
      sprite: buildToy(9, 9, (c) => {
        const rows = ['..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..'];
        rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && r(c, x, y, 1, 1, '#4A86E8')));
        r(c, 0, 4, 9, 1, '#F3F3F3');
        r(c, 4, 0, 1, 9, '#F3F3F3');
        r(c, 2, 2, 1, 1, '#BFD6FA');
      }),
    },
    box: {
      label: 'caja',
      w: 10,
      h: 8,
      bounce: 0.15,
      friction: 4,
      sprite: buildToy(10, 8, (c) => {
        r(c, 0, 0, 10, 8, '#B9874F');
        r(c, 1, 1, 8, 6, '#D2A46C');
        r(c, 4, 0, 2, 8, '#E9D3A6');
        r(c, 1, 6, 8, 1, '#B9874F');
      }),
    },
    document: {
      label: 'documento',
      w: 7,
      h: 9,
      bounce: 0.1,
      friction: 6,
      sprite: buildToy(7, 9, (c) => {
        r(c, 0, 0, 7, 9, '#7A7A7A');
        r(c, 1, 1, 5, 7, '#FAFAF5');
        r(c, 5, 0, 2, 2, 'rgba(0,0,0,0)');
        c.clearRect(5, 0, 2, 2);
        r(c, 5, 1, 1, 1, '#7A7A7A');
        r(c, 6, 2, 1, 1, '#7A7A7A');
        r(c, 2, 3, 3, 1, '#9AA7C7');
        r(c, 2, 5, 3, 1, '#9AA7C7');
        r(c, 2, 7, 2, 1, '#9AA7C7');
      }),
    },
    // Nota adhesiva que trae la mascota de fuera de la pantalla. El texto se
    // escribe encima al dibujarla (cada nota dice una cosa).
    note: {
      label: 'nota',
      w: 34,
      h: 27,
      bounce: 0.05,
      friction: 8,
      sprite: buildToy(34, 27, (c) => {
        r(c, 0, 1, 34, 26, '#E0C341');
        r(c, 0, 0, 34, 26, '#FCE77A');
        r(c, 0, 0, 34, 3, '#F5D94E');
        r(c, 31, 23, 3, 3, '#E9CD4F');
      }),
    },
  };

  // Más juguetes, pintados con filas de letras (cada letra, un color).
  function fromRows(rows, palette) {
    return buildToy(rows[0].length, rows.length, (c) => {
      rows.forEach((row, y) => [...row].forEach((ch, x) => palette[ch] && r(c, x, y, 1, 1, palette[ch])));
    });
  }
  Object.assign(TOYS, {
    mug: {
      label: 'taza de café',
      w: 10,
      h: 9,
      bounce: 0.1,
      friction: 6,
      sprite: fromRows(
        ['.ssssss...', '.bbbbbb...', '.wwwwwwss.', '.wwwwww.s.', '.wwwwww.s.', '.wwwwwwss.', '.wwwwww...', '.swwwwws..', '..ssssss..'],
        { w: '#F3EEE6', s: '#BDB3A5', b: '#6B3F22' }
      ),
    },
    duck: {
      label: 'patito de goma',
      w: 10,
      h: 9,
      bounce: 0.45,
      friction: 2,
      sprite: fromRows(
        ['....yyy...', '...yyyyy..', '...yyeyyoo', '...yyyyyoo', 'y...yyyy..', 'yyyyyyyyy.', 'yyyyyyyyy.', '.yyyyyyy..', '..dddddd..'],
        { y: '#F5C542', d: '#D9A626', e: '#1E1B19', o: '#E8743B' }
      ),
    },
    bug: {
      label: 'bicho',
      w: 8,
      h: 6,
      bounce: 0.2,
      friction: 1,
      sprite: fromRows(
        ['......a.', '..ggg.a.', '.gGgGgkk', 'gggggggk', '.ggggg..', '.k.k.k..'],
        { g: '#3B7A3A', G: '#6DB06B', k: '#1E1B19', a: '#1E1B19' }
      ),
    },
    plane: {
      label: 'avión de papel',
      w: 12,
      h: 6,
      bounce: 0.1,
      friction: 5,
      sprite: fromRows(['..........ww', '.......wwwws', '....wwwwwss.', '.wwwwwwsss..', 'wwsssss.....', '.sss........'], {
        w: '#FAFAF5',
        s: '#C9CFD9',
      }),
    },
    cookie: {
      label: 'galleta',
      w: 9,
      h: 9,
      bounce: 0.2,
      friction: 5,
      sprite: fromRows(
        ['..ccccc..', '.cccccdc.', 'ccdcccccc', 'cccccdccc', 'cdcccccdc', 'cccdccccc', 'cccccccdc', '.cdccccc.', '..ccccc..'],
        { c: '#D9A066', d: '#5A3A22' }
      ),
    },
    token: {
      label: 'token',
      w: 7,
      h: 7,
      bounce: 0.5,
      friction: 3,
      sprite: fromRows(['.ddddd.', 'dgglggd', 'dgdddgd', 'dggdggd', 'dggdggd', 'dgggggd', '.ddddd.'], {
        d: '#C99A2E',
        g: '#F5C542',
        l: '#FFF1B8',
      }),
    },
  });

  // Garabatos que la mascota pinta en la pantalla (se borran solos o con un clic).
  const DOODLE_ROWS = [
    ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
    ['.xxxxx.', 'x.....x', 'x.x.x.x', 'x.....x', 'x.x.x.x', 'x..x..x', '.xxxxx.'],
    ['...x...', '..xxx..', 'xxxxxxx', '.xxxxx.', '.xx.xx.', 'x.....x'],
    ['.xxxx', 'x....', 'x....', 'x....', '.xxxx'],
    ['.xxx.', 'x...x', '...x.', '..x..', '.....', '..x..'],
    ['x...x...x', '.x.x.x.x.', '..x...x..'],
    // cara de gato
    ['x.......x', 'xx.....xx', 'x.xxxxx.x', 'x.......x', 'x.x...x.x', 'x...x...x', 'x..x.x..x', '.x.....x.', '..xxxxx..'],
    // flecha
    ['....x....', '...xxx...', '..x.x.x..', '.x..x..x.', '....x....', '....x....', '....x....'],
    // "XD"
    ['x...x.xxx..', '.x.x..x..x.', '..x...x..x.', '.x.x..x..x.', 'x...x.xxx..'],
    // Clawdy en pequeñito
    ['.xxxxxxx.', 'xx.xxx.xx', 'xxxxxxxxx', '.xxxxxxx.', '.x.x.x.x.'],
  ];
  const DOODLES = DOODLE_ROWS.map((rows) =>
    buildToy(rows[0].length, rows.length, (c) => {
      rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && r(c, x, y, 1, 1, COLORS.body)));
    })
  );

  // Corazón pixelado para las partículas
  const HEART = buildToy(7, 6, (c) => {
    const rows = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && r(c, x, y, 1, 1, '#E8566C')));
  });

  window.Sprites = { drawPet, TOYS, HEART, DOODLES, COLORS, GRID: { GW, GH, OX, OY } };
})();
