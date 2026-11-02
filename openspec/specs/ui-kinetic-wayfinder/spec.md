# ui-kinetic-wayfinder Specification

## Purpose

Define el sistema visual, tipográfico, cromático y la estructura de pantallas de la Web App móvil de I Bet U bajo el Design System `Kinetic Wayfinder` (estética luminosa y ágil estilo Waze), optimizado para abrirse al instante desde WhatsApp con vocabulario 100% enfocado en desafíos sociales.

## Requirements

### Requirement: Aplicación estricta de tokens visuales Kinetic Wayfinder
La interfaz de usuario MUST implementar los tokens del sistema de diseño `Kinetic Wayfinder`: tipografía `Nunito` para títulos, importes, textos y etiquetas, iconografía `Material Symbols Outlined`, bordes redondeados (`8px`, `16px`, `24px` y `9999px`) y paleta de alto contraste diurno (`#0099FF`, `#33CCFF`, `#5CFD80`, `#FFDF99`, `#FF5722` y el gris `#4B4B4B` para el texto principal sobre fondos `#F9F9FF` y `#F0F7FF`). El texto secundario SHALL usar `#6B6B6B` y el texto sobre acciones amarillas y verdes conserva el azul marino `#182945`.

#### Scenario: Renderizado consistente de tarjetas y controles móviles
- **WHEN** el usuario navega por cualquiera de las vistas de la aplicación móvil
- **THEN** todos los botones interactivos respetan un área táctil mínima de 48px, las tarjetas usan los niveles de elevación y colores de `Kinetic Wayfinder`, y los textos emplean vocabulario de retos y amigos (sin jerga de tránsito ni autos)

#### Scenario: Tipografía única
- **WHEN** se carga cualquier pantalla
- **THEN** las familias efectivas del documento son solo `Nunito` y esa fuente se carga realmente (autoalojada)

#### Scenario: Color del texto principal y secundario
- **WHEN** se muestra texto principal sobre `#F9F9FF` o `#FFFFFF`
- **THEN** su color es `#4B4B4B` (contraste mínimo de 7:1) y el texto secundario es `#6B6B6B` (contraste mínimo de 4,5:1)

#### Scenario: Texto sobre acciones saturadas
- **WHEN** hay texto sobre un fondo amarillo o verde de acción
- **THEN** conserva el azul marino `#182945`

#### Scenario: Sin desborde por el ancho de la fuente
- **WHEN** la pantalla mide 360 px de ancho
- **THEN** ningún título, botón ni etiqueta provoca desplazamiento horizontal

### Requirement: Navegación principal e indicadores superiores
El sistema SHALL presentar una barra superior fija de una sola fila (marca, chip conmutador de modo y saldo, y perfil con su Termómetro de Credibilidad) y una barra inferior con `Retos`, `Amigos`, `Monedero` e `Historial` y un botón central (`+`) para crear un nuevo desafío.

#### Scenario: Saldo según el modo de juego
- **WHEN** el usuario alterna el conmutador del chip entre `Monedas` y `Plata`
- **THEN** en `Monedas` el chip muestra su saldo (un guion mientras no hay sesión, nunca una cifra inventada) y en `Plata` muestra "Amigos", porque la aplicación no custodia dinero

#### Scenario: El modo elegido se recuerda
- **WHEN** el usuario elige `Plata`, recarga la página y cambia de pantalla
- **THEN** el conmutador sigue en `Plata`

#### Scenario: Header de una sola fila
- **WHEN** se muestra cualquier pantalla
- **THEN** la barra superior ocupa una sola fila y no hay un switch `Monedas / Plata` a todo el ancho debajo

#### Scenario: Cambio de vista en el feed de Retos
- **WHEN** el usuario se encuentra en la pantalla principal `Retos`
- **THEN** puede filtrar sus desafíos mediante tres pestañas en forma de píldora: `En Juego` (activos), `Por Declarar` (esperando confirmación o en disputa, con indicador visual de alerta) e `Invitaciones` (pendientes de aceptar o rechazar)

