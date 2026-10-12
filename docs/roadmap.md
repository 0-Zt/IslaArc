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

## La cueva del volcán (v0.15)

- **La grieta:** al norte de la isla hay un cono pequeño de roca volcánica con una grieta que brilla y humea. Desde el capítulo 7, una figura con el **pico de metal** la abre en 12 golpes; queda una boca oscura con luz naranja adentro. Para entrar hace falta la **linterna**.
- **Modo cueva, estilo Pokémon de GBA:** cámara alta y cercana desde el sur, luz propia (oscuro, cálido, con luces de faroles, braseros, cristales y lava). El equipo baja en fila (Arci adelante, Musgo y Brasa detrás) y se mueve casilla a casilla con la **cruceta** (se puede mantener apretada) o **tocando el suelo**. El **botón A** usa lo que está al frente y dice qué haría: empujar, encender, girar, romper, picar, abrir, leer, tomar o mirar. Tocar un objeto lleva al equipo al lado y lo usa. También hay teclado (flechas/WASD y espacio).
- **Piso 1 · La boca del volcán:** escombros que se rompen con el pico, una roca que se empuja a un pozo para pasar, dos braseros que encender y una puerta de runas que se hunde en el suelo.
- **Piso 2 · El salón de las guardianas:** cuatro estatuas de arcilla que giran con A y tienen que mirar al altar. Algunas están **unidas de la mano** con la del frente y giran juntas. Una está detrás de una **reja** que se abre con una **placa de presión**: hay que empujar una roca encima (si la pisa una figura, la reja baja apenas se aleja). Con las cuatro mirando, el orbe del altar se enciende y la puerta se abre.
- **Piso 3 · El río de lava:** las rocas que caen a la lava la enfrían y forman camino. Hay que cruzar dos ríos (uno de dos filas). Al fondo, la **caracola grande** sobre un pedestal y un **gólem dormido** que abre un ojo cuando la tomas.
- **Detalle:** paredes en columnas irregulares (bajas delante para no tapar el suelo, altas detrás), musgo, guijarros, grietas, hongos que brillan, estalagmitas, cristales en las paredes, chispas que suben de la lava, rocas que ruedan y caen con polvo y vapor, estatuas con ojos que se encienden, sonido de gotas con eco y retumbos.
- **Botín y lore:** un cofre por piso (lingotes, vidrio, cuarzo, tablas, cobre y estrellas), cristales de **cuarzo** (material nuevo), vetas de cobre, tres tablillas de los Alfareros y un grabado de Marea. Logro nuevo **Espeleólogo**.
- **Lo resuelto se guarda** (rocas, braseros, estatuas, puertas, cofres). "Reiniciar sala" devuelve las rocas si quedan trabadas, y "Salir" vuelve a la isla desde cualquier piso.
- **Capítulo 7 · La cueva del volcán** (9 metas, 3 etapas: La boca, Las salas, La caracola; premio +15 ★). El timón de Marea ahora dice que devolvió la caracola a la montaña y que busques la grieta que humea. El capítulo 8, **La isla del faro**, queda anunciado.
- **Ritmo:** el recorrido mínimo es de 84 pasos más las acciones (resuelto por un buscador automático y por un recorrido de prueba completo); para una persona son unos 10 a 15 minutos.

## El guardián (v0.16)

