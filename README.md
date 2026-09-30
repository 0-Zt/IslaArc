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
  game/              lógica: estado, figuras y trabajos, edificios, bosque (zonas, tocones, retoños), marcas de plantar y senderos, expansión, claro de Musgo, objetivos
  ui/                interfaz: HUD, paneles, burbujas de estado, entrada táctil
  data/              balance y contenido en JSON (recursos, edificios, herramientas, recetas, objetivos)
legacy/              prototipos anteriores (2D, taller de assets, corte vertical en un archivo)
docs/roadmap.md      visión, eras y fases
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
| Mover la cámara | Un dedo | Arrastrar con clic izquierdo |
| Zoom y giro | Dos dedos | Rueda y clic derecho |

La partida se guarda en el navegador (`localStorage`).
