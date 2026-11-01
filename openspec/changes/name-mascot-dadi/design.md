# Design

## Context

- La mascota se muestra con `next/image` en `components/shell/AppHeader.tsx` (línea 28) y en `components/invitacion/InvitePageClient.tsx` (línea 243), ambas con `alt="Mascota de I Bet U"`.
- `e2e/shell.spec.ts` (bloque "identidad de marca: mascota") localiza la imagen con `getByAltText("Mascota de I Bet U")`; es el único test que depende de ese texto.
- El nombre accesible del link de marca ("I Bet U, ir a Retos") viene de `aria-label` y no cambia.

## Goals / Non-Goals

**Goals:**
- Que el nombre Dadi quede en el texto alternativo y en la spec, sin alterar el aspecto de la interfaz.

**Non-Goals:**
- Texto visible con el nombre, voz de la mascota, cambios de imagen o de íconos.

## Decisions

1. **Solo texto alternativo.** El nombre vive en `alt` y en la spec; no se agrega texto visible. Alternativa descartada por ahora: usar a Dadi en estados vacíos y mensajes de WhatsApp (decisión del usuario: solo identidad).
2. **Texto exacto compartido.** Se usa "Dadi, la mascota de I Bet U" en los dos lugares. Para evitar que se desincronicen se define una constante única en el código de la web que ambos componentes importen.
3. **Requisito independiente.** Se agrega como requisito nuevo (no se modifica el de identidad de marca de `add-mascot-branding`), de modo que los dos cambios se archiven sin depender del orden.

## Risks / Trade-offs

- Si el lector de pantalla ya anuncia "I Bet U, ir a Retos" por el `aria-label` del link, el `alt` puede quedar oculto para algunos lectores; es el comportamiento esperado y no bloquea el cambio.
- La prueba de `shell.spec.ts` se rompe si no se actualiza junto con el texto; por eso va en el mismo grupo de tareas.

