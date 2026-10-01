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
| 2. Bucle núcleo (en curso) | Expansión (v0.5), bosque y senderos (v0.6), día y noche, obras, decoración y el secreto de Brasa (v0.8), ruta y encargos (v0.10), era 2 parte 1 (v0.11) | 45 minutos con metas claras, probado por 3 personas |
| 3. Contenido y secretos | Era 3, 3 puzzles, 2 zonas ocultas, eventos y barco fantasma | 6 horas sin atascos |
| 4. Carrera del Bosque | Minijuego de carrera en 3 carriles | Una carrera de 60 s es divertida sin premio |
| 5. Pulido y lanzamiento | Sonido, rendimiento, balance, demo pública | Lista para publicar |

## Inicio del juego (v0.4)

Arci empieza sola. Musgo está enterrado en un claro rodeado por cuatro árboles antiguos que el hacha de piedra no puede cortar. Hay que construir la casa y el horno, fundir lingotes, fabricar el hacha de metal, abrir paso en el claro y desenterrarlo con la pala.

## Expansión y avisos (v0.5)

- **Tierra:** se cava en casillas de tierra o de piedras sueltas. Arrancar un tocón da 1 de tierra.
- **Tocones:** un árbol talado deja un tocón que vuelve a crecer. Si se arranca con la pala, esa casilla queda limpia para siempre.
- **Expansión:** en Construir, "Expandir la isla" muestra las casillas de agua junto a la costa. Se eligen pradera (tierra) o playa (tierra y arena) y se marcan varias parcelas seguidas, incluso en tira hacia el mar; tocar una marcada la quita y devuelve los materiales. Al tocar Listo, la figura libre más cercana las rellena una tras otra. Cada parcela sube un poco el costo de la siguiente.
- **Burbujas de estado:** muestran el horno fundiendo o listo, la casa cuando hay una herramienta que se puede fabricar, las figuras sin trabajo (zZ) y el avance de las parcelas.

## Bosque, semillas y senderos (v0.6)

**Problema que resuelve.** Antes el jugador no sabía dónde crecerían los árboles, y cada tocón volvía a crecer en el mismo lugar. Eso chocaba con dejar zonas limpias para construir o cultivar.

- **Zonas de bosque.** Los bosques densos de la isla tienen un borde verde punteado en el suelo. Solo ahí los tocones vuelven a brotar y los árboles se esparcen despacio a casillas libres vecinas, hasta llenar cerca del 60 % de la zona.
- **Fuera del bosque nada crece solo.** Un tocón queda como tocón hasta que una figura lo arranca con la pala. Los edificios no se pueden poner encima de tocones, retoños ni marcas.
- **Semillas.** Al caer, un árbol puede soltar una semilla; los grandes sueltan más seguido. En Construir → Jardín → Plantar se elige la especie (roble, pino o abedul) y se tocan las casillas de pasto. Cada marca gasta una semilla, y tocarla otra vez la devuelve.
- **Crecimiento.** Retoño pequeño → retoño grande → árbol pequeño → mediano → grande, con un temporizador por etapa (alrededor de 3 minutos en total). Si una figura arranca un retoño, se recupera la semilla.
- **Senderos.** En Construir → Jardín → Senderos se tocan casillas de pasto y una figura las cava con la pala. En los senderos no crecen árboles y las figuras caminan un 35 % más rápido.
- **Trabajo en cadena.** Al terminar una marca, la figura sigue con la más cercana del mismo tipo. Al tocar "Listo", la figura libre más cercana empieza sola.

## Día y noche, obras y decoración (v0.8)

- **Ciclo de día y noche:** un día dura unos 9 minutos (mañana, mediodía, atardecer, noche y amanecer). El sol cruza el cielo y las sombras giran con él. Un botón con sol o luna, bajo Menú, dice cuánto falta para la noche. Se puede apagar en Ajustes.
- **Obras con tiempo:** casa, horno y decoración se pagan, se ubican y quedan como obra con andamio. La figura libre más cercana la levanta a martillazos. Un edificio sin terminar no funciona.
- **Decoración:** farol (se enciende al atardecer y deja un círculo de luz), cerco, banca y macetero. Después de colocar uno sigue el modo de ubicar mientras alcancen los materiales.

## El islote de las ruinas y Brasa (v0.8)

