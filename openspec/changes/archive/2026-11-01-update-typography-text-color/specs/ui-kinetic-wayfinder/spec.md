# Spec Delta

## MODIFIED Requirements

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

