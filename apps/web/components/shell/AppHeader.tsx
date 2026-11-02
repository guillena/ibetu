"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { MASCOT_ALT } from "@/lib/brand";
import { BalanceChip } from "./BalanceChip";
import { useShell } from "./shell-context";
import type { FairPlayBand } from "./shell-context";

const BAND_STYLE: Record<FairPlayBand, string> = {
  GREEN: "bg-secondary-container text-on-secondary-container",
  YELLOW: "bg-tertiary-fixed-dim text-on-tertiary-fixed",
  RED: "bg-alert-coral text-on-primary",
};

/** Barra superior fija: marca, saldo con conmutador de modo y acceso al perfil (con su % Fair Play). */
export function AppHeader() {
  const { fairPlay } = useShell();

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto w-full max-w-[var(--shell-max-w)] border-b border-surface-sky-subtle bg-surface/85 pt-[env(safe-area-inset-top)] shadow-level-1 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-space-xs px-margin">
          <Link href="/" aria-label="I Bet U, ir a Retos" className="flex touch-target items-center gap-space-xs">
            <Image
              src="/brand/mascot.png"
              alt={MASCOT_ALT}
              width={40}
              height={40}
              priority
              className="h-10 w-10 object-contain drop-shadow-sm"
            />
            <span className="type-headline-sm hidden leading-none text-ink-navy-deep min-[400px]:inline">I Bet U</span>
          </Link>

          <div className="flex items-center gap-space-xs">
            <BalanceChip />
            <Link
              href="/perfil"
              aria-label={fairPlay ? `Mi perfil, ${fairPlay.score}% Fair Play` : "Mi perfil"}
              className="relative flex h-12 w-12 items-center justify-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-level-1">
                <Icon name="person" filled size={22} />
              </span>
              {fairPlay && (
                <span
                  data-testid="fair-play-badge"
                  className={`type-label-sm absolute right-0 bottom-0.5 rounded-full px-1.5 py-0.5 ${BAND_STYLE[fairPlay.band]}`}
                >
                  {fairPlay.score}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

