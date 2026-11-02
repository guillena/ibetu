import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type SectionProps = {
  title: string;
  description: string;
  icon: string;
  empty: string;
  action?: { href: string; label: string };
};

/** Encabezado y estado vacío de una sección principal. Cada pantalla lo reemplaza con su contenido real. */
export function SectionPage({ title, description, icon, empty, action }: SectionProps) {
  return (
    <>
      <h1 className="type-headline-lg-mobile text-ink-navy-deep">{title}</h1>
      <p className="type-body-md mt-space-xs text-on-surface-variant">{description}</p>

      <section className="mt-space-lg flex flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sky-tint text-primary-container">
          <Icon name={icon} filled size={32} />
        </span>
        <p className="type-body-lg text-on-surface">{empty}</p>
        {action && (
          <Link
            href={action.href}
            className="type-label-lg touch-target inline-flex items-center justify-center rounded-lg px-space-lg btn-3d btn-3d--primary"
          >
            {action.label}
          </Link>
        )}
      </section>
    </>
  );
}

