# Spec Delta: Interfaz Web Móvil y Design System Kinetic Wayfinder

## ADDED Requirements

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

