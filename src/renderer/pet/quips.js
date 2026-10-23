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
      'Ah, hola. Estaba aquí, ocupadísimo, mirando la barra de tareas.',
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
      'Llevo un rato aquí abajo y nadie me ha preguntado qué tal estoy. Estoy bien, gracias.',
      'Este escritorio está muy limpio. Demasiado. Sospechoso.',
      'Si me necesitas, estaré aquí. Andando. En línea recta. Como siempre.',
      'He contado los píxeles del suelo. Son muchos. No me preguntes cuántos.',
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
