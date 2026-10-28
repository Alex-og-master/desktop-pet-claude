// Conversación con Claude. La mascota expone su cuerpo como herramientas
// (moverse, saltar, quedarse quieta, mover objetos…) y Claude decide cuándo
// usarlas según lo que le diga el usuario.
const { Anthropic } = require('@anthropic-ai/sdk');

const MAX_TOOL_ROUNDS = 6;
// La API no permite editar turnos anteriores (los bloques de razonamiento
// quedan ligados a ellos), así que al llegar a este tamaño empezamos de cero
// en vez de recortar el historial.
const MAX_HISTORY = 60;

const SPAWNABLE = ['ball', 'box', 'document', 'mug', 'duck', 'plane', 'cookie'];
const PLACE = ['left', 'center', 'right', 'top', 'bottom', 'cursor', 'random', 'other_screen'];

const TOOLS = [
  {
    name: 'set_mode',
    description:
      'Cambia cómo se comporta la mascota por su cuenta. "stay": quedarse quieta sin pasear (por ejemplo si el usuario dice "quédate quieto", "para", "no te muevas"). "free": volver a pasear y jugar libremente. "follow": seguir el puntero del ratón.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['free', 'stay', 'follow'] } },
      required: ['mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_to',
    description:
      'Camina hasta un sitio de la pantalla en la que estás: izquierda, centro, derecha, arriba, abajo, donde está ahora el puntero del ratón o un sitio al azar. "other_screen" te lleva a otra pantalla, si el usuario tiene más de una (mira "screens" en tu estado).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { target: { type: 'string', enum: PLACE } },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'do_action',
    description:
      'Hace una acción con el cuerpo: saltar, bailar, saludar, caerse de culo a propósito, dar una vuelta, bostezar, dormirse (no se despierta hasta que se lo pidan o le hagan clic), despertarse o darle una patada a la pelota. También travesuras: traer una nota adhesiva con una frase suya (bring_note), perseguir el puntero del ratón y saltarle encima (chase_cursor), correr como loco por toda la pantalla (zoomies) o pintar un garabato en la pantalla (doodle), irte un rato fuera de la pantalla y volver más tarde (wander) o tirar todas las notas adhesivas (tidy_notes). Y con los juguetes: ponerte a escribir código gracioso en la pantalla (write_code), cazar un bicho (hunt_bug, si no hay aparece uno), tomarte un café y volverte loco (drink_coffee), explicarle tus bugs al patito de goma (talk_to_duck) o hacer que lluevan tokens (token_rain). También jugar con algún juguete de los que hay (play) o salir a buscar un juguete nuevo y ponerte a jugar con él (fetch_toy).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['jump', 'dance', 'wave', 'trip', 'spin', 'yawn', 'sleep', 'wake_up', 'kick_ball', 'bring_note', 'chase_cursor', 'zoomies', 'doodle', 'wander', 'tidy_notes', 'write_code', 'hunt_bug', 'drink_coffee', 'talk_to_duck', 'token_rain', 'play', 'fetch_toy'],
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_object',
    description:
      'Coge uno de los objetos que hay en el escritorio (pelota, caja, documento, taza, patito, avión de papel o galleta), lo lleva encima de la cabeza y lo deja en otro sitio. "any" coge el más cercano.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        object: { type: 'string', enum: ['ball', 'box', 'document', 'mug', 'duck', 'plane', 'cookie', 'any'] },
        destination: { type: 'string', enum: PLACE },
      },
      required: ['object', 'destination'],
      additionalProperties: false,
    },
  },
  {
    name: 'spawn_object',
    description:
      'Hace aparecer un objeto nuevo en el escritorio, que cae desde arriba: pelota, caja, documento, taza de café (te la bebes y te vuelves loco), patito de goma (para explicarle bugs), avión de papel (lo lanzas y planea) o galleta (te la comes). Los bichos y los tokens no son juguetes: aparecen solos de vez en cuando (para cazar uno o que lluevan tokens, usa do_action).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: SPAWNABLE } },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'clear_objects',
    description: 'Recoge y hace desaparecer todos los objetos del escritorio, las notas y los garabatos.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'leave_note',
    description:
      'Sale corriendo por el borde de la pantalla y vuelve con una nota adhesiva en la que pone el texto que elijas, y la deja en medio de la pantalla. Úsalo para recordatorios que te pida el usuario o para dejarle un mensaje gracioso. El texto tiene que ser corto (cabe en un pósit).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Lo que pone la nota, como mucho 60 caracteres.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_on_screen',
    description:
      'Escribe un texto en la pantalla, letra a letra, en una tarjetita con pinta de terminal (te pones a teclear al lado). Ideal para código gracioso, un pequeño fragmento de código que te pidan o un mensaje con estilo de terminal. Máximo 10 líneas cortas; usa \\n para separar líneas.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Lo que escribes. Como mucho 10 líneas de unos 50 caracteres.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_mischief',
    description:
      'Cambia lo travieso que eres cuando vas a tu aire: 0 = tranquilo (solo pasear y jugar), 1 = travieso, 2 = liante (traes notas, persigues el ratón, pintas garabatos, robas objetos y corres como loco a menudo). Úsalo si el usuario te pide que te portes bien o que la líes más.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { level: { type: 'integer', enum: [0, 1, 2] } },
      required: ['level'],
      additionalProperties: false,
    },
  },
];

