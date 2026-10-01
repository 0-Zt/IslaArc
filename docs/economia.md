# Plan de economía y progresión

Cómo hacer que juntar materiales importe durante todo el juego, tomando lo que funciona en otros juegos de gestión progresiva.

## 1. Diagnóstico (prueba con el bot, v0.11.2)

Hoy cada figura junta, por minuto de trabajo:

| Material | Por minuto | Con herramienta de metal |
| --- | --- | --- |
| Madera | 26 | 52 |
| Piedra | 26 | 26 |
| Mineral (al picar) | 9 | 17 |
| Arena | 26 | 26 |
| Tierra | 26 | 26 |

Y lo que se compra cuesta muy poco frente a eso. Medido en **minutos de una figura**:

| Compra | Costo actual | Minutos de una figura |
| --- | --- | --- |
| Casa | 10 madera | 0,4 |
| Horno | 6 piedra, 6 arena, 4 madera | 0,6 |
| Aserradero | 12 madera, 6 piedra, 2 lingotes | 1,2 |
| Taller | 8 tablas, 6 ladrillos, 2 lingotes | 2,5 |

Con 3 figuras, todo se paga en menos de un minuto. El bot terminó los capítulos 1 a 4 con **más de 1.000 de madera sobrante**. Después del capítulo 1, los materiales dejan de ser un desafío y juntarlos pierde sentido.

**El problema de fondo no es que se junte rápido; es que no hay en qué gastar.** Sentir que la isla rinde es bueno. Lo que falta son destinos para lo que se junta, y un tope que obligue a decidir.

## 2. Lo que hacen otros juegos

| Patrón | Dónde se ve | Qué resuelve |
| --- | --- | --- |
| **Tope de almacén** que se mejora | Hay Day (granero y silo), Clash of Clans (almacenes) | Impide acumular sin fin; obliga a gastar o a invertir en más espacio. Mejorar el almacén es una meta en sí misma. |
| **Mejoras de edificios por niveles**, con costo creciente | Clash of Clans, Township, Forager | Un sumidero que nunca se acaba y que siempre da algo visible (más rápido, más cola, otro aspecto). |
| **Cadenas de producción** (crudo → refinado → pieza) | Factorio, Anno, Forager, Townsmen | El mismo material sirve para muchas cosas; cada era agrega un eslabón nuevo y los viejos siguen importando. |
| **Tierra cada vez más cara** | Forager (cada parcela cuesta más), Grow | Crecer cuesta más a medida que se crece. Ya lo tenemos en las parcelas, pero la subida es muy suave. |
| **Consumibles para salir a explorar** | Don't Starve (comida, antorchas), Pokémon (pociones) | La base produce lo que se gasta afuera; la expedición le da sentido a la granja y al horno. |
| **Comerciante que viene de visita** | Stardew Valley, Animal Crossing, Forager (mercado) | Convierte lo que sobra en cosas raras o planos; da una visita que esperar. |
| **De manual a automático** | Forager, Factorio, Stardew (aspersores) | Primero se trabaja a mano; después se asignan figuras a un edificio; al final las máquinas trabajan solas. Cada paso se siente como un premio. |
| **Desbloqueos por objeto clave, no por cantidad** | Pokémon (MO), Zelda | Los avances grandes piden algo encontrado o inventado, no "500 de madera". |

## 3. Principios para Isla Arcilla

1. **Medir todo en minutos del equipo.** Cada compra se diseña por cuántos minutos de trabajo pide, no por números sueltos.
2. **Siempre hay algo caro a la vista.** En cualquier momento, el jugador tiene una meta corta (1–3 min), una mediana (5–10 min) y una grande (15–30 min).
3. **Nada sobra para siempre.** Cada material tiene al menos un uso que escala sin fin: mejoras, almacén o el comerciante.
4. **Los topes generan decisiones.** Con el almacén lleno, las figuras se detienen y avisan. Entonces el jugador decide si gasta, mejora el almacén o cambia de tarea.
5. **Cada era agrega un eslabón**, no reemplaza el anterior: la madera de la era 1 sigue sirviendo en la 4 (como carbón, tablas, barcos).
6. **Los saltos grandes piden un objeto clave**: el hacha de metal, la linterna, la caracola de calma. Las cantidades preparan el salto; el objeto lo abre.

