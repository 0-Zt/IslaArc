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

## Economía, parte 1 (v0.12)

- **Almacén y topes:** sin almacén caben 40 de cada material de la isla y 15 de cada refinado. El almacén (capítulo 2) sube a 100/30 y su nivel 2 a 250/60; el nivel 3 queda bloqueado hasta tener cobre de la cueva. La casa nivel 2 suma +20/+5.
- **Almacén lleno:** la figura que junta ese material se detiene con la burbuja "Lleno" y sigue sola cuando hay espacio. Cerca del tope, la ficha muestra el límite (38/40) y se pone ámbar al llenarse.
- **Mejoras de edificios:** casa, horno, aserradero y almacén suben a nivel 2 desde su panel. Se pagan, vuelve el andamio y una figura las levanta a martillazos; mientras tanto el edificio no trabaja. Un banderín en el techo marca el nivel.
  - Horno 2: dos fuegos, hace dos cosas a la vez.
  - Aserradero 2: 3 tablas con 4 de madera.
  - Casa 2: +20 de espacio y +5 para refinados.
- **Carbón** (3 de madera en el horno): para mejorar el horno, la linterna y el **lingote doble** (3 de mineral y 1 de carbón dan 2 lingotes).
- **Parcelas:** cada una cuesta un 15 % más que la anterior (el puente sigue a precio fijo).
- **Costos nuevos** en todo (casa 20 de madera, horno 15/12/8, aserradero 30/15/3, taller 16 tablas, 14 ladrillos, 5 lingotes y 20 piedra, braseros, herramientas e inventos). Los ladrillos ahora llevan arena.
- **Capítulos más largos:** el 2 suma "Construye el almacén"; el 4 pasa a 12 metas en 4 etapas (Refinar, Fuego vivo, Mejoras, Inventos) con carbón y las mejoras del horno y del almacén.
- **Esperar a la noche:** el acertijo de la luna tiene un botón que adelanta el reloj hasta que cae la noche (antes se podían perder hasta 7 minutos esperando).
- **Bot de ritmo con gráfico:** registra cada material, su tope y el tiempo de las figuras cada 30 segundos. Resultado: 29 minutos para los capítulos 1 a 4 (Barro 6, Claro 2,5, Ruinas 10,5, Fuego 10,5), sin acumulación sin fin (la madera termina en 117 en vez de 1.700) y casi sin tiempo de figuras esperando espacio.

## El muelle: pesca y la historia de Marea (v0.13)

Mecánicas tomadas de Animal Crossing y Stardew Valley, en el formato de la isla:
- **Muelle** (después del aserradero): se ubica en la orilla y se gira solo mirando al mar. Al construirlo aparecen postes viejos bajo el agua: alguien pescó aquí antes.
- **Sombras en el agua** (Animal Crossing): pequeñas, medianas y grandes. El tamaño dice qué puede ser. Junto al muelle aparece la burbuja "Algo se mueve".
- **Pescar:** al tocar el muelle, una figura sale a la punta con la caña y la cámara mira al mar. Se toca el agua frente a una sombra para lanzar; si cae encima, se asusta. La sombra se acerca, **pica varias veces** (si tocas antes, se va) y luego **se hunde el corcho con un "!"**: ahí hay que tocar.
- **Sombras grandes tiran** (Stardew Valley simplificado): una barra con una zona verde que sube mientras mantienes apretado; hay que seguir el objeto hasta llenar la barra.
- **No hay peces:** el mar devuelve cosas. En la orilla salen algas, conchas, madera a la deriva, cantos, botellas con mensaje, trozos de vasija, una bota de arcilla (y más tarde la otra) y, de noche, estrellas de arcilla. En aguas medias: engranajes, caracolas, perlas (de noche) y anclas.
- **Anzuelo de metal** (en la casa): sin él, las sombras medianas y grandes se escapan.
- **Carnada:** tirar semillas al agua atrae una sombra, más seguido una grande. Por fin las semillas que sobran tienen destino.
- **Tarjeta de captura** con ícono grande, descripción y "Nuevo en la colección".
- **Colección del mar** (Diario → Mar): siluetas de todo lo que se puede sacar, con pistas de tamaño y hora. Llenar la fila de la orilla da +3 ★ y la de aguas medias +5 ★. Las aguas profundas se ven bloqueadas hasta tener la balsa.
- **Capítulo 5 · El muelle** (9 metas, 3 etapas: Primer lance, La vasija, Marea).
- **Mini historia de Marea:** cuatro trozos de vasija muestran a una figura azul que pescaba desde una balsa. Al juntarlos, la primera sombra mediana trae la **Llave de la ola**; después brilla un **cofre** bajo el agua y adentro está el **cuaderno de Marea** con el plano de la balsa. Marea aparece como pista en el Diario → Equipo.
- **Logro** "Pescador de cosas" y sonidos propios (lanzar, corcho, picada, tirón, captura, se corta).
- **Ritmo (bot):** el capítulo 5 toma unos 8–9 minutos al bot; una persona, unos 20. Los pasos de la historia no dependen de la suerte: un trozo de vasija sale a más tardar cada 5 capturas pequeñas, y la llave es la primera mediana después de la vasija.
- **Hallazgo para la v0.14:** durante el capítulo 5 la madera, la piedra y la arena llegan al tope porque casi no se gastan. La balsa y sus mejoras deberían ser ese gasto.

