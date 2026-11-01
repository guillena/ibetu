# Spec Delta: Interfaz Web Móvil y Design System Kinetic Wayfinder

## MODIFIED Requirements

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

