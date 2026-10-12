# Repaso: que cada figura cuente y que valga la pena volver

Repaso de lo que existe en la v0.16, lo que hacen otros juegos con el mismo problema y el plan para aplicarlo aquí. Complementa a docs/vision.md.

## Lo que hay hoy, mirado con honestidad

| Parte | Qué funciona | Qué falta |
| --- | --- | --- |
| La isla | Recolectar, refinar, construir, expandir, bosque y senderos. Se nota el progreso. | Construir se acaba pronto (12 edificios). Pocas cosas pequeñas que encontrar caminando. |
| Las 3 figuras | Cada una tiene una habilidad pasiva (Arci construye +50 %, Musgo planta mejor, Brasa funde y aviva). | **Las ventajas casi no se ven.** Fuera del combate, las tres hacen lo mismo. Ninguna figura abre algo que las otras no puedan. |
| El islote de Brasa | Bonito puzzle de runas. | Está cerca, se resuelve una vez y queda muerto. No conecta con nada después. |
| El mar | La pesca y el agua oscura se repiten bien (Colección, sombras). | Solo hay una dirección a la que ir. |
| La cueva | Tres pisos con puzles, vida, reliquias y el gólem. | **Se resuelve una vez y no hay razón para volver.** Los recursos no vuelven, todo queda abierto. |

**El problema de fondo:** casi todo se hace una sola vez. Lo único que se repite es recolectar y pescar. Y las figuras no se distinguen en lo que hacen afuera.

## Cómo lo resuelven otros juegos

| Juego | Qué hace | Qué tomamos |
| --- | --- | --- |
| **Pikmin** | Cada color de Pikmin aguanta un peligro: los rojos el fuego, los azules el agua. Los niveles se diseñan para necesitar combinarlos. | Cada figura atraviesa un tipo de terreno que las otras no: Brasa las brasas, Musgo las enredaderas, Arci las rocas pesadas y las grietas. |
| **The Lost Vikings / Trine** | Tres personajes, uno salta, otro empuja, otro se cubre. Cambias de personaje para resolver. | Elegir quién va adelante. Las demás esperan si no pueden pasar. |
| **Zelda / Hollow Knight** (metroidvania) | Ves caminos que no puedes tomar. Cuando consigues la habilidad, vuelves a zonas viejas y se abren. Atajos que quedan abiertos. | Las zonas ya visitadas (la cueva, el islote) esconden caminos que solo se abren con otra figura o con una mejora. |
| **Pokémon** | Corte, Fuerza y Surf: habilidades de campo que abren el mapa. Pasto alto con cosas escondidas. | Hierba alta que solo Musgo corta; rocas que solo Arci empuja. |
| **Stardew Valley** (las minas) | Los pisos se regeneran: vuelves cada semana por minerales. Más hondo, mejores materiales. | Los cristales y vetas de la cueva **vuelven a crecer**. Más adelante, las Profundidades: pisos que cambian. |
| **Core Keeper** | Cada bioma tiene su mineral, que solo se pica con la herramienta anterior. Se construye dentro de la cueva (puentes, antorchas, rieles). | Obsidiana que pide el pico de obsidiana; puentes de tablas que Arci tiende con materiales de la isla. |
| **Zelda** (el pasto) | Cortar pasto da cositas y vuelve a crecer: recompensa constante por explorar. | La hierba alta vuelve a crecer y siempre puede esconder algo. |
| **Animal Crossing** (islas misteriosas) | Islas al azar para recursos distintos. | Más adelante: viajes cortos a islotes que cambian. |

## El plan

### 1. Las figuras son llaves (habilidades de campo)

En exploración se elige quién va adelante tocando su cara. Si la de adelante no puede pasar por algo, las demás se quedan esperando hasta que vuelva.

| Figura | Qué abre en exploración | Su mejora (se encuentra) | Qué cambia en la isla con la mejora |
| --- | --- | --- | --- |
| **Arci** (tierra) | Empuja las rocas (solo ella), rompe paredes, **tiende puentes de tablas** sobre las grietas (gasta tablas de la isla) | Más adelante, en su propia zona | — |
| **Musgo** (planta) | **Aparta las enredaderas**, **corta la hierba alta** (siempre encuentra algo) | **Semilla antigua:** hace crecer puentes de raíces sobre las grietas, sin tablas | Lo que planta crece dos pasos |
| **Brasa** (fuego) | **Camina sobre el suelo de brasas** | **Corazón de magma:** su luz alcanza mucho más lejos en la oscuridad | Funde mineral el doble de seguido al picar |
| **Marea** (agua, cuando llegue) | Nadar, corrientes | — | — |

### 2. Volver a la cueva

- **Zonas nuevas en los tres pisos** que solo una figura abre: el jardín de musgo (piso 1, Musgo), la galería del mural (piso 2, Arci con un puente) y la cámara de obsidiana (piso 3, Brasa por las brasas).
- **Los cristales y las vetas vuelven a crecer** con el tiempo; la hierba alta también.
- **Obsidiana**, un material nuevo que solo sale de la cueva: abre el **pico de obsidiana**, que pica todo el doble en la cueva y saca más mineral en la isla.
- Después: **las Profundidades**, pisos que cambian en cada visita, con minerales mejores mientras más hondo (como las minas de Stardew).

### 3. Una isla para cada figura

| Isla | Para quién | Qué tiene | Cómo se llega |
| --- | --- | --- | --- |
| **La Isla Ardiente** | Brasa | Un volcán de verdad, ríos y lagos de lava, géiseres, la forja de los Alfareros, obsidiana a montones. Solo Brasa cruza la lava (con el corazón de magma). | El santuario del islote tiene una **puerta de lava sellada**: Brasa la abre con el corazón de magma y aparece un camino de piedras calientes. Así el islote deja de ser un lugar muerto. |
| **La Selva Enredada** | Musgo | Enredaderas, hierba muy alta, flores gigantes que sirven de puente, semillas raras para el bosque de la isla. | En el archipiélago, desde la isla del faro |
| **La isla del faro** | Marea | El reencuentro, el mapa del mar, el centro del archipiélago | Por el paso entre las olas (ya abierto) |
| **La cantera** | Arci | Rocas enormes, grietas, construir puentes y andamios | Más adelante |

### 4. Construir también afuera

Puentes de tablas (Arci), puentes de raíces (Musgo), y más adelante antorchas, escaleras de cuerda y un campamento en las islas. Los materiales salen de la isla: así **la base sigue importando cuando exploras**.

## Orden nuevo

| Versión | Qué trae |
| --- | --- |
| **v0.17 · Cada figura cuenta** (hecho) | Elegir quién va adelante, habilidades de campo, las tres zonas nuevas de la cueva, hierba alta, recursos que vuelven a crecer, semilla antigua y corazón de magma, obsidiana y pico de obsidiana. Capítulo 9. |
| v0.18 · La isla del faro (hecho) | Marea, el mapa del mar, el archipiélago se abre. |
| v0.19 · UI de arcilla (hecho) | La interfaz completa rehecha con un solo estilo de juego. |
| v0.20 · La Isla Ardiente | La puerta de lava del islote, la isla de Brasa. |
| v0.21 · La Selva Enredada | La isla de Musgo. |
| v0.22 · Las Profundidades y economía 2 | Pisos que cambian, figuras asignadas a edificios, trueques. |
| Después | La ciudad de los Alfareros y el final. |

**Sobre el islote de Brasa:** moverlo más lejos rompería las partidas guardadas (los braseros están construidos encima). Mejor darle un futuro: la puerta de lava que lleva a la Isla Ardiente.