- El islote está mar adentro, arriba a la derecha. Para llegar se tiende un **puente** de madera (3 de madera por tramo, precio fijo) o se expande con tierra.
- En la plataforma hay cinco braseros en ruinas. Cada uno se **reconstruye** (materiales + obra con martillo) y después se **enciende** resolviendo su acertijo:
  1. **Runas:** repetir la canción de las runas, en tres rondas cada vez más largas.
  2. **Cauce:** girar piedras de canal hasta que la lava llegue al brasero.
  3. **Losas:** cada losa cambia a sus vecinas; hay que encender las nueve.
  4. **Obeliscos:** acertijo grabado («lo que da el árbol, lo que trae el mar, lo que guarda la montaña»).
  5. **Luna:** guiar la luz de la luna con espejos. Solo de noche y con las otras cuatro encendidas.
- Cada llama encendida hace correr lava por su canal hacia la estatua. Con las cinco, se levantan seis muros tallados en hexágono, se iluminan las runas, la estatua pasa de piedra a arcilla ardiente y **Brasa** se une al equipo.
- Estilo tomado de las imágenes de referencia: losas gastadas con musgo, braseros en forma de cáliz con almenas, arco en ruinas, rocas en el agua. Brasa es de arcilla oscura, con grietas de brasa, una llama en la cabeza y ojos amarillos.

## Pase visual (v0.9)

Siguiendo las láminas de referencia (árboles, bloques, adornos):
- **Copas de árbol en vóxeles densos:** cada copa se arma con miles de cubitos (1/13 de casilla) en bultos redondeados, con tonos claros arriba, oscuros abajo y salpicados, algunos cubitos que faltan o sobresalen, y sombra de contacto por esquina. Los pinos son pisos escalonados; los árboles antiguos del claro usan el mismo estilo en verde oscuro.
- **Pasto que cae por los bordes** de los bloques en goteras irregulares, y tierra más cálida.
- **Adornos nuevos:** arbustos redondos (algunos con flores) en pasto con matas y en bordes de bosque, rocas con musgo en suelo pedregoso, pasto más alto.
- **Costo:** un 14 % más por cuadro que la v0.8, todavía unas 4 veces más liviano que la v0.6.

## Ruta, encargos y logros (v0.10)

- **Isla más grande** en partidas nuevas (radio 13,4 en vez de 10,6, unas 540 casillas, 7 rocas). Las partidas guardadas conservan su isla clásica.
- **Diario de la isla** (botón con un libro bajo Menú), con tres pestañas:
  - **Ruta:** capítulos con sus metas. 1 · Barro, 2 · El claro y 3 · Las ruinas se pueden jugar; 4 · Fuego, 5 · Mar adentro y 6 · El origen se ven bloqueados con un adelanto. Cada capítulo da estrellas al cerrarse.
  - **Encargos:** con el **tablón** (nuevo edificio) llegan 3 pedidos a la vez: entregas de materiales o tareas (talar, picar, plantar, adornar, ganar parcelas, pasar una noche). Pagan estrellas y un regalo. Cada pedido se puede cambiar una vez cada 90 segundos.
  - **Logros:** 11 logros con bronce, plata y oro (talador, cantero, jardinero, arquitecto, noctámbulo…). Cada grado da estrellas.
- **Nivel de isla:** las estrellas suben el nivel. Cada nivel desbloquea algo: farol (2), banca y un pedido más (3), trabajo 10 % más rápido (4), macetero (5)…

## Fuego, parte 1 (v0.11)

- **Capítulo 4 · Fuego jugable** (9 metas): aserradero, 10 tablas, 6 ladrillos, 4 de vidrio, que Brasa avive el horno, taller, 3 inventos, 2 botellas y la linterna, que prepara la entrada a la cueva.
- **Producción en cola:** horno (lingote, ladrillo, vidrio) y aserradero (tablas). Se tocan y se encargan hasta 6 cosas; salen una tras otra con su burbuja de avance.
- **Taller de inventos, primera era:** carretilla (caminar +25 %), pala de metal (mitad de paladas), martillo de metal (obras al doble), fuelle (horno +50 %), sierra dentada (aserradero al doble), catalejo (el mar trae cosas más seguido) y linterna (luz de noche). Algunos piden otro antes. Pico de obsidiana, balsa y engranaje se ven bloqueados como adelanto.
- **Habilidades por figura:** Arci construye un 50 % más rápido; Musgo planta retoños ya crecidos y saca el doble de semillas; Brasa a veces funde un lingote al picar roca, aviva el horno (todo sale al doble) y da luz de noche.
- **La playa:** cada tanto el mar deja una caja (materiales) o una botella. Una figura la recoge. Las botellas traen 12 mensajes de los Alfareros que se guardan en el Diario.
- **Diario → Equipo:** figuras con su habilidad (las que faltan, con una pista), inventos hechos y mensajes leídos.
- **Sonido** generado en el momento (sin archivos): golpes de hacha, pico y pala, martillo, caída de árboles, monedas, subir de nivel, acertijos, fuego y ambiente de olas, pájaros de día y grillos de noche. Se apaga en Menú.

