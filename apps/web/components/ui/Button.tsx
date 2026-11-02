import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "success" | "soft" | "danger-soft";
type Size = "md" | "fab";

type CommonProps = {
  variant?: Variant;
  /** `md` es el botón de acción estándar; `fab` es el botón redondo central de crear. */
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonProps = CommonProps &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href">)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">)
  );

const BASE = "touch-target inline-flex items-center justify-center";
const SHAPE: Record<Size, string> = {
  md: "type-label-lg gap-space-xs rounded-lg px-space-md",
  fab: "h-16 w-16 flex-col rounded-full",
};

/**
 * Botón de acción en 3D (relleno + base sólida que se hunde al presionar).
 * Con `href` renderiza un `Link`; sin él, un `button`. El desactivado y el movimiento
 * reducido los resuelven las clases `.btn-3d` de globals.css.
 */
export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: ButtonProps) {
  const classes = `${BASE} ${SHAPE[size]} btn-3d btn-3d--${variant}${size === "fab" ? " btn-3d--fab" : ""} ${className}`.trim();
  if (rest.href !== undefined) {
    return (
      <Link {...rest} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}
