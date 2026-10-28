# Clawdy, una mascota de escritorio con la que puedes hablar

<p align="center"><img src="docs/preview.png" alt="Clawdy paseando, saludando, bailando, llevando una caja, cayéndose, durmiendo y colgando del ratón" /></p>

**Clawdy** es un monigote pixel art naranja, inspirado en el de Claude, que vive en tu pantalla, siempre por encima de las ventanas. Pasea por donde le da la gana, se tropieza, se duerme cuando no usas el ordenador, juega con una pelota y, sobre todo, **la lía**: te trae notas adhesivas, persigue el ratón, pinta garabatos y te roba las cosas. Además, puedes **hablar con él**: está conectado a Claude, así que si le dices "quédate quieto", "sígueme" o "lleva la caja a la izquierda", lo hace.

> Proyecto de fans, sin relación oficial con Anthropic. "Claude" es una marca de Anthropic.

## Qué hace

- 🚶 **Pasea por toda la pantalla** (y **pasa de un monitor a otro** si tienes varios), siempre encima de todas las ventanas, sin molestar: los clics pasan a las ventanas de debajo salvo cuando tocas al monigote o a sus objetos.
- 😈 **La lía** (puedes elegir cuánto en el menú *Travesuras*: tranquilo, travieso o liante):
  - Sale corriendo por un borde de la pantalla y vuelve con una **nota adhesiva** con alguna frase suya. Un clic en la nota la arruga y la tira. Como mucho hay 3 a la vez, se despegan solas a los 5 minutos y en el menú *Objetos → Tirar las notas* se van todas.
  - A veces **se va de la pantalla** un rato y vuelve por otro sitio (u otro monitor), a veces con algo en la cabeza… o llevándose una nota vieja.
  - **Persigue el ratón** y le salta encima.
  - **Pinta garabatos** en la pantalla (se borran solos, o con un clic).
  - Te **roba** la pelota o las cajas y se las lleva lejos.
  - Le dan **ataques de energía** y corre como loco de un lado a otro.
- 🧸 **Juguetes**:
  - **Taza de café**: se la bebe y le da un ataque de energía.
  - **Patito de goma**: le explica sus bugs y el patito contesta "¡cuac!" (también si le haces clic).
  - **Avión de papel**: lo lanza y planea lejos.
  - **Galleta**: se la come. Ñam.
  - Y la **pelota**, la **caja** y el **documento** de siempre.
  - **Juega con todo**: lanza cosas por los aires, salta por encima de la caja y lee en voz alta documentos y notas. Y a menudo sale a buscar un juguete nuevo y lo cambia por uno viejo, así que van rotando (como mucho hay 4 a la vez).
- 🐞 **Bichos y tokens**: no son juguetes, aparecen solos de vez en cuando. Los **bichos** entran correteando por un borde y huyen; Clawdy los persigue y los aplasta ("bug arreglado"), y tú también puedes con un clic. Los **tokens** brotan por la pantalla y él los colecciona como si no hubiera mañana. Si nadie los recoge, se acaban yendo.
- ⌨️ **Escribe en la pantalla**: se pone a teclear y aparece una tarjetita de terminal con código gracioso o chistes al estilo Claude Code, letra a letra. Un clic la borra. Desde el chat le puedes pedir que escriba lo que quieras.
- 🤕 **Se cae**: a veces se tropieza andando y acaba boca arriba pataleando. Si lo coges con el ratón y lo lanzas con fuerza, se estampa con un buen *plaf*.
- 😴 **Se duerme** si no tocas el teclado ni el ratón durante un rato (2 minutos por defecto) y se despierta cuando vuelves.
- 📦 **Mueve cosas**: una pelota, cajas y documentos. Los coge, se los pone en la cabeza y los lleva a otro sitio. La pelota la empuja y le da patadas.
- 😏 **Comenta cosas, con sarcasmo**: según la hora ("¿las 3 de la mañana? Tu cama te echa de menos"), si llevas una hora sin parar, si vuelves después de un rato fuera, si es lunes… Son **frases ya escritas, no usan IA ni gastan nada**. Puedes elegir cuánto habla (callado, pocos, normal o muchos) en el menú o en ajustes.
- 🖱️ **Interacción**: clic para hacerle cosquillas, arrastrar para cogerlo (¡y lanzarlo!), doble clic para hablar con él y clic derecho para ver el menú.
- 💬 **Chat con Claude**: le escribes y responde, con su personalidad graciosa y sarcástica, en un bocadillo encima de su cabeza. **Claude solo se usa cuando le escribes en el chat**; nada más gasta tokens. Usa *tool use* para controlar su propio cuerpo:
  - "Quédate quieto" / "Vuelve a pasear" / "Sígueme"
  - "Baila", "salta", "saluda", "haz como que te caes", "duérmete"
  - "Saca una caja y llévala a la derecha", "dale una patada a la pelota"
  - "Déjame una nota que ponga que tengo que entregar la práctica el viernes"
  - "Pórtate bien un rato" / "Líala más"
  - "Escribe en la pantalla un bucle que me diga que descanse", "tómate un café", "caza un bicho"

