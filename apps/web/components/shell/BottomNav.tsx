"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";

type NavItem = { href: string; label: string; icon: string; primary?: boolean };

/** Secciones principales. El botón central (+) es la acción de crear un reto. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Retos", icon: "sports_score" },
  { href: "/amigos", label: "Amigos", icon: "group" },
  { href: "/crear", label: "Crear", icon: "add", primary: true },
  { href: "/monedero", label: "Monedero", icon: "account_balance_wallet" },
  { href: "/historial", label: "Historial", icon: "history" },
];

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/" || pathname.startsWith("/retos/")
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname }: { pathname: string }) {
  return (
    <ul className="grid h-[var(--shell-nav-h)] grid-cols-5 items-center px-space-xs">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        if (item.primary) {
          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-label="Crear reto"
                aria-current={active ? "page" : undefined}
                className="-mt-8 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-surface-container-lowest bg-primary-container text-on-primary shadow-level-3 transition-transform active:scale-[0.96]"
              >
                <Icon name={item.icon} size={32} />
              </Link>
            </li>
          );
        }
        return (
          <li key={item.href} className="flex justify-center">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-space-xxs"
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primary-container text-on-primary" : "text-on-surface-variant"
                }`}
              >
                <Icon name={item.icon} filled={active} size={24} />
              </span>
              <span
                className={`type-label-sm ${active ? "text-primary" : "text-on-surface-variant"}`}
              >
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavList() {
  const pathname = usePathname();
  return <NavList pathname={pathname} />;
}

/** Barra de navegación inferior fija, en la zona del pulgar. */
export function BottomNav() {
  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-[var(--shell-max-w)] rounded-t-xl border-t border-surface-sky-subtle bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-level-2">
        <Suspense fallback={<NavList pathname="/" />}>
          <ActiveNavList />
        </Suspense>
      </div>
    </nav>
  );
}