## Mar adentro: la balsa (v0.14)

- **La balsa de Marea** es el nivel 2 del muelle: se arma con el plano del cuaderno (30 tablas, 20 algas, 40 madera) y queda amarrada en la punta. Con el plano, tocar el muelle abre su panel: pescar, zarpar, ver la colección y armar la balsa.
- **Navegar:** una figura sube a la balsa con un remo. Se toca el mar y la balsa busca sola el camino por el agua, rodeando la isla, el puente y el islote. La cámara la sigue. "Volver" la trae al muelle.
- **Agua oscura:** tres manchas profundas mar adentro (La fosa del oeste, El bajo de los cofres, La grieta del este), con burbujas que suben. Al entrar, la barra lo avisa.
- **Pescar desde la balsa** en cualquier dirección. En el agua oscura las sombras son más grandes y oscuras, y salen cosas que no hay en la orilla: **veta de cobre**, medusa de vidrio, cofre hundido, cristal de mar (de noche), la brújula y el timón de Marea. La fila de agua oscura de la Colección da +8 ★.
- **Cobre** (nuevo material): abre el **almacén nivel 3** (600/150).
- **Las olas grandes:** un muro de olas en el noroeste que la balsa no puede cruzar. Detrás se ve otra isla con un faro. Tocar más allá lleva la balsa hasta el borde y las olas la devuelven.
- **Capítulo 6 · Mar adentro** (9 metas, 3 etapas: La balsa, Agua oscura, La voz de las olas). La historia sigue: la brújula de Marea apunta a las olas, y el timón trae su última hoja: «Encontré la caracola grande y crucé… Te espero en la isla del faro». Es la pista para el capítulo 7.
- **Arreglo:** ya no se puede ubicar un edificio donde ninguna figura llega (antes podía quedar como obra para siempre).
- **Ritmo (bot):** capítulo 6 en unos 13 minutos; capítulos 1 a 6 en unos 51 minutos de bot (una persona, unas 2 horas).

Ver también **docs/diseno-exploracion.md** (exploración, inventos y combates por turnos) y **docs/economia.md** (plan de economía: topes, mejoras, cadenas por era, sumideros y ritmo objetivo).

## Pendiente

- **Linde del bosque:** postes fabricables para agrandar o achicar una zona de bosque.
- **Volver a pasto:** semillas de pasto para deshacer un sendero.
- **Siguiente:** la cueva con el primer combate por turnos (v0.15), y después la caracola grande que calma las olas y la isla del faro.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, sombra de contacto horneada, materiales Lambert, sombras en caché, 1,5× en calidad Baja, límite de 60 fps y resolución dinámica. N8AO queda opcional.
- Agua: estilizada, sin reflejos reales; franjas por distancia a la costa, espuma y fondo de arena.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