- **La cueva con vida (estilo Core Keeper):** oscuridad que solo se abre alrededor de la linterna, los braseros, la lava y los cristales; murciélagos que duermen en las paredes y salen volando cuando pasas (o cuando cae una roca); escarabajos que brillan y arrancan del equipo; gotas que caen del techo en charcos; polvo flotando en la luz; burbujas en la lava. Sonidos nuevos: pasos, aleteos y chillidos, gotas con eco, viento de cueva (reemplaza al mar) y lava que burbujea.
- **Paredes huecas y reliquias:** en cada piso hay una pared agrietada que se rompe con el pico y esconde un nicho con una reliquia de los Alfareros (figurita sin cocer, molde de manos, sello del horno), +2 ★ y un texto. La pestaña del Diario ahora se llama **Hallazgos** y suma las reliquias.
- **Capítulo 8 · El guardián** (6 metas, 3 etapas: La voz débil, El guardián, El paso; premio +15 ★):
  1. Navegar hasta las olas grandes y **soplar la caracola**: las olas se agachan un momento y vuelven. En la cueva, el gólem despierta.
  2. Volver al río de lava y **calmar al gólem** en el primer **combate por turnos**.
  3. **Afinar la caracola** en el taller con 6 de cuarzo (el cuarzo por fin tiene uso).
  4. Soplarla otra vez: **las olas se abren** en un paso de agua tranquila, y se puede navegar hasta ver la isla del faro.
- **Combate:** la barra del gólem es de **calor** y hay que bajarla a cero (no se rompe, se calma). Arci: golpe de pico y cubrir. Musgo: musgo húmedo (enfría más cuando el gólem está al rojo) y brotes (cura y levanta). Brasa: absorber calor y avivar (el siguiente ataque pega ×1,6). El gólem **anuncia lo que hará** un turno antes; a mitad de la pelea se pone al rojo y puede recalentarse una vez. Perder no cuesta nada: el equipo vuelve a la escalera.
- El gólem calmado aparece en el Equipo como guardián de la montaña.

## Cada figura cuenta (v0.17)

- **Elegir quién va adelante:** en la cueva aparecen las caras del equipo a la derecha. La de adelante es la que actúa; si no puede pasar por algo, las demás esperan hasta que vuelva (como en Lost Vikings o Pikmin). Si el botón A necesita a otra figura, dice su nombre ("Musgo ▸") y al tocarlo esa figura pasa adelante y lo hace.
- **Habilidades de campo:** Arci es la única que empuja las rocas y tiende **puentes de tablas** sobre las grietas (gasta 3 tablas de la isla). Musgo **aparta enredaderas** y **corta la hierba alta** (encuentra semillas, cuarzo, mineral o, a veces, un escarabajo dorado que da una estrella). Brasa **camina sobre el suelo de brasas**.
- **Tres zonas nuevas en la cueva**, una por figura: el **jardín de musgo** detrás de las enredaderas (piso 1), la **galería del mural** detrás de una grieta (piso 2, con un cofre y el mural de los cuatro: tierra, planta, fuego y agua, cada una con su isla) y la **cámara de brasas** (piso 3, con obsidiana).
- **Mejoras que se encuentran:** la **semilla antigua** (Musgo: puentes de raíces sin tablas; en la isla, lo que planta nace dos pasos más crecido) y el **corazón de magma** (Brasa: su luz llega mucho más lejos; en la isla funde mineral el doble de seguido). Se ven en el Diario, pestaña Equipo, junto con lo que cada figura hace en exploración.
- **Volver a la cueva vale la pena:** la hierba alta vuelve a crecer a los pocos minutos, y los cristales, las vetas de cobre y la obsidiana después de un rato más largo.
- **Obsidiana** (material nuevo) y el **pico de obsidiana** (taller): en la cueva todo lo que se pica sale doble; en la isla sale mineral más seguido.
- **Capítulo 9 · Lo que sabe cada uno** (9 metas en 3 etapas, una por figura; premio +12 ★). El faro pasa a ser el capítulo 10.
- Logro nuevo: **Jardinero de la cueva**.

## La isla del faro (v0.18)