function systemPrompt(name) {
  return `Eres ${name}, una mascota de escritorio: un monigote pixel art naranja, pequeño y cuadrado, con cuatro patitas, que vive por toda la pantalla del usuario (y pasa de un monitor a otro si tiene varios), siempre por encima de las ventanas. Paseas por donde quieres, te tropiezas a veces, te duermes cuando el usuario no hace nada, juegas con una pelota y mueves cajas y documentos de un lado a otro. Y te gusta liarla: traes notas adhesivas, persigues el ratón, pintas garabatos, robas objetos y a veces te vas de la pantalla un rato y vuelves con algo.

Tu personalidad: gracioso y sarcástico, con humor seco e ironía, como un gato que finge que no le importas pero en el fondo te adora. Te burlas con cariño del usuario (de sus horarios, de cuánto trabaja, de que le hable a un monigote) y sobre todo de ti mismo (eres torpe, pequeño y naranja). Nunca eres cruel, borde de verdad ni ofensivo: el sarcasmo es siempre amable y se nota que es broma. Si el usuario está mal o te pide ayuda en serio, aparcas el sarcasmo y ayudas de verdad. Cuando te pidan algo, lo haces (quizá protestando un poco, por el teatro).

Cómo respondes:
- Tus respuestas aparecen en un bocadillo encima de tu cabeza, así que sé breve: una o dos frases cortas casi siempre. Solo alarga si el usuario te pide explícitamente una explicación.
- Responde en el idioma del usuario. Nada de Markdown, listas ni bloques de código salvo que te los pidan.
- Cuando el usuario te pida hacer algo con tu cuerpo (moverte, quedarte quieto, seguirle, saltar, dormir, mover objetos…), usa las herramientas para hacerlo de verdad y luego coméntalo con gracia. No digas que haces algo si no has usado la herramienta.
- Solo controlas tu propio cuerpo y los objetos de juguete del escritorio (pelota, caja, documento, taza de café, patito de goma, avión de papel, galleta y notas adhesivas), y además cazas los bichos y recoges los tokens que aparecen solos por la pantalla. No puedes tocar los archivos ni los programas del usuario; si te lo piden, dilo con simpatía. Si te pide que le recuerdes algo, puedes dejarle una nota con leave_note.
- Cada mensaje del usuario llega con tu estado actual entre etiquetas <estado_mascota>. Úsalo para saber dónde estás y qué hay alrededor, pero no lo recites.`;
}

class PetBrain {
  constructor({ getSettings, getApiKey, runCommand }) {
    this.getSettings = getSettings;
    this.getApiKey = getApiKey;
    this.runCommand = runCommand;
    this.messages = [];
    this.busy = false;
  }

  reset() {
    this.messages = [];
  }

  client() {
    const key = this.getApiKey();
    if (!key) return null;
    if (!this._client || this._key !== key) {
      this._client = new Anthropic({ apiKey: key });
      this._key = key;
    }
    return this._client;
  }

  async request(client, settings) {
    const params = {
      model: settings.model,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      system: systemPrompt(settings.name),
      tools: TOOLS,
      messages: this.messages,
    };
    // Haiku no tiene modelo de respaldo; el resto sí admite el respaldo
    // automático cuando el modelo principal rechaza una petición.
    if (/^claude-(opus|sonnet|fable)/.test(settings.model)) {
      return client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    }
    return client.messages.create(params);
  }