## Descargar y abrir

Descarga el archivo de tu sistema y **ábrelo con doble clic**. No hay que instalar nada:

| Sistema | Descarga | Cómo se abre |
|---|---|---|
| **Windows** | [Clawdy-Windows.exe](https://github.com/Alex-og-master/desktop-pet-claude/releases/latest/download/Clawdy-Windows.exe) | Doble clic. |
| **macOS** | [Clawdy-Mac.zip](https://github.com/Alex-og-master/desktop-pet-claude/releases/latest/download/Clawdy-Mac.zip) | Doble clic en el .zip y luego en *Clawdy*. |
| **Linux** | [Clawdy-Linux.zip](https://github.com/Alex-og-master/desktop-pet-claude/releases/latest/download/Clawdy-Linux.zip) | Descomprímelo y doble clic en *Clawdy-Linux.AppImage*. |

Clawdy cae en tu pantalla, te saluda y ya está. **A partir de ahí se abre solo cada vez que enciendes el ordenador** (se quita con clic derecho sobre él → *Iniciar con el ordenador*). En Linux, además, aparece en el menú de aplicaciones.

**La primera vez, el sistema te avisará**, porque Clawdy es gratis y no tiene un certificado de pago para firmarlo:

- **Windows**: sale "Windows protegió tu PC". Pulsa *Más información* y luego *Ejecutar de todas formas*.
- **macOS**: sale que no se puede comprobar el desarrollador. Ve a *Ajustes del Sistema → Privacidad y seguridad*, baja hasta el final y pulsa *Abrir igualmente*. Solo hace falta una vez.
- **Linux**: no avisa. Si no abre, prueba con el [`.deb`](https://github.com/Alex-og-master/desktop-pet-claude/releases/latest/download/Clawdy-Linux.deb) (doble clic → *Instalar*) o instala `libfuse2`, que algunas distribuciones no traen y que usan los AppImage.

¿Prefieres instalarlo como un programa normal? En [Releases](https://github.com/Alex-og-master/desktop-pet-claude/releases) también están el instalador de Windows (`Clawdy-Windows-Instalador.exe`, de un clic, con acceso directo en el escritorio), el `.dmg` de macOS y el `.deb` de Linux.

Clawdy no aparece en la barra de tareas: lo controlas desde el **icono de la bandeja del sistema** (junto al reloj) o con **clic derecho** sobre él. Si lo vuelves a abrir mientras ya está en marcha y lo tenías oculto, reaparece.

## Hablar con Clawdy

Para el chat hace falta una API key de Anthropic:

1. Créala en [console.anthropic.com](https://console.anthropic.com/) (*API Keys*).
2. Haz doble clic en Clawdy y pulsa ⚙ en la ventana del chat.
3. Pega la clave y guarda.

La clave se guarda **cifrada en tu ordenador** con el llavero del sistema y solo se envía a la API de Anthropic. También puedes usar la variable de entorno `ANTHROPIC_API_KEY`.

En ajustes puedes elegir el modelo: **Claude Opus 5.5** (por defecto, el más listo), **Sonnet 5.5** o **Haiku 5.5** (el más rápido y barato, de sobra para charlar con una mascota). Cada mensaje cuesta muy poco, pero se cobra en tu cuenta de Anthropic.

## Ejecutarlo desde el código

Necesitas [Node.js](https://nodejs.org/) 20 o superior.

```bash
git clone https://github.com/Alex-og-master/desktop-pet-claude.git
cd desktop-pet-claude
npm install
npm start
```

Otros comandos:

```bash
npm run check       # comprobaciones rápidas (sintaxis, herramientas, iconos)
npm run icons       # regenera los iconos a partir del sprite
npm run dist        # crea el instalador para tu sistema en dist/
PET_DEBUG=1 npm start   # muestra en la terminal los mensajes de la mascota
```

## Publicar una versión nueva

Los instaladores se generan solos con GitHub Actions al subir una etiqueta:

```bash
# sube la versión en package.json y luego:
git tag v0.1.0
git push origin v0.1.0
```

El workflow [`release.yml`](.github/workflows/release.yml) compila en Windows, macOS y Linux y sube los archivos a la página de Releases.

## Cómo funciona

```
src/
├── main/
│   ├── main.js        Ventanas, bandeja, menú e IPC (proceso principal de Electron)
│   ├── claude.js      Conversación con Claude y herramientas de la mascota
│   └── settings.js    Ajustes y API key cifrada
├── preload/           Puentes seguros entre Electron y las páginas
├── renderer/
│   ├── pet/           La mascota: sprite pixel art, frases (quips.js) y motor (estados, físicas, objetos)
│   └── chat/          La ventana de chat y ajustes
└── assets/            Iconos
```

- La mascota se dibuja en un `<canvas>` dentro de una **ventana transparente** que ocupa toda la pantalla y está siempre encima. En Windows y macOS, el proceso principal mira dónde está el puntero unas 30 veces por segundo y solo atrapa el ratón cuando está encima de la mascota o de un objeto. En Linux, la ventana se recorta (`setShape`) a la forma de lo que se ve, y los clics en el resto pasan directamente a las ventanas de debajo. Así puedes seguir usando el ordenador con normalidad.
- El mundo es "2D y medio": cada cosa tiene un punto en el suelo (`x`, `y`, cualquier sitio de la pantalla) y una altura `z` para saltos y lanzamientos. Se dibuja en `y - z`, con la sombra en el suelo, y lo que está más abajo en la pantalla se dibuja delante.
- El dibujo es pixel art generado con código (`sprite.js`), así que añadir poses o expresiones es cuestión de pintar unos cuantos rectángulos.
- El comportamiento es una máquina de estados (`pet.js`): `idle`, `walk`, `trip`, `air`, `sleep`, `dance`… Un pequeño "cerebro" elige qué hacer cuando está libre.
- El chat usa la [API de Claude](https://docs.claude.com/) con *tool use*. Claude recibe el estado actual de la mascota y herramientas como `set_mode`, `move_to`, `do_action`, `move_object` o `spawn_object`. Cuando las usa, el proceso principal se las pasa a la mascota y le devuelve el resultado.

## Limitaciones conocidas

- Los "objetos del escritorio" son juguetes de la propia mascota (pelota, caja, documento). **No mueve los iconos ni los archivos reales** de tu escritorio: hacerlo depende de cada sistema operativo, es frágil y podría desordenarte el escritorio.
- En **macOS** solo vive en la pantalla principal (allí una ventana no puede ocupar varias pantallas).
- En Linux con **Wayland**, Clawdy se relanza solo en modo X11 (XWayland), porque Wayland no deja que una ventana esté siempre encima. Aun así, Wayland solo deja saber dónde está el ratón cuando pasa por encima de ventanas X11, así que a veces no te perseguirá ni te mirará (si quieres probar el modo Wayland puro, arráncalo con `CLAWDY_WAYLAND=1`). La transparencia necesita un compositor (lo normal en GNOME y KDE). Clawdy usa la GPU para dibujarse; si en tu equipo el fondo sale negro, arráncalo con `CLAWDY_NO_GPU=1`.

## Añadir frases

Todas las frases están en [`src/renderer/pet/quips.js`](src/renderer/pet/quips.js), agrupadas por situación (`late_night`, `welcome_back`, `trip`…). Añade las tuyas a la lista que quieras: no se repite ninguna hasta haber dicho todas las de su grupo.

## Ideas para seguir

- Más objetos y más travesuras, y que la mascota trepe por los bordes de las ventanas.
- Que te avise de cosas a una hora: recordatorios con notas o un temporizador Pomodoro.
- Skins: cambiar colores o accesorios (gorritos 🎩).

¿Tienes una idea? Abre un *issue* o un *pull request*.

## Licencia

[MIT](LICENSE)
