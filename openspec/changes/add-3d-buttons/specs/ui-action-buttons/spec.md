# Spec Delta

## Purpose

Define el estilo, las variantes y los estados de los botones de acción de I Bet U, con un aspecto 3D táctil (base sólida que se hunde al presionar) y accesible.

## ADDED Requirements

### Requirement: Botones de acción en 3D
Los botones de acción SHALL tener un relleno de color y una base inferior sólida de 4 px más oscura que el relleno, sin sombra difusa, y MUST mantener un área táctil de al menos 48 px.

#### Scenario: Botón en reposo
- **WHEN** se muestra un botón de acción activo
- **THEN** tiene su base sólida visible y las esquinas redondeadas del sistema

#### Scenario: Botón presionado
- **WHEN** el usuario presiona el botón
- **THEN** el botón baja 4 px y la base desaparece mientras dura la presión

### Requirement: Variantes de color de botón
El sistema SHALL ofrecer las variantes principal (relleno `#0099FF`, base `#0077CC`, texto blanco), éxito (verde), suave (fondo blanco, borde gris claro de 2 px, base gris y texto azul) y peligro suave, cada una con su base más oscura.

#### Scenario: Mismo azul que los tabs
- **WHEN** se muestran a la vez un botón principal y un tab seleccionado
- **THEN** ambos tienen el mismo relleno `#0099FF` y su base es `#0077CC`

#### Scenario: Azul del resto de la interfaz
- **WHEN** se muestran íconos, enlaces y estados de foco
- **THEN** conservan el azul `#0099FF`

### Requirement: Estado desactivado y movimiento reducido
Un botón desactivado SHALL mostrarse gris, sin base y sin movimiento, y la interfaz MUST respetar `prefers-reduced-motion` sin animar el hundimiento.

#### Scenario: Botón desactivado
- **WHEN** un botón está desactivado
- **THEN** no responde a la presión y se ve gris plano

#### Scenario: Movimiento reducido
- **WHEN** el sistema del usuario pide movimiento reducido
- **THEN** el botón cambia de estado al presionar sin transición animada

### Requirement: Botón central de crear reto más llamativo
El botón central `+` de la barra inferior SHALL usar el estilo 3D con una base de 6 px y un tamaño mayor que el resto, con el mismo relleno `#0099FF` y base `#0077CC` que los botones azules, y MUST seguir llevando el nombre accesible `Crear reto`.

#### Scenario: Botón de crear
- **WHEN** se muestra la barra inferior
- **THEN** el `+` destaca por su base más gruesa y navega a `/crear`

#### Scenario: Azul del botón central
- **WHEN** se muestra el `+` en reposo
- **THEN** su relleno es `#0099FF` y su base es `#0077CC`, igual que el tab seleccionado y el botón principal

### Requirement: Tabs seleccionados en 3D
El tab seleccionado del switch `Monedas / Plata` y de las pestañas de Retos SHALL tener relleno `#0099FF` y la misma base de 4 px y hundimiento al presionar que los botones, sin que la base desborde su contenedor; los tabs no seleccionados MUST mantenerse planos.

#### Scenario: Tab seleccionado
- **WHEN** el usuario selecciona `Monedas`, `Plata`, `En Juego`, `Por Declarar` o `Invitaciones`
- **THEN** el tab activo muestra el relleno `#0099FF` con base `#0077CC` de 4 px y su contenedor la contiene sin recortarla

#### Scenario: Tab no seleccionado
- **WHEN** un tab no está seleccionado
- **THEN** se muestra plano, sin base 3D

### Requirement: Alcance del estilo 3D
El estilo 3D SHALL aplicarse solo a los botones de acción, al `+` y a los tabs seleccionados; las tarjetas, los chips, los tabs no seleccionados y el resto de la barra inferior MUST mantenerse planos.

#### Scenario: Tarjetas sin cambios
- **WHEN** se muestra una tarjeta
- **THEN** conserva su sombra suave y no lleva base 3D