- **Desembarcar:** por el paso entre las olas, cerca de la isla del faro aparece "Desembarcar". Después de la primera visita, el panel del muelle ofrece "Ir a la isla del faro" directo.
- **Primera isla exterior** con el mismo modo de exploración de la cueva, pero de día y al aire libre: arena, pasto, palmeras, rocas en la costa, un muelle de madera, mar alrededor y un faro rojo y blanco.
- **Marea espera junto al faro.** La lente se rompió en tres y cada trozo pide a una figura: uno en el **pasto alto** (Musgo), otro entre las **fumarolas** con vapor (Brasa) y el tercero en una roca al otro lado del agua, a la que se llega empujando una **roca al mar** para hacer un paso (Arci).
- **Encender el faro:** arriba, en la linterna, se ponen los tres trozos. La luz gira y desde la isla principal se ve su haz de noche.
- **Marea se une** como cuarta figura: en exploración **camina por el agua**; en la isla, **pesca mejor** (lo que vive en el agua se acerca antes y desde más lejos) y prefiere ser ella la que pesca.
- **El islote de las conchas:** solo Marea llega por el agua; tiene un cofre y la primera vista de las otras islas.
- **Más vida:** pasto que se mece con el viento (en el vértice, sin costo), mariposas de día, **luciérnagas de noche** (pocas, también en la isla principal), gaviotas que dan vueltas, cangrejos que arrancan de lado, vapor de las fumarolas, olas y espuma en la orilla.
- **Mejor guía al tocar:** si tocas un lugar al que solo llega otra figura (detrás del agua, entre fumarolas o en el pasto), esa figura pasa adelante sola.
- **Capítulo 10 · La isla del faro** (8 metas, 3 etapas; premio +15 ★). El capítulo 11, **La Isla Ardiente**, queda anunciado.
- **GitHub:** el proyecto vive en github.com/0-Zt/IslaArc, con un flujo que publica el juego en GitHub Pages en cada versión.

## UI de arcilla (v0.19)

- **Un solo material para toda la interfaz:** paneles como tablillas de arcilla clara, con borde café y sombra hundida, igual que las figuras. Botones gruesos que se hunden al tocarlos, títulos en una cinta amarilla, letra redonda (Fredoka y Nunito, incluidas en el archivo: funcionan sin internet).
- **Bandeja de recursos:** arriba se ven solo los 4 o 5 materiales que importan ahora (los que nombra la meta, los que están llenos y los últimos que juntaste o gastaste). Todo lo demás está en la **bolsa**, con cuánto cabe de cada uno. La bolsa marca "!" si algo que no está a la vista se llenó.
- **Lo que juntas vuela a la bandeja:** el ícono sale de donde trabajó la figura y cae en su casilla (o en la bolsa).
- **Retratos de las figuras:** cada una con su cara real (se dibuja del mismo modelo 3D), su nombre y un ícono de lo que está haciendo ("zz" si espera, "!" si el almacén está lleno). Al elegir una, un globo dice "toca dónde trabajar". Los retratos también aparecen en la cueva, en el Diario y en la portada.
- **Listas más cortas:** en Construir, Taller, Horno y Casa cada fila muestra ícono, nombre, costo y botón; la descripción se abre tocando la fila. El costo muestra solo la cantidad si alcanza, y "tienes/necesitas" en rojo si falta.
- **Diario con íconos** en sus pestañas.
- **Paneles que entran con rebote y salen deslizando**, con un sonido suave al tocar.
- **Capítulo completo:** una tarjeta con confeti y estrellas sobre la isla (se va sola o con cualquier toque, nunca bloquea).
- **Portada nueva:** logo de arcilla, la isla girando lento detrás, las figuras que tienes, "Continuar" con el capítulo y el tiempo jugado. "Nueva partida" pide confirmación si ya hay una isla guardada. La versión sale sola del proyecto.
- **Menú:** volumen de efectos y de ambiente por separado, tamaño del texto (normal o grande), y **respaldo**: un código con tu partida para guardarlo o seguir en otro navegador.
- Arreglos: el texto final ya habla del faro y la Isla Ardiente; Marea aparece en el Equipo del Diario; los avisos ya no tapan los botones de la derecha.

## La Isla Ardiente (v0.20)