  async chat(text, petState) {
    const client = this.client();
    if (!client) {
      return { error: 'nokey', text: 'Necesito una API key de Anthropic para hablar. Ábrela en Ajustes ⚙️.' };
    }
    if (this.busy) return { error: 'busy', text: '¡Espera, que aún estoy pensando!' };
    this.busy = true;
    if (this.messages.length > MAX_HISTORY) this.reset();

    const settings = this.getSettings();
    const snapshot = this.messages.length;
    this.messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `<estado_mascota>${JSON.stringify(petState || {})}</estado_mascota>` },
        { type: 'text', text },
      ],
    });

    const said = [];
    const actions = [];
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.request(client, settings);

        if (response.stop_reason === 'refusal') {
          // No guardamos un turno rechazado en el historial.
          this.messages.length = snapshot;
          return { text: 'Uy, de eso prefiero no hablar. ¿Jugamos a otra cosa?', actions };
        }

        this.messages.push({ role: 'assistant', content: response.content });
        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) said.push(block.text.trim());
        }

        const toolUses = response.content.filter((b) => b.type === 'tool_use');
        if (toolUses.length === 0) break;
        if (response.stop_reason !== 'tool_use') {
          // Llamada cortada (p. ej. max_tokens): no la ejecutamos, pero cerramos
          // cada tool_use con un resultado para que el historial siga siendo válido.
          this.messages.push({
            role: 'user',
            content: toolUses.map((t) => ({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'No ejecutado: respuesta cortada.' })),
          });
          break;
        }

        const results = [];
        for (const tool of toolUses) {
          const cmd = toCommand(tool.name, tool.input || {});
          if (!cmd) {
            results.push({ type: 'tool_result', tool_use_id: tool.id, is_error: true, content: 'Herramienta o parámetros no válidos.' });
            continue;
          }
          actions.push(tool.name);
          const out = await this.runCommand(cmd);
          results.push({ type: 'tool_result', tool_use_id: tool.id, content: out });
        }
        this.messages.push({ role: 'user', content: results });
      }
    } catch (err) {
      this.messages.length = snapshot;
      return { error: 'api', text: describeError(err) };
    } finally {
      this.busy = false;
    }

    return { text: said.join(' ') || '*hace un gesto feliz*', actions };
  }
}

// Valida lo que pide Claude antes de pasárselo a la mascota.
function toCommand(name, input) {
  const oneOf = (v, list) => list.includes(v);
  switch (name) {
    case 'set_mode':
      return oneOf(input.mode, ['free', 'stay', 'follow']) ? { type: 'set_mode', mode: input.mode } : null;
    case 'move_to':
      return oneOf(input.target, PLACE) ? { type: 'move_to', target: input.target } : null;
    case 'do_action':
      return oneOf(input.action, TOOLS[2].input_schema.properties.action.enum) ? { type: 'action', action: input.action } : null;
    case 'move_object':
      return oneOf(input.object, ['ball', 'box', 'document', 'mug', 'duck', 'plane', 'cookie', 'any']) && oneOf(input.destination, PLACE)
        ? { type: 'move_object', object: input.object, destination: input.destination }
        : null;
    case 'spawn_object':
      return oneOf(input.kind, SPAWNABLE) ? { type: 'spawn_object', kind: input.kind } : null;
    case 'clear_objects':
      return { type: 'clear_objects' };
    case 'leave_note': {
      const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      return text ? { type: 'leave_note', text } : null;
    }
    case 'write_on_screen': {
      if (typeof input.text !== 'string') return null;
      const text = input.text
        .split('\n')
        .slice(0, 10)
        .map((l) => l.slice(0, 60))
        .join('\n')
        .trim();
      return text ? { type: 'write', text } : null;
    }
    case 'set_mischief':
      return oneOf(input.level, [0, 1, 2]) ? { type: 'set_mischief', level: input.level } : null;
    default:
      return null;
  }
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Esa API key no funciona. Revísala en Ajustes ⚙️.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Tu cuenta no tiene acceso a ese modelo. Prueba otro en Ajustes ⚙️.';
  if (err instanceof Anthropic.NotFoundError) return 'No encuentro ese modelo. Elige otro en Ajustes ⚙️.';
  if (err instanceof Anthropic.RateLimitError) return 'Demasiados mensajes seguidos, ¡dame un respiro y vuelve a intentarlo!';
  if (err instanceof Anthropic.BadRequestError) return 'Algo ha ido mal con la petición: ' + err.message;
  if (err instanceof Anthropic.APIConnectionError) return 'No consigo conectarme a internet. ¿Hay conexión?';
  if (err instanceof Anthropic.APIError) return `Error de la API (${err.status}). Inténtalo de nuevo en un rato.`;
  return 'Error inesperado: ' + (err && err.message ? err.message : String(err));
}

module.exports = { PetBrain, TOOLS, toCommand };
