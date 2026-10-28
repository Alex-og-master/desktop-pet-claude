// Frases prefijadas de la mascota. No usan IA ni gastan tokens: se eligen
// según la hora, lo que estés haciendo con el ordenador y lo que le pase al
// monigote. {name}, {mins} y {hora} se sustituyen al decirlas.
(function () {
  const LINES = {
    // --- saludos al arrancar ---
    hello_morning: [
      'Buenos días. O eso dicen. Yo aún no he decidido.',
      '¿Ya estamos aquí? Si apenas son las {hora}…',
      'Buenos días. He dormido fatal: alguien no apagó el ordenador.',
      'Arriba ese ánimo. El mío no, el tuyo.',
    ],
    hello_afternoon: [
      '¡Buenas tardes! Llegas justo a tiempo para no hacer nada conmigo.',
      'Hola otra vez. Te he echado de menos. Un poco. Muy poco.',
      'Ah, hola. Estaba aquí, ocupadísimo, revisando tus ventanas.',
    ],
    hello_evening: [
      'Buenas noches. ¿Trabajando a estas horas? Qué productivo. Qué triste.',
      'Hola. Ya es de noche, por si no te has dado cuenta con tanta pantalla.',
    ],
    hello_late: [
      '¿Las {hora}? ¿En serio? Bueno, yo tampoco duermo, soy píxeles.',
      'Hola, criatura nocturna. Te traería un café, pero no tengo manos. Bueno, tengo dos rectángulos.',
    ],
    hint: [
      'Haz doble clic en mí si quieres hablar. O no. Tú verás.',
      'Por cierto: doble clic y hablamos. Prometo ser simpático. Más o menos.',
    ],

    // --- comentarios espontáneos ---
    random: [
      'Llevo un rato paseando por tu pantalla y nadie me ha preguntado qué tal estoy. Estoy bien, gracias.',
      'Este escritorio está muy limpio. Demasiado. Sospechoso.',
      'Si me necesitas, estaré por aquí. Por toda la pantalla, en realidad.',
      'He contado los píxeles de tu pantalla. Son muchos. No me preguntes cuántos.',
      'Dato curioso: soy naranja.',
      '¿Eso que haces es trabajo o estás fingiendo muy bien? Pregunto por un amigo.',
      'Hoy me siento productivo. Voy a caminar hasta la otra punta. Y volver.',
      'No es que me aburra, es que me sobra el tiempo.',
      'A veces me pregunto qué hay detrás de las ventanas. Luego se me pasa.',
      'Tengo cuatro patas y aun así me tropiezo. Que no te dé pena, es mi estilo.',
      'Mi agenda de hoy: pasear, caerme, dormir. Voy genial.',
      '¿Has guardado? Yo lo diría por si acaso. Ya está, ya lo he dicho.',
      'Si alguien pregunta, estoy supervisando. Muy de cerca.',
      'Me han dicho que la gente productiva hace descansos. Tú no lo sabrías.',
      'Estiro las patas. Las cuatro. Es un proceso largo.',
    ],
    late_night: [
      'Son las {hora}. Tu cama te echa de menos. Lo sé porque me lo ha dicho.',
      'Es tardísimo. Los bugs no se van a ir esta noche, te lo garantizo.',
      '¿Otra horita más? Eso dijiste hace una hora.',
      'A estas horas todo parece buena idea. Spoiler: no lo es.',
    ],
    morning: [
      'Primera hora de la mañana. Perfecto para quedarse mirando la pantalla sin hacer nada.',
      '¿Café? Yo no puedo, pero tú tienes pinta de necesitarlo.',
    ],
    lunch: [
      '¿No es hora de comer? Pregunto porque yo no como y me da envidia.',
      'Tu estómago acaba de hacer un ruido. Bueno, no lo he oído, pero me lo imagino.',
      'Las {hora}. Si no has comido, esto es una intervención.',
    ],
    monday: [
      'Lunes. Lo siento mucho.',
      'Es lunes. Yo tampoco quiero hablar del tema.',
    ],
    friday: [
      'Viernes por la tarde. Nadie está trabajando de verdad y lo sabes.',
      '¿Huele a fin de semana o soy yo?',
    ],
    stay: [
      'Sigo quieto. Muy quieto. Récord mundial de quietud.',
      'Me pediste que no me moviera. Me pica una pata. No me moveré.',
      'Inmóvil. Como una estatua. Una estatua naranja y preciosa.',
    ],
    follow: [
      'Te sigo, te sigo. ¿Sabes adónde vamos? Porque yo no.',
      'Esto de perseguir el ratón es mi cardio del día.',
    ],
    toys: [
      'Esa caja no se va a mover sola. Bueno, sí: la moveré yo. Luego.',
      'He decidido que la pelota es mía. Fin de la discusión.',
      'Tengo objetos y no tengo miedo de moverlos de sitio sin motivo.',
    ],

    // --- según tu actividad ---
    long_streak: [
      'Llevas {mins} minutos sin parar. Respira. Bebe agua. Mira algo que no sea una pantalla. Como yo, por ejemplo.',
      '{mins} minutos seguidos. Impresionante. Ahora levántate, que se te va a fosilizar la espalda.',
      'Llevas {mins} minutos dándole. Yo en ese tiempo me he caído tres veces. Cada uno con lo suyo.',
    ],
    welcome_back: [
      '¡Has vuelto! No te he echado de menos. Nada. Cero.',
      'Ah, mira quién está aquí. Pensaba que me habías abandonado.',
      'Bienvenido de nuevo. Mientras no estabas no ha pasado nada. Como siempre.',
      '¿Ya? Estaba a punto de redecorar el escritorio.',
    ],
    dream: [
      'zzz… no, el bug no… otra vez no…',
      'zzz… cinco minutitos más…',
      'zzz… galletas… galletas de píxeles…',
      'zzz… soy… un monigote… muy… importante…',
    ],
    going_to_sleep: [
      'Como no haces nada, yo tampoco. Me echo una siesta.',
      'Silencio absoluto. Ideal para dormir. Buenas noches.',
      '*bosteza* Avísame si pasa algo interesante. No pasará.',
    ],

    // --- reacciones ---
    poke: [
      '¿Sí? ¿Querías algo o solo clicar cosas?',
      '¡Hola! Sí, soy clicable. Sorpresa.',
      'Esto cuenta como acoso, que lo sepas.',
      '¡Jiji! Digo… ejem. Qué molesto.',
      'Soy {name}. Encantado. Deja de tocarme.',
      '♥ (no se lo digas a nadie)',
    ],
    tickled_too_much: [
      '¡Vale, vale, ya basta de cosquillas!',
      '¡Para, que me da la risa y me caigo!',
      'Te he dicho que pares. Ahora me caigo y es culpa tuya.',
    ],
    grabbed: [
      '¡Eh! ¡Bájame!',
      '¡Uaaah!',
      '¡Que me mareo!',
      '¿A dónde vamos? Espero que a algún sitio bonito.',
      'Esto no estaba en mi contrato.',
    ],
    splat: [
      '¡Ay!',
      '¡Plaf!',
      'Eso ha dolido. Emocionalmente, sobre todo.',
      'Aterrizaje perfecto. No, mentira.',
      'Voy a fingir que esto era lo que quería hacer.',
    ],
    trip: [
      '¡Uy!',
      'Ups…',
      'Estoy bien. El suelo, no tanto.',
      'Lo he hecho a propósito. Para que te rías. De nada.',
      '¿Quién ha puesto eso ahí? Ah, nada. No había nada.',
    ],
    woken: [
      '¿Mmm…? ¿Qué pasa? ¿Se quema algo?',
      '¡Estaba soñando con galletas! Gracias por nada.',
      'Cinco minutitos más… ¿no? Vale.',
      '¿Quién me ha despertado? Ah, tú. Claro.',
    ],

    // --- travesuras ---
    // Lo que pone en las notas adhesivas que trae (cortas, caben en un pósit).
    note_texts: [
      'Deja de mirar el móvil',
      'Esto lo he escrito yo. Con las patas.',
      'Recordatorio: bebe agua',
      'Te estoy vigilando',
      '¿Has guardado?',
      'Nota importante: soy naranja',
      'Tareas de hoy: 1) achuchar a Clawdy',
      'Me aburro',
      'Ya casi es viernes (mentira)',
      'No toques esto',
      'Lo que buscas está en la otra pestaña',
      'Clawdy estuvo aquí',
      '¿Y si apagas un rato?',
      'Pon la pelota donde estaba. Gracias.',
      'Prohibido trabajar después de las 20:00',
      'Esto es una nota. De nada.',
    ],
    note_drop: [
      'Te he dejado una nota. Es importante. Más o menos.',
      'Correo urgente. No hace falta que me des las gracias.',
      'Toma. Léela. Luego tírala, como haces con todo.',
      'Una nota. Haz clic para tirarla, si te atreves.',
    ],
    chase: [
      '¡Ese ratón es mío!',
      'Quieto ahí, flechita.',
      '¡Te voy a cazar!',
      'No corras, que es peor.',
    ],
    pounce: [
      '¡Te pillé!',
      '¡Ja! Cazado.',
      'Soy un depredador implacable.',
      '¡Mío!',
    ],
    chase_giveup: [
      'Bah, tampoco quería cogerte.',
      'Me canso. Tú ganas. Esta vez.',
      'Eres demasiado rápido. O yo demasiado cuadrado.',
    ],
    zoomies: [
      '¡NO PUEDO PARAR!',
      '¡Uiiiiii!',
      'Me ha dado un ataque de energía. Apártate.',
      '¡Carrera! ¡Contra nadie! ¡Y voy ganando!',
    ],
    doodle: [
      'Arte moderno. Gratis.',
      'Te he decorado la pantalla. De nada.',
      'Mira qué bonito. Un clic y lo borras, pero me dolería.',
      'Obra maestra. Lo firmaría, pero no sé escribir con estas patas.',
    ],
    steal: [
      'Esto me lo llevo. Por motivos.',
      'Lo estaba usando yo. Desde ahora.',
      'Préstamo indefinido.',
    ],
    leaving: [
      'Ahora vuelvo. O no. Ya veremos.',
      'Voy a dar una vuelta por ahí. No toques nada.',
      'Me voy a ver qué hay al otro lado de la pantalla.',
      'Salgo un momento. Si alguien pregunta, estoy en una reunión.',
    ],
    back: [
      '¡Ya estoy aquí! ¿Me has echado de menos? No contestes.',
      'He vuelto. Fuera de la pantalla no hay nada interesante, por cierto.',
      'Ya estoy. ¿Qué me he perdido? Nada, seguro.',
      'Tachán. Reaparición estelar.',
    ],
    brought: [
      'Mira lo que me he encontrado por ahí fuera.',
      'Te he traído un regalo. No preguntes de dónde ha salido.',
      'Esto estaba tirado ahí fuera. Ahora es tuyo. O mío.',
    ],
    tidy: [
      'Esta nota ya está vieja. Me la llevo.',
      'Hago limpieza. De nada.',
      'Esta nota me la quedo yo, que tú no le haces caso.',
    ],
    // --- lo que escribe en la pantalla (cada entrada es una tarjeta; \n = nueva línea) ---
    code: [
      'while (true) {\n  pasear();\n  caerme();\n  fingirQueEraAPropósito();\n}',
      '// TODO: dormir\n// TODO: dormir más\n// TODO: arreglar esto (nunca)',
      '$ git commit -m "arreglado"\n$ git commit -m "ahora sí"\n$ git commit -m "por favor"',
      'if (usuario.trabajando) {\n  molestar();\n} else {\n  molestar();\n}',
      '$ npm install ganas-de-trabajar\nERR! 404 paquete no encontrado',
      'function hacerCaso(orden) {\n  return Math.random() < 0.5;\n}',
      '> ¿Puedo pasear por tu pantalla?\n  1. Sí\n  2. Sí, y no me vuelvas a preguntar\n› 2',
      '✻ Cavilando… (3 s · esc para interrumpir)\n⎿ Conclusión: necesito una siesta.',
      '● Leyendo pantalla.png\n  ⎿ Hay demasiadas pestañas abiertas.\n● Sugerencia: cierra alguna. O todas.',
      '$ claude "haz mi trabajo"\n✻ Pensando…\n⎿ Mejor hazlo tú, yo soy naranja.',
      'const yo = {\n  color: "naranja",\n  patas: 4,\n  coordinación: null,\n};',
      '// Este código funciona.\n// No sé por qué.\n// No lo toques.',
      'try {\n  andarSinCaerme();\n} catch (suelo) {\n  console.log("¡ay!");\n}',
      '$ sudo hazme un café\n[sudo] contraseña para clawdy:\nNo. Hazlo tú.',
      'Tokens usados: 12\n  · 3 en pensar\n  · 9 en galletas',
      '$ rm -rf mis_problemas/\nrm: no se puede borrar: son demasiados',
      'git blame pantalla.js\n  ^ clawdy  (hace 2 min)  // perdón',
      '✻ Pensando más a fondo…\n⎿ 2 + 2 = 4\n⎿ Confianza: media.',
      'SELECT * FROM motivos_para_trabajar;\n-- 0 filas',
      '⏺ Actualizar(escritorio.js)\n  ⎿ +1 monigote naranja\n  ⎿ -1 productividad',
      '$ ping usuario\nPING usuario: tiempo de espera agotado\n¿Hola? ¿Sigues ahí?',
      'for (let i = 0; i < 3; i++) {\n  saltar();\n}\n// ¿me has visto? ¿me has visto?',
    ],
    typing: [
      'Un momento, que estoy programando.',
      'Shh. Estoy en la zona.',
      'Mira y aprende.',
      'Voy a escribir un poco de código. Del bueno. Más o menos.',
    ],
    coffee: [
      '¡CAFEÍNA! ¡NO SIENTO LAS PATAS!',
      'Glu, glu, glu… ¡VAMOS!',
      'Esto lo cambia todo. ¡TODO!',
      '¡Ahora sí que puedo programar! ¡O correr! ¡O ambas!',
    ],
    duck: [
      'A ver, patito: el bug está aquí… ¿o era aquí?',
      'Patito, te lo explico despacio: el código no funciona.',
      'Escucha, patito: si yo no lo entiendo, tú tampoco.',
      'Patito, eres el único que me escucha en esta oficina.',
      'Vale, patito, ya lo veo: el bug era yo.',
    ],
    bug_spotted: [
      '¡Un bug! ¡Ven aquí!',
      '¡Bicho a la vista!',
      'Eso que corre es un bug. Y es mío.',
    ],
    bug_fixed: [
      'Bug arreglado. Que no se entere QA.',
      '¡Aplastado! Cerrando el ticket.',
      'Un bug menos. Quedan 3.482.',
      'Arreglado en producción, como los profesionales.',
    ],
    bug_escaped: [
      'Se me ha escapado. Lo marco como "no se reproduce".',
      '¡Vuelve aquí! … Bueno, es una funcionalidad.',
      'Ese bug es más rápido que yo. Como todos.',
    ],
    token: [
      '¡Un token! Ya llevo {n}.',
      'Token {n}. Me estoy haciendo rico.',
      '{n} tokens. Esto da para pensar una frase entera.',
      '¡Token! Van {n}. No pienso gastarlos.',
    ],
    fetch_toy: [
      'Me aburro. Voy a por algo para jugar.',
      'Espera, que tengo juguetes guardados por ahí fuera.',
      'Un momento, voy a buscar algo divertido. Divertido para mí.',
    ],
    read_doc: [
      'A ver qué pone… "Términos y condiciones". Acepto sin leer, como todo el mundo.',
      'Este documento es apasionante. Mentira. Son 40 páginas de tablas.',
      'Leyendo… leyendo… vale, no he entendido nada. Muy buen documento.',
      '"Informe trimestral". Spoiler: todo va regular.',
    ],
    read_note: [
      'Aquí pone: «{text}». Qué sabio soy.',
      '«{text}». Lo escribí yo. Es arte.',
      'Leo en voz alta: «{text}». De nada.',
    ],
    toss: ['¡Allá va!', '¡Hop!', '¡Vuela, vuela!', 'Ups, más fuerte de lo que quería.', 'Despegando. Abróchate el cinturón.'],
    box_jump: ['¡Parkour!', '¡Hop! Diez de diez.', 'Mírame, soy un atleta.', 'Salto olímpico. Aplaudid.'],
    cookie: [
      'Ñam. Ñam. ÑAM.',
      'Galleta de píxeles. Mi favorita. Mi única.',
      'No te he guardado. Lo siento. No lo siento.',
      'Esto sí que es productividad.',
    ],
    quack: ['¡Cuac!', 'Cuac.', '¿Cuac?', '¡CUAC!'],

    crumple: [
      '¡Oye! Esa nota era importante.',
      'Vale, a la papelera. Me lo apunto. En otra nota.',
      'Con lo que me había costado…',
    ],
    erase: [
      'Nadie aprecia el arte.',
      '¡Mi obra!',
      'Pues te pinto otro.',
    ],
  };

  // Cada categoría es una "bolsa": no repite una frase hasta haber dicho todas.
  const bags = {};
  function draw(cat) {
    const list = LINES[cat];
    if (!list || !list.length) return '';
    if (!bags[cat] || !bags[cat].length) {
      bags[cat] = list.slice().sort(() => Math.random() - 0.5);
    }
    return bags[cat].pop();
  }

  function line(cat, vars) {
    const v = Object.assign({ hora: hourText() }, vars || {});
    return draw(cat).replace(/\{(\w+)\}/g, (_m, k) => (v[k] != null ? v[k] : ''));
  }

  function hourText() {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function greetingCategory(date) {
    const h = (date || new Date()).getHours();
    if (h < 6) return 'hello_late';
    if (h < 13) return 'hello_morning';
    if (h < 21) return 'hello_afternoon';
    return 'hello_evening';
  }

  // Qué tipo de comentario espontáneo toca ahora mismo.
  function ambientCategory(ctx) {
    const now = ctx.now || new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const day = now.getDay();
    const options = [['random', 6]];
    if (h < 5) options.push(['late_night', 8]);
    if (h >= 7 && h < 10) options.push(['morning', 2]);
    if ((h === 13 && m >= 30) || h === 14) options.push(['lunch', 4]);
    if (day === 1 && h < 13) options.push(['monday', 3]);
    if (day === 5 && h >= 15) options.push(['friday', 3]);
    if (ctx.mode === 'stay') options.push(['stay', 6]);
    if (ctx.mode === 'follow') options.push(['follow', 6]);
    if (ctx.toys > 0) options.push(['toys', 2]);
    const total = options.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    for (const [cat, w] of options) {
      r -= w;
      if (r <= 0) return cat;
    }
    return 'random';
  }

  window.Quips = { line, greetingCategory, ambientCategory, LINES };
})();
