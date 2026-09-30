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
| 2. Bucle núcleo (en curso) | Expansión de tierra (hecho en v0.5), semillas y zona de bosque, caminos, decoración, eras 1 y 2 completas | 45 minutos con metas claras, probado por 3 personas |
| 3. Contenido y secretos | Era 3, 3 puzzles, 2 zonas ocultas, eventos y barco fantasma | 6 horas sin atascos |
| 4. Carrera del Bosque | Minijuego de carrera en 3 carriles | Una carrera de 60 s es divertida sin premio |
| 5. Pulido y lanzamiento | Sonido, rendimiento, balance, demo pública | Lista para publicar |

## Inicio del juego (v0.4)

Arci empieza sola. Musgo está enterrado en un claro rodeado por cuatro árboles antiguos que el hacha de piedra no puede cortar. Hay que construir la casa y el horno, fundir lingotes, fabricar el hacha de metal, abrir paso en el claro y desenterrarlo con la pala.

## Expansión y avisos (v0.5)

- **Tierra:** se cava en casillas de tierra o de piedras sueltas. Arrancar un tocón da 1 de tierra.
- **Tocones:** un árbol talado deja un tocón que vuelve a crecer. Si se arranca con la pala, esa casilla queda limpia para siempre.
- **Expansión:** en Construir, "Expandir la isla" marca casillas de agua junto a la costa. Una parcela de pradera cuesta tierra; una de playa, tierra y arena. Después una figura la rellena a paladas. Cada expansión sube un poco el costo de la siguiente.
- **Burbujas de estado:** muestran el horno fundiendo o listo, la casa cuando hay una herramienta que se puede fabricar, las figuras sin trabajo (zZ) y el avance de las parcelas.

## Diseño pendiente: bosque, caminos y decoración

**Problema.** Hoy el jugador no sabe dónde crecerán los árboles, y un tocón vuelve a crecer en el mismo lugar. Eso choca con querer dejar zonas limpias para construir o cultivar.

**Propuesta: semillas y zona de bosque.**

1. **Nada crece solo fuera del bosque.** Talar fuera de la zona de bosque deja un tocón que no rebrota. Se arranca con la pala y la casilla queda libre.
2. **Zona de bosque.** Es un área marcada (al inicio, el bosque del noroeste). Dentro, los árboles se regeneran y se propagan despacio a casillas libres vecinas. El jugador puede ampliarla o reducirla con postes de linde, que se fabrican.
3. **Semillas.** Cada árbol talado puede soltar una semilla de su especie (pino, roble o abedul). El jugador la planta donde quiera, dentro o fuera del bosque. Brota como retoño y pasa por tres tamaños con un temporizador. El retoño no se tala; el árbol grande da más madera.
4. **Previsibilidad.** Los retoños y la zona de bosque se ven siempre, con un borde suave en el suelo. Así el jugador sabe dónde saldrán árboles.

**Caminos.** Con la pala, una figura convierte pasto en sendero de tierra, casilla por casilla. Los senderos no dejan crecer árboles, las figuras caminan un poco más rápido sobre ellos y se pueden devolver a pasto con semillas de pasto.

**Decoración.** Faroles, cercos, bancas, macetas y bordes de piedra solo decoran. Se fabrican en la casa o el taller con materiales y tiempo de fabricación, y se colocan con la misma guía amarilla de construcción. Los faroles se encienden de noche. Más adelante, algunos adornos podrán dar una bonificación leve de ánimo o de velocidad cerca.

**Construcción con tiempo.** Todo lo construido pasa por la misma cola: materiales, luego una obra en construcción y un tiempo de trabajo con una figura asignada. Los edificios grandes necesitan más paladas o martillazos, y dos figuras lo hacen más rápido.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, postprocessing + N8AO y resolución dinámica.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
