# Roadmap de Isla Arcilla

## Visión

Juego de progresión y descubrimiento: guías a figuras de barro que transforman una isla, y cada avance revela un secreto nuevo. No se controla a un héroe; se dirige a un equipo.

### Pilares

1. **Cada acción cambia la isla a la vista.**
2. **Descubrir vale más que optimizar.** Recetas, pistas del mar, eventos nocturnos.
3. **Un equipo con personalidad.** Cada figura tiene una habilidad única.
4. **Sesiones cortas, progreso largo.** Partidas de 10 a 20 minutos; la 1.0 dura de 6 a 8 horas.
5. **Un diorama vivo.** Día y noche, marea, viento, visitantes.

## Versión 1.0

Una sola isla, completa y profunda, con las eras 1 a 3.

## Bucle de juego

Asignar figuras → producir → procesar (horno, cráter) → construir y expandir → descubrir (pistas, eventos) → vuelta a empezar con opciones nuevas.

## Eras de la isla

| Era | Proyecto que la abre | Desbloquea | Secreto |
| --- | --- | --- | --- |
| 1. Barro | Inicio | Casa, recolección, herramientas de piedra | Botella con mensaje y runas: aparece Brasa |
| 2. Fuego | Reavivar el horno antiguo | Horno, lingotes, ladrillos, vidrio, herramientas de metal | Cueva del volcán |
| 3. Taller | Yunque y banco de trabajo | Herramientas especiales, expansiones grandes, muelle | Barco fantasma y altar: aparece Espectro |
| 4. Mecanismos | Reparar el molino | Molino, noria, canaletas | Puzzle de engranajes |
| 5. Faro | Encender el faro | Final y ruta a la siguiente isla | Final secreto con luna llena |

## Fases

| Fase | Contenido | Criterio de salida |
| --- | --- | --- |
| 0. Prototipos (hecho) | Prototipo 2D, taller 3D | El estilo 3D convence |
| 1. Fundación técnica (hecho) | Corte vertical 3D, migración a TypeScript + Vite, datos en JSON, optimización de rendimiento | Asignar figuras y construir se siente bien |
| 2. Bucle núcleo | Expansión de tierra, eras 1 y 2 completas | 45 minutos con metas claras, probado por 3 personas |
| 3. Contenido y secretos | Era 3, 3 puzzles, 2 zonas ocultas, eventos y barco fantasma | 6 horas sin atascos |
| 4. Carrera del Bosque | Minijuego de carrera en 3 carriles | Una carrera de 60 s es divertida sin premio |
| 5. Pulido y lanzamiento | Sonido, rendimiento, balance, demo pública | Lista para publicar |

## Inicio del juego (v0.4)

Arci empieza sola. Musgo está enterrado en un claro rodeado por cuatro árboles antiguos que el hacha de piedra no puede cortar. Hay que construir la casa y el horno, fundir lingotes, fabricar el hacha de metal, abrir paso en el claro y desenterrarlo con la pala.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, postprocessing + N8AO y resolución dinámica.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
