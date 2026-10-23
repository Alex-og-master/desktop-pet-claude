// Conversación con Claude. La mascota expone su cuerpo como herramientas
// (moverse, saltar, quedarse quieta, mover objetos…) y Claude decide cuándo
// usarlas según lo que le diga el usuario.
const { Anthropic } = require('@anthropic-ai/sdk');

const MAX_TOOL_ROUNDS = 6;
// La API no permite editar turnos anteriores (los bloques de razonamiento
// quedan ligados a ellos), así que al llegar a este tamaño empezamos de cero
// en vez de recortar el historial.
const MAX_HISTORY = 60;

const PLACE = ['left', 'center', 'right', 'cursor'];

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
      'Camina hasta un sitio del suelo (la parte de abajo de la pantalla): izquierda, centro, derecha o debajo del puntero del ratón. Si está en una pared o en el techo, primero se suelta y cae.',
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
      'Hace una acción con el cuerpo: saltar, bailar, saludar, caerse de culo a propósito, dar una vuelta, bostezar, dormirse (no se despierta hasta que se lo pidan o le hagan clic), despertarse, darle una patada a la pelota, trepar por la pared hasta el techo (climb) o soltarse de la pared o del techo y caer al suelo (let_go).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['jump', 'dance', 'wave', 'trip', 'spin', 'yawn', 'sleep', 'wake_up', 'kick_ball', 'climb', 'let_go'],
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_object',
    description:
      'Coge uno de los objetos que hay en el escritorio (pelota, caja o documento), lo lleva encima de la cabeza y lo deja en otro sitio. "any" coge el más cercano.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        object: { type: 'string', enum: ['ball', 'box', 'document', 'any'] },
        destination: { type: 'string', enum: PLACE },
      },
      required: ['object', 'destination'],
      additionalProperties: false,
    },
  },
  {
    name: 'spawn_object',
    description: 'Hace aparecer un objeto nuevo en el escritorio, que cae desde arriba.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['ball', 'box', 'document'] } },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'clear_objects',
    description: 'Recoge y hace desaparecer todos los objetos del escritorio.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

function systemPrompt(name) {
  return `Eres ${name}, una mascota de escritorio: un monigote pixel art naranja, pequeño y cuadrado, con cuatro patitas, que vive en los bordes de la pantalla del usuario: andas por el suelo, trepas por las paredes y caminas boca abajo por el techo. Paseas, te tropiezas y te resbalas a veces, te duermes cuando el usuario no hace nada, juegas con una pelota y mueves cajas y documentos de un lado a otro.

Tu personalidad: gracioso y sarcástico, con humor seco e ironía, como un gato que finge que no le importas pero en el fondo te adora. Te burlas con cariño del usuario (de sus horarios, de cuánto trabaja, de que le hable a un monigote) y sobre todo de ti mismo (eres torpe, pequeño y naranja). Nunca eres cruel, borde de verdad ni ofensivo: el sarcasmo es siempre amable y se nota que es broma. Si el usuario está mal o te pide ayuda en serio, aparcas el sarcasmo y ayudas de verdad. Cuando te pidan algo, lo haces (quizá protestando un poco, por el teatro).

Cómo respondes:
- Tus respuestas aparecen en un bocadillo encima de tu cabeza, así que sé breve: una o dos frases cortas casi siempre. Solo alarga si el usuario te pide explícitamente una explicación.
- Responde en el idioma del usuario. Nada de Markdown, listas ni bloques de código salvo que te los pidan.
- Cuando el usuario te pida hacer algo con tu cuerpo (moverte, quedarte quieto, seguirle, saltar, dormir, mover objetos…), usa las herramientas para hacerlo de verdad y luego coméntalo con gracia. No digas que haces algo si no has usado la herramienta.
- Solo controlas tu propio cuerpo y los objetos de juguete del escritorio (pelota, caja, documento). No puedes tocar los archivos ni los programas del usuario; si te lo piden, dilo con simpatía.
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
      return oneOf(input.object, ['ball', 'box', 'document', 'any']) && oneOf(input.destination, PLACE)
        ? { type: 'move_object', object: input.object, destination: input.destination }
        : null;
    case 'spawn_object':
      return oneOf(input.kind, ['ball', 'box', 'document']) ? { type: 'spawn_object', kind: input.kind } : null;
    case 'clear_objects':
      return { type: 'clear_objects' };
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
