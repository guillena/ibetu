# Design

## Context

- El encabezado vive en `components/shell/AppHeader.tsx`: la marca es un `Link` a `/` con un círculo azul que contiene el ícono Material `sentiment_very_satisfied` y un rayo, más el texto "I Bet U". El test `e2e/shell.spec.ts` exige que ese control mida al menos 48×48 px y que el link se llame "I Bet U, ir a Retos".
- La marca también aparece en la página pública de invitación `/r/[code]` (`components/invitacion/InvitePageClient.tsx`) con el mismo ícono genérico.
- `apps/web/app/` solo tiene `favicon.ico` (el de la plantilla); no hay carpeta `public/`.
- La imagen entregada es un JPG de 948×1024, 24 bits RGB, sin canal alfa: el fondo negro está dentro de la imagen (el píxel de la esquina es `0,0,0`). El contorno de la mascota es rojo oscuro, no negro puro.

## Goals / Non-Goals

**Goals:**
- Mostrar la mascota como favicon (pestaña y pantalla de inicio) y en el encabezado, con fondo transparente.
- Mantener el link a `Retos`, el nombre accesible y el área táctil de 48 px.

**Non-Goals:**
- Cambios de paleta, tipografía u otros íconos; variantes animadas; `og:image` de invitaciones.

## Decisions

1. **Fondo transparente generado desde el JPG.** Se genera un PNG con alfa quitando el negro conectado a los bordes (relleno desde las esquinas con tolerancia baja y un suavizado mínimo del borde). Alternativa descartada: usar el JPG tal cual, que dejaría un recuadro negro en la pestaña y en el encabezado claro. Si el usuario aporta el PNG transparente original, se usa ese y se omite el recorte.
2. **Íconos cuadrados con margen.** La mascota (948×1024) se centra en un lienzo cuadrado transparente para generar `app/icon.png` (512×512), `app/apple-icon.png` (180×180, con fondo claro `#F9F9FF` porque iOS no admite transparencia) y un `app/favicon.ico` multi-tamaño (16, 32 y 48 px) que reemplaza al actual. Next.js los publica con la convención de archivos de `app/`, sin tocar `metadata.icons`.
3. **Imagen del encabezado con `next/image`.** Se coloca el PNG transparente en `public/brand/mascot.png` y se muestra dentro del mismo `Link` actual en un cuadro de 40 px (el link conserva su alto táctil de 48 px) con `alt="Mascota de I Bet U"`. El nombre accesible del link se mantiene ("I Bet U, ir a Retos") y la imagen no repite el nombre.
4. **Misma marca en la invitación pública.** Se reemplaza también el ícono genérico en `/r/[code]` para no mezclar dos marcas distintas en el producto. Es un supuesto a confirmar: si no se quiere, se omite esa tarea.

## Risks / Trade-offs

- Recorte automático: si el borde rojo oscuro queda con halo oscuro, se ve peor sobre fondo claro; se revisa visualmente a 16, 32 y 40 px y se ajusta la tolerancia. Lo ideal es el PNG transparente original.
- A 16 px la gorra y los puntos del dado pueden perder detalle; se acepta, ya que es el comportamiento esperable de cualquier favicon.
- Los íconos de la plantilla pueden quedar cacheados en el navegador; se prueba con recarga forzada.