### Requirement: Chip conmutador de modo en el header
El chip de saldo del header SHALL tener dos partes: el saldo, que al tocarlo lleva al `Monedero`, y un mini botón 3D de base 3 px que alterna entre `Monedas` y `Plata` y que MUST ser accesible como interruptor con nombre propio.

#### Scenario: Ir al Monedero desde el saldo
- **WHEN** el usuario toca el saldo del chip
- **THEN** navega a `/monedero`, sin cambiar el modo

#### Scenario: Alternar el modo desde el conmutador
- **WHEN** el usuario toca el mini botón 3D del chip
- **THEN** el modo cambia a `Plata` (si estaba en `Monedas`) o a `Monedas` (si estaba en `Plata`), el botón se hunde 3 px mientras dura la presión y el cambio no navega

#### Scenario: Ajuste a 360 px
- **WHEN** la pantalla mide 360 px de ancho y el modo es `Plata`
- **THEN** el header no desborda en horizontal y mantiene el área táctil de 48 px en cada acción

#### Scenario: Estado accesible
- **WHEN** un lector de pantalla recorre el chip
- **THEN** el saldo se anuncia con su modo ("monedas" o "modo plata") y el conmutador se anuncia como interruptor con su estado actual

### Requirement: Flujo de creación de reto en una sola pantalla con Presets rápidos
La pantalla `Crear Reto` SHALL organizar la creación en tres bloques ágiles dentro de una misma vista: 1) Selección de amigo o envío por link de WhatsApp, 2) Descripción del desafío (con texto libre de hasta 140 caracteres y píldoras de ideas pre-armadas/Presets tocables de un toque, sin dictado por voz), y 3) Configuración de la apuesta (selector `Monedas` o `Plata` en 3D, monto y fecha/hora de vencimiento).

#### Scenario: Selección de un Preset rápido al crear reto
- **WHEN** el usuario toca una píldora de Preset rápido (por ejemplo, "Emboque de papel" o "1v1 Ping Pong") en la pantalla `Crear Reto`
- **THEN** el campo de descripción del desafío se autocompleta con el texto sugerido permitiendo editarlo o lanzar el reto de inmediato

#### Scenario: El reto arranca con el último modo usado
- **WHEN** el usuario abre `Crear Reto` después de haber elegido `Plata` (en el header o en un reto anterior)
- **THEN** el selector de apuesta aparece en `Plata` con su monto por defecto (`1000`) y no con el de `Monedas`

#### Scenario: Selector de apuesta en 3D
- **WHEN** se muestra el bloque de apuesta
- **THEN** `Monedas` y `Plata` son botones 3D, con el modo seleccionado en azul `#0099FF` y el otro en blanco con borde y base grises

### Requirement: Vistas de Detalle del Reto, Declaración y Resolución de Disputa
La vista de `Detalle del Reto` SHALL mostrar la cuenta regresiva hacia el vencimiento, el enfrentamiento de ambos jugadores con su `% Fair Play`, la barra visual 50/50 del pozo reservado, la sección de video/foto opcional y la bitácora cronológica; la vista de `Declarar Resultado` MUST ofrecer las tres opciones (`¡Gané yo!`, `Ganó mi rival`, `Empate / Cancelar mutuo`) y, en caso de disputa, mostrar los controles para cambiar el voto en cualquier momento o proponer/aprobar al tercer amigo Juez.

#### Scenario: Visualización de estado en disputa
- **WHEN** un desafío entra en estado `Disputa` porque ambos jugadores declararon haber ganado
- **THEN** la pantalla de detalle resalta la alerta en color coral/ámbar y despliega el botón para rectificar el propio voto junto al selector para proponer o aprobar al 3er amigo Juez y su reloj de 48 horas

### Requirement: Previsualización enriquecida (OpenGraph) para links en WhatsApp
Cada enlace compartible de invitación a un reto (`/r/:code`) MUST generar metadatos OpenGraph dinámicos en el servidor (título, descripción e imagen de vista previa) para que, al compartirse en un chat de WhatsApp, se visualice una tarjeta con el título del desafío, el nombre del retador y el pozo en juego, cargando la pantalla interactiva en menos de un segundo. El mensaje de invitación MUST incluir el texto del reto, el pozo o la apuesta en juego y el link en su propio renglón.

