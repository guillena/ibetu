import Image from "next/image";
import { Button } from "@/components/ui/Button";

const CHARACTERS = {
  dadi: { src: "/brand/characters/dadi.webp", alt: "Dadi, la mascota de I Bet U" },
  oso: { src: "/brand/characters/oso.webp", alt: "Oso, dado marrón con orejas y gorra azul" },
  buho: { src: "/brand/characters/buho.webp", alt: "Búho, dado violeta con alitas y penachos" },
  zorro: { src: "/brand/characters/zorro.webp", alt: "Zorro, dado terracota con orejas y cola" },
} as const;

export type MascotCharacter = keyof typeof CHARACTERS;

type MascotImageProps = {
  character: MascotCharacter;
  /** Lado en px (la imagen es casi cuadrada); por defecto 144. */
  size?: number;
  className?: string;
};

/** Ilustración de uno de los personajes de la familia de dados. */
export function MascotImage({ character, size = 144, className = "" }: MascotImageProps) {
  const { src, alt } = CHARACTERS[character];
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain drop-shadow-sm ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

type EmptyStateProps = {
  character: MascotCharacter;
  message: string;
  /** Botón opcional; por ejemplo { href: "/crear", label: "Crear un reto" }. */
  action?: { href: string; label: string };
  testId: string;
};

/**
 * Estado vacío con personaje: ilustración, mensaje y acción opcional.
 * Sustituye al círculo con ícono que se repetía en cada pantalla.
 */
export function EmptyState({ character, message, action, testId }: EmptyStateProps) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2"
    >
      <MascotImage character={character} />
      <p className="type-body-lg text-on-surface">{message}</p>
      {action ? (
        <Button href={action.href} className="px-space-lg">
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}