## 4. Las piezas

### 4.1 Almacén y topes

- Cada material tiene un tope. Al empezar es **40** para los crudos y **15** para los refinados.
- La barra de recursos muestra el tope cuando un material se acerca (por ejemplo **38/40**), y la ficha se pone ámbar al llenarse.
- Con el tope lleno, la figura que junta ese material para y muestra la burbuja **"Lleno"**. La flecha de objetivo apunta al almacén o a algo en qué gastar.
- **Almacén** (edificio nuevo, capítulo 1, después del tablón) con niveles:

| Nivel | Tope crudos | Tope refinados | Costo para subir | Minutos aprox. |
| --- | --- | --- | --- | --- |
| 1 | 40 | 15 | — | — |
| 2 | 100 | 30 | 30 madera, 20 piedra | 2 |
| 3 | 250 | 60 | 40 tablas, 20 ladrillos, 5 lingotes | 6 |
| 4 | 600 | 150 | 60 tablas, 40 ladrillos, 10 vidrio, 4 cobre | 15 |
| 5 | 1.500 | 400 | Pieza de los Alfareros + materiales | 30 |

### 4.2 Mejoras de edificios

Cada edificio sube de nivel con una obra (andamio y martillazos, como ahora) y cambia de aspecto. El costo sube cerca de **×2,2 por nivel** y desde el nivel 2 pide materiales refinados, así las cadenas siempre se usan.

| Edificio | Nivel 2 | Nivel 3 |
| --- | --- | --- |
| Casa | Más espacio en el almacén básico (+20) y un adorno nuevo | Desbloquea herramientas de era 3 |
| Horno | Dos fuegos: hace 2 cosas a la vez | Funde un 50 % más rápido; acepta carbón |
| Aserradero | **3 tablas por cada 4 de madera** (hoy da 1 por cada 2) | Corta vigas (nuevo refinado para barcos) |
| Taller | Inventos de nivel 2 | Inventos de nivel 3 (navegación) |
| Tablón | +1 encargo y encargos mejor pagados | Encargos especiales con planos de premio |
| Almacén | Ver tabla de arriba | |

### 4.3 Cadenas por era

| Era | Material nuevo | Se hace con | Se usa en |
| --- | --- | --- | --- |
| 1 · Barro | Lingote | 2 mineral + 1 madera (horno) | Herramientas de metal |
| 2 · Fuego | Tablas, ladrillo, vidrio | Aserradero y horno | Taller, almacén, mejoras |
| 2 · Fuego | **Carbón** | 3 madera (horno o carbonera) | Lingotes más baratos, antorchas, vidrio mejor. Es el gran destino de la madera que sobra |
| 2 · Fuego | **Antorcha** | 1 madera + 1 carbón | Provisión para la cueva |
| 3 · Cueva | Cobre, cuarzo, obsidiana | Solo en la cueva | Engranajes, lentes, pico de obsidiana |
| 3 · Cueva | **Comida** | Huerto (semillas → verduras) | Provisión para expediciones; las semillas que hoy sobran por cientos se vuelven útiles |
| 4 · Mar | Cuerda, vigas, lona | Fibra de pasto, aserradero nivel 3, telar | Balsa, velero, timón reforzado |

### 4.4 Sumideros permanentes