#### Scenario: Compartir link de desafío en WhatsApp
- **WHEN** un jugador comparte el enlace de un reto recién creado en una conversación de WhatsApp
- **THEN** WhatsApp renderiza la vista previa con el nombre del retador, el texto del desafío y el premio en juego

#### Scenario: Imagen de vista previa del desafío
- **WHEN** se solicita la imagen de vista previa de un link de invitación válido
- **THEN** el sistema devuelve una imagen que muestra el nombre del retador con su `% Fair Play`, el texto del desafío y el pozo (o la apuesta en `Plata`)

#### Scenario: Mensaje de invitación con formato
- **WHEN** el jugador toca "Mandar por WhatsApp" tras crear un reto
- **THEN** el mensaje prearmado incluye el texto del reto, el pozo o la apuesta en juego y el link de invitación en un renglón separado

### Requirement: Columna móvil, accesibilidad y alcance visual
La interfaz SHALL ser una única columna de hasta 480 px, centrada en pantallas anchas, sin desborde horizontal desde los 360 px, con áreas táctiles de al menos 48 px, zoom del usuario habilitado y sin modo oscuro.

#### Scenario: Celular angosto
- **WHEN** el usuario abre cualquier pantalla en un celular de 360 px de ancho, también con el chip de `Plata`
- **THEN** ninguna pantalla desborda horizontalmente, los controles del encabezado no se cortan ni se superponen y todo elemento táctil mide al menos 48 por 48 px

#### Scenario: Contenido largo con barras fijas
- **WHEN** una pantalla tiene más contenido que la altura del celular y el usuario hace scroll
- **THEN** la barra superior y la navegación inferior quedan fijas y ningún contenido queda tapado por ellas

#### Scenario: Pantalla ancha
- **WHEN** el usuario abre la aplicación en una pantalla de escritorio
- **THEN** la aplicación se muestra como una columna centrada de hasta 480 px, con el mismo diseño del celular


### Requirement: Identidad de marca con la mascota de I Bet U
La marca de I Bet U MUST representarse con su mascota (el dado rojo con gorra azul) en el ícono de la pestaña del navegador (favicon) y en el ícono de marca de la esquina superior izquierda del encabezado, en reemplazo de cualquier ícono genérico.

#### Scenario: Favicon con la mascota
- **WHEN** el usuario abre cualquier pantalla de la aplicación en el navegador
- **THEN** la pestaña muestra la mascota como favicon, sin fondo opaco que la tape

#### Scenario: Marca en el encabezado
- **WHEN** el usuario ve el encabezado fijo en cualquier pantalla con barras
- **THEN** la esquina superior izquierda muestra la mascota junto al nombre "I Bet U", y tocarla lleva a `Retos`

#### Scenario: Área táctil y accesibilidad de la marca
- **WHEN** el usuario usa la marca del encabezado en un celular de 360 px
- **THEN** el control mide al menos 48 por 48 px, la imagen tiene texto alternativo y no hay desborde horizontal

### Requirement: Nombre oficial de la mascota
La mascota de I Bet U SHALL llamarse **Dadi**, y toda imagen que la muestre MUST exponer ese nombre en su texto alternativo ("Dadi, la mascota de I Bet U").

#### Scenario: Texto alternativo en el encabezado
- **WHEN** un lector de pantalla recorre el encabezado fijo de cualquier pantalla con barras
- **THEN** la imagen de la mascota se anuncia como "Dadi, la mascota de I Bet U"

#### Scenario: Texto alternativo en la invitación pública
- **WHEN** un lector de pantalla recorre la página pública de invitación `/r/:code`
- **THEN** la imagen de la mascota se anuncia como "Dadi, la mascota de I Bet U"

#### Scenario: El nombre no se imprime en la interfaz
- **WHEN** el usuario navega por las pantallas de la aplicación
- **THEN** el nombre Dadi no aparece como texto visible; la marca visible sigue siendo "I Bet U"
