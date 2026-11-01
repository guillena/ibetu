# Spec Delta: Interfaz Web Móvil y Design System Kinetic Wayfinder

## ADDED Requirements

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