- **Mejoras de edificios** (4.2) y **almacén** (4.1).
- **Parcelas más caras:** hoy suben de a 1. Pasarían a crecer un **15 % por parcela** (3, 3, 4, 4, 5, 6, 7, 8, 9, 11…), así ganar tierra al mar sigue siendo una decisión en la hora 3.
- **Provisiones para expediciones:** comida y antorchas por salida. Más provisiones permiten llegar más hondo en la cueva.
- **Barco de trueques:** llega una vez por día del juego (cada 9 min) y se queda hasta la noche. Trae 3 ofertas al azar que cambian lo que sobra por cosas raras: planos de decoración, semillas especiales, un fragmento de mapa, cobre antes de tener la cueva. Un logro pide hacer 10 trueques.
- **Decoración con efecto:** algunos adornos dan un bonus chico en su radio (un farol alarga el día de trabajo, un macetero hace crecer los retoños cercanos). Así decorar también es invertir.

### 4.5 De manual a automático

| Etapa | Cómo se junta | Cuándo |
| --- | --- | --- |
| Manual | Tocas la figura y el objetivo; sigue sola (ya está, v0.11.2) | Capítulo 1 |
| Asignada | Una figura se queda trabajando en un edificio: **cantera** (piedra y mineral), **leñador** (madera del bosque), **huerto** (comida). Produce un poco más lento que a mano, pero sin que la mires | Capítulo 4–5 |
| Máquina | Molino, noria, poleas: producen solos con engranajes | Capítulo 6 (Mecanismos) |

La automatización libera a las figuras para las expediciones: la base trabaja mientras el equipo explora.

### 4.6 Curva de costos

- **Mejoras:** `costo(n) = base × 2,2^(n−1)`, redondeado a números lindos (10, 15, 20, 25, 30, 40, 50, 60, 80, 100…).
- **Parcelas:** `costo(n) = 3 × 1,15^(n−1)`.
- **Compras nuevas de cada capítulo:** entre 1 y 3 minutos del equipo en el capítulo 1, entre 3 y 6 en el 2–3 y entre 6 y 12 en el 4–5.
- **Ingreso:** se mantiene como está (+1 frecuente se siente bien). Lo que se ajusta son los costos y los topes.

## 5. Ritmo objetivo

| Capítulo | Bot hoy | Bot objetivo | Persona (estimado) |
| --- | --- | --- | --- |
| 1 · Barro | 4 min | 6–7 min | 12–15 min |
| 2 · El claro | 1,5 min | 3–4 min | 6–8 min |
| 3 · Las ruinas | 10 min | 12–14 min | 20–25 min |
| 4 · Fuego | 5,5 min | 12–15 min | 25–30 min |
| **Total 1–4** | **21 min** | **35–40 min** | **60–80 min** |

Además del tiempo, el bot debe cumplir:

- **Ningún material pasa más de 2 minutos seguidos con el almacén lleno** sin que haya algo útil en qué gastarlo (hoy terminan sobrando más de 1.000 de madera).
- **Nunca más de 3 minutos sin poder comprar nada** (nada de esperas muertas).
- **Cada material crudo se gasta en al menos 3 cosas** distintas por capítulo.

## 6. Cómo se mide

- El **bot de ritmo** (v0.11.2) se corre después de cada cambio de balance. Hay que sumarle un registro por minuto de cada material, del tope y de qué estaba haciendo cada figura, y sacar un gráfico.
- Con eso se ve dónde se llena el almacén, dónde se espera y qué material nunca se gasta.
- Después del bot, **3 personas** juegan la primera hora y se anota dónde se trabaron o se aburrieron.

## 7. Orden de trabajo

1. **v0.12 · Economía, parte 1:** almacén y topes con la burbuja "Lleno", mejoras de nivel 2 para casa, horno, aserradero y almacén, carbón, parcelas con costo creciente, nuevo balance de costos, y el bot con registro y gráfico.
2. **v0.13 · Cueva, prototipo:** antorchas y comida como provisiones, modo exploración, primer combate.
3. **v0.14 · Economía, parte 2:** barco de trueques, figuras asignadas a edificios (cantera, leñador, huerto), mejoras de nivel 3.
4. **v0.15 · Cueva completa** y Gólem de magma.
