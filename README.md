# Isla Arcilla

Juego de progresión y descubrimiento inspirado en la serie GROW. Guías a figuras de arcilla que transforman una isla: talan, pican, construyen, funden metal y, poco a poco, despiertan sus secretos.

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
  render/            renderer, cámara, luces, post-proceso, calidad y resolución dinámica
  world/             isla (generación y terreno), texturas del suelo, árboles, rocas, partículas
  assets/            modelos voxel: texturas de detalle, personajes, edificios, el claro secreto
  game/              lógica: estado, figuras y trabajos, edificios, bosque y tocones, expansión, claro de Musgo, objetivos
  ui/                interfaz: HUD, paneles, burbujas de estado, entrada táctil
  data/              balance y contenido en JSON (recursos, edificios, herramientas, recetas, objetivos)
legacy/              prototipos anteriores (2D, taller de assets, corte vertical en un archivo)
docs/roadmap.md      visión, eras y fases
```

Para equilibrar el juego (costos, tiempos, probabilidades) se editan los archivos de `src/data/`, sin tocar código.

## Rendimiento

- **Terreno fusionado:** solo se generan las caras visibles de cada columna, agrupadas en una malla por material.
- **Árboles instanciados:** todos los árboles de una misma forma se dibujan en una sola llamada, y cada uno conserva su vaivén, sacudida y caída.
- **Post-proceso en una pasada:** [postprocessing](https://github.com/pmndrs/postprocessing) une bloom, efecto maqueta, viñeta y tono en un solo efecto; la oclusión ambiental es [N8AO](https://github.com/N8python/n8ao).
- **Resolución dinámica:** si el celular no alcanza unos 45 cuadros por segundo, baja un poco la resolución interna antes de tocar los efectos.

Resultado medido: de unas 3.800 llamadas de dibujo por cuadro en el corte vertical anterior a unas 220.

## Controles

| Acción | Celular | PC |
| --- | --- | --- |
| Seleccionar figura | Tocarla, o su tarjeta abajo | Clic |
| Dar una orden | Tocar árbol, roca gris, arena, tierra, tocón, parcela o el claro | Clic |
| Expandir la isla | Construir → Expandir la isla, elegir una casilla de agua | Igual |
| Mover la cámara | Un dedo | Arrastrar con clic izquierdo |
| Zoom y giro | Dos dedos | Rueda y clic derecho |

La partida se guarda en el navegador (`localStorage`).
