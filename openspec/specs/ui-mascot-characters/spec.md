# ui-mascot-characters Specification

## Purpose

Define la familia de personajes ilustrados de I Bet U (Dadi, Oso, Búho y Zorro) y el componente de estado vacío que los muestra, para dar identidad y calidez a los momentos sin contenido.

## Requirements

### Requirement: Familia de personajes con forma de dado
La interfaz SHALL contar con cuatro personajes: Dadi (dado rojo con gorra azul), Oso, Búho y Zorro. Los tres últimos MUST ser dados cúbicos con rasgos de su animal, contorno grueso del mismo tono que el relleno y colores mate y desaturados.

#### Scenario: Assets disponibles
- **WHEN** la app se construye
- **THEN** existe una imagen con fondo transparente por cada personaje, servida desde `/brand/characters/`

#### Scenario: Dadi conserva su rojo
- **WHEN** se muestra a Dadi
- **THEN** usa el rojo original de la marca y no una versión desaturada

### Requirement: Asignación de personajes por pantalla
Cada pantalla con estado vacío SHALL usar siempre el mismo personaje: Retos con Dadi, Amigos con Oso, Historial con Búho e Invitación con Zorro.

#### Scenario: Retos sin retos
- **WHEN** la lista de Retos no tiene elementos en cualquiera de sus tres pestañas
- **THEN** se muestra a Dadi con el mensaje de la pestaña activa y el botón `Crear un reto`

#### Scenario: Amigos sin amigos
- **WHEN** el usuario no tiene amigos
- **THEN** se muestra al Oso con el mensaje actual y el botón `Invitar a un amigo`

#### Scenario: Historial vacío
- **WHEN** el usuario no tiene retos cerrados
- **THEN** se muestra al Búho con el mensaje actual y sin botón de acción

### Requirement: Componente de estado vacío compartido
El sistema SHALL ofrecer un único componente `EmptyState` que muestre un personaje, un mensaje y una acción opcional, y que conserve el `data-testid` de cada pantalla.

#### Scenario: Pantalla con acción
- **WHEN** se muestra un estado vacío con acción
- **THEN** el botón conserva su destino y su área táctil mínima de 48 px

#### Scenario: Carga en curso
- **WHEN** la lista aún se está cargando
- **THEN** el estado vacío muestra el mensaje de carga actual

### Requirement: Zorro en la página de invitación
La página pública de invitación (`/r/:code`) SHALL mostrar al Zorro en el estado "Invitación no disponible" y como saludo sobre la tarjeta del reto.

#### Scenario: Invitación válida
- **WHEN** la invitación carga correctamente
- **THEN** el Zorro aparece sobre la tarjeta del reto sin desplazar el contenido principal fuera de la primera pantalla de 360 px

#### Scenario: Invitación no disponible
- **WHEN** la invitación no existe o no se puede cargar
- **THEN** el Zorro se muestra junto al mensaje de error

### Requirement: Accesibilidad y rendimiento de los personajes
Las ilustraciones SHALL tener texto alternativo descriptivo (o vacío si el mensaje ya lo transmite) y MUST cargarse sin provocar desplazamiento de diseño ni desborde horizontal desde los 360 px.

#### Scenario: Texto alternativo
- **WHEN** se muestra un personaje en un estado vacío
- **THEN** su imagen reserva tamaño fijo y tiene `alt` definido

#### Scenario: Columna móvil
- **WHEN** la pantalla mide 360 px de ancho
- **THEN** el personaje se ve completo y no genera desplazamiento horizontal
