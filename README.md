# Isla Arcilla

Juego de progresión y descubrimiento inspirado en la serie GROW. Guías a figuras de arcilla que transforman una isla: talan, pican, construyen, funden metal y, poco a poco, despiertan sus secretos.

Hecho con [Three.js](https://threejs.org/) en el navegador, pensado primero para celular.

## Qué hay en este repositorio

| Archivo | Qué es |
| --- | --- |
| `index.html` | Corte vertical 3D jugable (unos 5 minutos): órdenes a las figuras, recolección, construcción con guía amarilla, horno, taller y 8 objetivos. |
| `taller.html` | Taller de assets: personajes, suelos, árboles, iluminación por hora del día y efectos. Sirve para revisar y ajustar el arte. |
| `prototipo-2d.html` | Primer prototipo en pixel art 2D, con el volcán, la marea, las runas y Brasa. Se conserva como referencia de reglas. |
| `docs/roadmap.md` | Resumen de la visión, las eras y las fases de desarrollo. |

Todo el arte se genera por código: modelos voxel con bloques y texturas pixel de 16×16 dibujadas en canvas. No hay archivos de imagen ni modelos externos.

## Cómo jugarlo

Cada página funciona sola. Three.js se carga desde jsDelivr, así que necesita internet.

- **En línea:** activa GitHub Pages (Settings → Pages → rama `main`, carpeta raíz) y abre la URL que te entrega.
- **En tu computador:** sirve la carpeta con cualquier servidor estático, por ejemplo `npx serve .` o `python3 -m http.server`, y abre `http://localhost:8000`. Abrir el archivo con doble clic puede fallar porque los navegadores bloquean los módulos desde `file://`.

### Controles

| Acción | Celular | PC |
| --- | --- | --- |
| Seleccionar figura | Tocarla, o su tarjeta abajo | Clic |
| Dar una orden | Tocar árbol, roca gris o arena | Clic |
| Mover la cámara | Un dedo | Arrastrar con clic izquierdo |
| Zoom y giro | Dos dedos | Rueda y clic derecho |

La partida se guarda en el navegador (`localStorage`).

## Próximo paso técnico

Migrar a TypeScript + Vite, separando el código en módulos (mundo, figuras, edificios, interfaz) y moviendo recursos, recetas, edificios y objetivos a archivos JSON. Ver `docs/roadmap.md`.
