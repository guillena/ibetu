# Proposal

## Why

Los estados vacíos de Retos, Amigos e Historial usan un círculo con un ícono de línea (Material Symbols) y una frase. Se ven genéricos y no aprovechan la identidad de marca. Ya existe Dadi (el dado rojo con gorra azul) y se diseñó una familia de tres personajes más, también con forma de dado y con rasgos de animal. Usarlos en los momentos "vacíos" da más gracia al juego sin tocar el resto de la interfaz.

## What Changes

- Se incorporan cuatro ilustraciones de personajes como assets de la app (WebP con fondo transparente, generados desde los originales JPG de `apps/web/design/brand/characters/`):
  - **Dadi** (rojo original) para el estado vacío de Retos.
  - **Oso** (dado marrón miel, orejas redondas, gorra azul apagada) para Amigos.
  - **Búho** (dado violeta ciruela, penachos y alitas) para Historial.
  - **Zorro** (dado terracota, orejas puntiagudas y cola) para la página pública de invitación.
- Se crea un componente compartido `EmptyState` (personaje, mensaje, acción opcional) que reemplaza las tres variantes copiadas hoy en cada pantalla, conservando los `data-testid` existentes y los textos actuales.
- En la invitación (`/r/:code`), el Zorro aparece en el estado "Invitación no disponible" y como saludo sobre la tarjeta del reto.
- Se mantienen los tres sub-estados de Retos (en juego, pendientes de declaración, invitaciones) con el mismo personaje (Dadi), solo cambia el texto.
- Los íconos de línea de los vacíos se reemplazan por el personaje. El resto de la iconografía de la app no cambia.

### Fuera del alcance

- Reemplazar los demás íconos de la app por versiones ilustradas.
- Otros usos de los personajes (reto ganado o perdido, onboarding, monedero, errores). Quedan para un cambio posterior.
- Cambiar a Dadi, el favicon o la paleta de la marca.
- Animaciones de los personajes.
- Versiones alternativas por estado (por ejemplo, Dadi triste). Hay una sola pose por personaje.

## Capabilities

### New Capabilities
- `ui-mascot-characters`: familia de personajes ilustrados (Dadi, Oso, Búho, Zorro), sus asignaciones a pantallas y el componente de estado vacío que los muestra.

### Modified Capabilities

## Impact

- Código: `apps/web/components/retos/RetosFeed.tsx`, `amigos/AmigosClient.tsx`, `historial/HistorialClient.tsx`, `invitacion/InvitePageClient.tsx`; nuevo `components/ui/EmptyState.tsx`.
- Assets: nuevos archivos en `apps/web/public/brand/characters/`.
- Pruebas: los tests que usan `retos-empty-state`, `friends-empty-state` e `history-empty-state` deben seguir pasando.
- Sin cambios de API ni de dependencias.
- Se relaciona con el cambio en curso `name-mascot-dadi`, que fija el texto alternativo "Dadi, la mascota de I Bet U". Este cambio asume ese nombre y deja la voz de la mascota fuera de alcance.

