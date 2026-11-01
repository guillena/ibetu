# Proposal: Vista previa y mensaje enriquecido al compartir un reto por WhatsApp

## Why

Al compartir un reto, el mensaje de WhatsApp llegaba como texto plano sin jerarquía y sin una imagen de vista previa, lo que resta atractivo al desafío y baja la tasa de aceptación desde el link.

## What Changes

- El mensaje de invitación que arma la aplicación usa el formato nativo de WhatsApp (negritas), incluye el texto del reto, el pozo o la apuesta en juego y el link en su propio renglón.
- Cada link de invitación (`/r/:code`) publica además una imagen de vista previa (`og:image`) con el retador, su `% Fair Play`, el texto del reto y el pozo en juego.

## Capabilities

### New Capabilities

### Modified Capabilities
- `ui-kinetic-wayfinder`: el requisito de previsualización enriquecida (OpenGraph) pasa a exigir una imagen de vista previa y define el contenido del mensaje de invitación.

## Impact

- API: armado de `whatsappShareUrl` al crear un reto.
- Web: pantalla de reto creado (`/crear`) y ruta pública `/r/[code]` (imagen OpenGraph dinámica).
- Nota: WhatsApp solo vuelve cliqueable el link y genera la tarjeta cuando la URL es pública (no `localhost`); esto se valida al publicar.

