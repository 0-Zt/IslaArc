# Isla Arcilla

Juego de progresión y descubrimiento inspirado en la serie GROW. Guías a figuras de arcilla que transforman una isla: talan, pican, construyen, funden metal y, poco a poco, despiertan sus secretos. Desde la isla se sale a pescar, a navegar en balsa y a explorar la cueva del volcán, con puzles al estilo de Pokémon de GBA, un combate por turnos y una habilidad distinta para cada figura.

**Estado:** v0.21 · la Selva Enredada · 12 capítulos jugables (unas 4 horas y media). Se juega en el navegador: [0-zt.github.io/IslaArc](https://0-zt.github.io/IslaArc/) (cuando GitHub Pages está activado). Lo que viene está en `docs/vision.md`.

Hecho con [Three.js](https://threejs.org/) y TypeScript, pensado primero para celular.

## Cómo correrlo

```bash
npm install
npm run dev       # servidor local con recarga, accesible desde el celular en la misma red
npm run build     # genera dist/index.html, un solo archivo listo para publicar
```

El build es un único `index.html` con todo incluido (código, estilos y Three.js), así que se puede subir tal cual a GitHub Pages o a cualquier hosting estático.

Agrega `#debug` a la URL para exponer `window.__isla`, con el estado del juego y un contador de llamadas de dibujo.

## Estructura

```
src/
  main.ts            arranque, bucle del juego y guardado
  core/              utilidades: azar determinista, canvas, bus de eventos
  render/            renderer, cámara, luces, post-proceso, calidad, resolución dinámica y ciclo de día y noche
  world/             isla (generación y terreno), texturas del suelo, agua, árboles, rocas, partículas
  assets/            modelos voxel: texturas de detalle, personajes, edificios, decoración, el claro secreto, las ruinas
  game/              lógica: progreso (capítulos, estrellas, logros), tablón de encargos, estado, figuras y trabajos, edificios, bosque (zonas, tocones, retoños), marcas de plantar y senderos, expansión, ruinas de Brasa, claro de Musgo, objetivos, producción e inventos, la playa, la pesca, la balsa, la cueva (exploración por casillas, habilidades de cada figura) y el combate por turnos
  audio/             sonido generado con Web Audio (golpes, ambiente, avisos)
  ui/                interfaz: HUD (bandeja de recursos, retratos), paneles, bolsa, acertijos de las llamas, burbujas de estado, entrada táctil
  style.css          la interfaz de arcilla: un solo material para paneles, botones y avisos
  assets/fonts/      Fredoka y Nunito (licencia SIL Open Font), incluidas para que funcione sin internet
  data/              balance y contenido en JSON (recursos, edificios, herramientas, recetas, inventos, capítulos, logros, mensajes)
legacy/              prototipos anteriores (2D, taller de assets, corte vertical en un archivo)
docs/vision.md       el mapa del juego: los tres círculos, las llaves del mundo, la historia en cinco actos y el orden de trabajo
docs/plan-figuras.md repaso y plan: que cada figura cuente y que valga la pena volver (con referencias de otros juegos)
docs/roadmap.md      lo hecho versión por versión
docs/diseno-exploracion.md  exploración, inventos y combates por turnos
docs/economia.md     plan de economía: topes, mejoras, cadenas por era y ritmo
tools/               bot que juega solo para medir el ritmo, y su gráfico
```

Para equilibrar el juego (costos, tiempos, probabilidades) se editan los archivos de `src/data/`, sin tocar código.

## Rendimiento

- **Terreno fusionado:** solo se generan las caras visibles de cada columna, agrupadas en una malla por material.
- **Árboles instanciados:** todos los árboles de una misma forma se dibujan en una sola llamada, y cada uno conserva su vaivén, sacudida y caída.
- **Sombra de contacto horneada:** las esquinas del terreno junto a columnas más altas, el pie de los acantilados y la parte de abajo de copas y techos se oscurecen al construir la malla (colores por vértice, al estilo de Minecraft). No cuesta nada por cuadro; la oclusión en pantalla (N8AO) queda como opción.
- **Materiales Lambert:** los bloques son mates, así que se usa el material más liviano de Three.js en vez del físico.
- **Sombras en caché:** el mapa de sombras se redibuja cada dos cuadros, o de inmediato cuando la cámara mueve el sol. Las matas y flores no proyectan sombra.
- **Resolución:** en calidad Baja la isla se dibuja a 1,5× (la interfaz HTML queda nítida) y la resolución dinámica baja un poco más si hace falta.
- **Límite de 60 cuadros por segundo** en pantallas de 120 Hz, para que el celular no se caliente.
- **Post-proceso en una pasada:** [postprocessing](https://github.com/pmndrs/postprocessing) une bloom, efecto maqueta, viñeta y tono en un solo efecto.
- **Agua estilizada:** un solo material con franjas de color por distancia a la costa, espuma animada y un fondo de arena que se ve en lo bajo.

Medido en la misma escena y resolución de pantalla de celular: la v0.6 tardaba 3,2 unidades por cuadro y la v0.7 tarda 0,73, unas 4,4 veces menos. Con `#debug`, `__isla.benchRender(n)` mide el costo real de dibujar un cuadro.

## Controles

| Acción | Celular | PC |
| --- | --- | --- |
| Seleccionar figura | Tocarla, o su tarjeta abajo | Clic |
| Dar una orden | Tocar árbol, roca gris, arena, tierra, tocón, parcela o el claro | Clic |
| Expandir la isla | Construir → Expandir la isla, elegir una casilla de agua | Igual |
| Plantar o trazar senderos | Construir → Jardín, tocar el pasto y luego Listo | Igual |
| Llegar a las ruinas | Construir → Expandir → Puente, marcar tramos hacia el islote | Igual |
| Explorar la cueva | Cruceta o tocar el suelo; botón A; tocar una cara para cambiar quién va adelante | Flechas o WASD, espacio |
| Mover la cámara | Un dedo | Arrastrar con clic izquierdo |
| Zoom y giro | Dos dedos | Rueda y clic derecho |

La partida se guarda en el navegador (`localStorage`).
