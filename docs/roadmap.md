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
| 2. Bucle núcleo (en curso) | Expansión de tierra (v0.5), bosque, semillas y senderos (v0.6), decoración y obras con tiempo, eras 1 y 2 completas | 45 minutos con metas claras, probado por 3 personas |
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

## Bosque, semillas y senderos (v0.6)

**Problema que resuelve.** Antes el jugador no sabía dónde crecerían los árboles, y cada tocón volvía a crecer en el mismo lugar. Eso chocaba con dejar zonas limpias para construir o cultivar.

- **Zonas de bosque.** Los bosques densos de la isla tienen un borde verde punteado en el suelo. Solo ahí los tocones vuelven a brotar y los árboles se esparcen despacio a casillas libres vecinas, hasta llenar cerca del 60 % de la zona.
- **Fuera del bosque nada crece solo.** Un tocón queda como tocón hasta que una figura lo arranca con la pala. Los edificios no se pueden poner encima de tocones, retoños ni marcas.
- **Semillas.** Al caer, un árbol puede soltar una semilla; los grandes sueltan más seguido. En Construir → Jardín → Plantar se elige la especie (roble, pino o abedul) y se tocan las casillas de pasto. Cada marca gasta una semilla, y tocarla otra vez la devuelve.
- **Crecimiento.** Retoño pequeño → retoño grande → árbol pequeño → mediano → grande, con un temporizador por etapa (alrededor de 3 minutos en total). Si una figura arranca un retoño, se recupera la semilla.
- **Senderos.** En Construir → Jardín → Senderos se tocan casillas de pasto y una figura las cava con la pala. En los senderos no crecen árboles y las figuras caminan un 35 % más rápido.
- **Trabajo en cadena.** Al terminar una marca, la figura sigue con la más cercana del mismo tipo. Al tocar "Listo", la figura libre más cercana empieza sola.

## Pendiente: decoración y construcción con tiempo

- **Decoración.** Faroles, cercos, bancas, macetas y bordes de piedra solo decoran. Se fabrican en la casa o el taller con materiales y tiempo de fabricación, y se colocan con la guía amarilla. Los faroles se encienden de noche.
- **Construcción con tiempo.** Todo lo construido pasa por la misma cola: materiales, luego una obra y un tiempo de trabajo con una figura asignada. Dos figuras lo hacen más rápido.
- **Linde del bosque.** Postes fabricables para agrandar o achicar una zona de bosque.
- **Volver a pasto.** Semillas de pasto para deshacer un sendero.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, sombra de contacto horneada, materiales Lambert, sombras en caché, 1,5× en calidad Baja, límite de 60 fps y resolución dinámica. N8AO queda opcional.
- Agua: estilizada, sin reflejos reales; franjas por distancia a la costa, espuma y fondo de arena.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
