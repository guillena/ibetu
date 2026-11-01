import type { CSSProperties } from "react";

type IconProps = {
  /** Nombre del símbolo de Material Symbols Outlined (por ejemplo "group"). */
  name: string;
  /** Versión rellena del símbolo (estado activo). */
  filled?: boolean;
  /** Tamaño en px; por defecto 24. */
  size?: number;
  className?: string;
};

/**
 * Ícono de Material Symbols Outlined (fuente autoalojada, ver globals.css).
 * Es decorativo: el texto accesible lo aporta el elemento que lo contiene.
 */
export function Icon({ name, filled = false, size, className = "" }: IconProps) {
  const style = {
    "--fill": filled ? 1 : 0,
    ...(size ? { fontSize: `${size}px` } : {}),
  } as CSSProperties;
  return (
    <span aria-hidden="true" className={`material-symbols-outlined select-none ${className}`} style={style}>
      {name}
    </span>
  );
}