## Ruta más simple (v0.11.1)

- La pestaña Ruta ya no es una lista larga: arriba, una fila de bloques por capítulo (hecho, actual con su barra, bloqueado); al tocar uno se ve solo ese capítulo.
- Cada capítulo se divide en **etapas con nombre** de hasta 3 metas (por ejemplo, Barro: Un techo · Piedra y arena · Fuego y metal). Se muestran como bloques con casillas, y abajo solo las metas de la etapa elegida: la actual destacada como "Ahora" y las siguientes en gris.
- Cada etapa completa da +1 ★ (la última da la recompensa del capítulo).
- La barra de objetivo muestra el capítulo y las casillas de la etapa; al tocarla se abre la Ruta.

## Pulido (v0.11.2)

- **Las figuras siguen solas:** cada figura recuerda lo que estaba juntando (madera, piedra, arena o tierra). Después de una tarea suelta (construir, rellenar una parcela, plantar, recoger algo de la playa) vuelve sola a eso. Al talar busca el árbol siguiente hasta 10 casillas alrededor y avisa cuando no quedan.
- **Flecha de objetivo:** una flecha amarilla rebota sobre lo que hay que tocar para la meta actual. Si hay que elegir una figura, primero apunta a la figura y después al árbol, roca, edificio, ruina o botella. Se esconde mientras la isla ya está haciendo el trabajo y cuando hay un panel abierto.
- **Barra de recursos en dos líneas fijas:** materiales de la isla junto a Menú, y materiales refinados (lingote, tablas, ladrillo, vidrio) junto al diario y el reloj. Más de 999 se abrevia (1,2k).
- **Celebraciones:** al cerrar una etapa o un capítulo, un cartel grande con el premio, sonido, confeti de arcilla y las figuras saltan con los brazos arriba.
- **Encargos en tarjetas:** ícono grande, barra o materiales con lo que tienes, premio, y el botón para cobrar solo aparece cuando se puede. Cambiar un encargo es un botón redondo pequeño.
- **Logros en grilla de medallas:** dos columnas con ícono, barra y tres puntos (bronce, plata, oro).
- **Prueba de ritmo automática:** un bot jugó los capítulos 1 a 4 como un jugador atento (acertijos de 45 s cada uno). Tardó unos 21 minutos de juego: Barro 4, El claro 1,5, Las ruinas 10 (incluye esperar la noche para la llama 5) y Fuego 5,5. Una persona real debería tardar entre el doble y el triple.
- **Hallazgo:** la madera se acumula (más de mil al final) porque nada la gasta en grande. Hace falta un sumidero de materiales: mejoras de edificios, provisiones para las expediciones o encargos más grandes.
- **Arreglos:** el despertar de Brasa usa tiempo de juego (antes un temporizador real) y se retoma si la partida se guardó justo en ese momento; el primer cuadro ya no puede dar un paso de tiempo negativo.

Ver también **docs/diseno-exploracion.md**: la visión de exploración, inventos y combates por turnos.

## Pendiente

- **Linde del bosque:** postes fabricables para agrandar o achicar una zona de bosque.
- **Volver a pasto:** semillas de pasto para deshacer un sendero.
- **Sumidero de materiales:** mejorar edificios (casa, horno, aserradero) con niveles, y provisiones para las expediciones.
- **v0.12 · Prototipo de exploración:** entrada a la cueva, vista tipo GBA, un nivel, una criatura y el primer combate por turnos.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, sombra de contacto horneada, materiales Lambert, sombras en caché, 1,5× en calidad Baja, límite de 60 fps y resolución dinámica. N8AO queda opcional.
- Agua: estilizada, sin reflejos reales; franjas por distancia a la costa, espuma y fondo de arena.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
