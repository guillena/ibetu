# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

