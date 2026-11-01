import { AppHeader } from "@/components/shell/AppHeader";
import { BottomNav } from "@/components/shell/BottomNav";
import { ShellProvider } from "@/components/shell/shell-context";

/**
 * Estructura de la app (barra superior + contenido + navegación inferior). Las pantallas
 * públicas, como la invitación a un reto, quedan fuera de este grupo y no la usan.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <AppHeader />
      <main className="mx-auto w-full max-w-[var(--shell-max-w)] px-margin pt-[calc(var(--shell-header-h)+env(safe-area-inset-top)+var(--spacing-space-md))] pb-[calc(var(--shell-nav-h)+env(safe-area-inset-bottom)+var(--spacing-space-xl))]">
        {children}
      </main>
      <BottomNav />
    </ShellProvider>
  );
}