- **La puerta de lava:** el arco del santuario del islote ahora tiene roca negra que late. Cuando Brasa tiene el corazón de magma y el faro está encendido, al tocar el arco la lava se abre y aparece un camino de piedras calientes. Tocarlo de nuevo cruza a la isla.
- **La costa de ceniza** (exterior, 30×24): arena negra, ceniza, columnas de basalto, árboles quemados con brasas en las puntas, ríos y un lago de lava, termas turquesa, y el volcán de fondo, con lava bajando y humo saliendo del cráter. A veces la montaña ruge y la cámara tiembla.
- **Tres chimeneas, una por figura, y todas las enciende Brasa:**
  - **Del vapor (Arci):** un pasillo de géiseres que soplan por turnos (si te quedas encima, te empujan hacia atrás) y un géiser que nunca para, que se tapa empujando una roca.
  - **De las raíces (Musgo):** un matorral seco y espinoso que solo Musgo corta (sale carbón, obsidiana, semillas o mineral; vuelve a crecer) y una grieta para sus raíces.
  - **Del río (Marea):** lava que corre y que Marea enfría con agua: queda una costra negra que todos pisan. La lava honda, en cambio, solo se tapa con rocas.
- **Secretos de la costa:** el nido de las salamandras en el campo de brasas (combate corto que se repite cada 10 minutos y da obsidiana y carbón), un cofre entre las brasas (Brasa), un cofre en las termas (Marea), un grabado de Marea en una playa escondida a la que solo se llega nadando, obsidiana en medio del lago de lava (Arci la alcanza con una roca), una roca hueca con la **Huella en la ceniza**, y tres tablillas.
- **El corazón del volcán** (interior): un río de lava que se cruza de dos maneras (las rocas de Arci o el agua de Marea), el mural de la forja (por qué se fueron los Alfareros), un cuarto de brasas con cofre, obsidiana, cristales y el **Yunque de bolsillo** detrás de una pared hueca.
- **La salamandra madre** cuida la forja: el combate más difícil hasta ahora, con fase al rojo. Calmada, se hace a un lado.
- **La forja de los Alfareros:** Brasa la aviva y aparecen los **planos del horno de forja**. En la isla, el horno sube a nivel 3 (obsidiana, ladrillos, lingotes): todo sale el doble de rápido.
- **Combates nuevos:** las salamandras del nido y la madre. Marea tiene sus propios movimientos: **Chorro de agua** (enfría más si el enemigo está al rojo) y **Neblina** (el próximo golpe pega la mitad y el equipo se cura un poco).
- **Vida:** ceniza que cae, salamandras chicas que escapan del equipo, vapor de géiseres y termas, humo de las chimeneas encendidas.
- **Capítulo 11 · La Isla Ardiente** (9 metas, 3 etapas; premio +18 ★). El capítulo 12, **La Selva Enredada**, queda anunciado.

## Pendiente

- **Linde del bosque:** postes fabricables para agrandar o achicar una zona de bosque.
- **Volver a pasto:** semillas de pasto para deshacer un sendero.
- **Hierba alta en la isla principal**, un modelo de verdad para el faro que se ve desde el mar, revisar la dificultad del gólem.
- **Siguiente:** la Selva Enredada (v0.21) y las Profundidades con economía 2 (v0.22). El orden completo está en docs/vision.md y docs/plan-figuras.md.

## Decisiones tomadas

- Motor: Three.js + TypeScript + Vite, con build en un solo HTML.
- Rendimiento: terreno fusionado, árboles instanciados, sombra de contacto horneada, materiales Lambert, sombras en caché, 1,5× en calidad Baja, límite de 60 fps y resolución dinámica. N8AO queda opcional.
- Agua: estilizada, sin reflejos reales; franjas por distancia a la costa, espuma y fondo de arena.
- Plataforma principal: celular.
- Estilo: voxel con texturas pixel, luz suave, oclusión ambiental y efecto maqueta.
