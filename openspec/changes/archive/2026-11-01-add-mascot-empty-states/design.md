## Context

Hoy los estados vacíos de Retos, Amigos e Historial son tres bloques casi idénticos: un círculo azul claro con un ícono Material Symbols, un párrafo y a veces un botón. La invitación pública muestra un texto de error simple. Los personajes ya existen como JPG con fondo blanco en `apps/web/design/brand/characters/` (`dadi-retos`, `oso-amigos`, `buho-historial`, `zorro-invitacion`).

## Goals / Non-Goals

**Goals:**
- Reemplazar los íconos de los estados vacíos por los personajes.
- Unificar el marcado en un solo componente.
- Mantener textos, `data-testid`, enlaces y accesibilidad actuales.

**Non-Goals:**
- Nuevas poses, animaciones o usos fuera de estados vacíos e invitación.
- Cambiar la paleta, el favicon o el diseño general.

## Decisions

1. **Componente `EmptyState` en `components/ui/`.** Props: `character` (`"dadi" | "oso" | "buho" | "zorro"`), `message`, `action?` (`{ href, label }`), `testId`. Mantiene las clases actuales de la tarjeta. Alternativa descartada: un componente por pantalla, que repite el código.
2. **Assets WebP con fondo transparente en `public/brand/characters/`.** Se procesan una sola vez desde los JPG (quitar fondo y recortar) y se versionan como archivos finales. Tamaño de origen 512 px, mostrado a ~128–160 px. Se sirven con `next/image` y tamaño fijo para evitar saltos de diseño. Alternativa descartada: vectorizar a SVG, porque los degradados y detalles se pierden o pesan mucho.
3. **Fondo transparente por eliminación de fondo blanco.** Si el resultado deja halos, se aplica un recorte manual con umbral y suavizado. Es el mayor riesgo técnico del cambio.
4. **Un personaje fijo por pantalla**, definido en un mapa `character → archivo y alt`. Las tres pestañas de Retos comparten a Dadi.
5. **Zorro en la invitación:** un saludo pequeño (~96 px) sobre la tarjeta del reto y uno mayor (~140 px) en el estado "Invitación no disponible". Se reutiliza `EmptyState` para este último y se omite el botón.
6. **Texto alternativo:** se usa el `alt` descriptivo ("Dadi, la mascota de I Bet U", "Oso con gorra…"). Es decorativo cuando el mensaje ya dice lo mismo, así que se acepta `alt=""` en los casos donde la imagen repite el contenido.

## Risks / Trade-offs

- **Calidad del recorte de fondo** → revisión visual en fondo blanco y en `surface-container-lowest`.
- **Peso de imágenes** → WebP a ~128–160 px; objetivo menor a 30 KB por personaje.
- **Dadi rojo fuerte junto a los otros tres apagados** → decisión del usuario; se mantiene y se evalúa en pantalla.
- **El Zorro en la invitación empuja el contenido hacia abajo** → tamaño pequeño y verificación en 360 px.
- **Cambio en curso `name-mascot-dadi`** cambia el `alt` de la mascota en el encabezado, no los estados vacíos. No hay conflicto de archivos salvo `InvitePageClient.tsx`, donde ambos tocan el encabezado.

## Open Questions

- Si el zorro debe tener también un saludo en la invitación cuando el usuario ya la aceptó. Se asume que no.

