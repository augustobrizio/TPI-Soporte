"use client";

import { useSidebar } from "./SidebarContext";

/**
 * Contenido principal del dashboard.
 *
 * El offset por la sidebar existe solo de `lg` para arriba, que es donde la
 * barra ocupa lugar de verdad. En mobile la barra es un drawer que flota por
 * encima, asi que el contenido usa el ancho completo — antes se comia 256px
 * de una pantalla de 375 y el texto quedaba en una palabra por renglon.
 *
 * El ancho viaja por CSS var porque un `style` inline no entiende de media
 * queries: la clase `lg:pl-[var(--sb-w)]` la aplica solo en escritorio.
 */
export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main
      className="min-h-screen bg-blueprint pt-16 lg:pl-[var(--sb-w)] lg:transition-[padding] lg:duration-200 lg:ease-out"
      style={{ "--sb-w": collapsed ? "64px" : "256px" } as React.CSSProperties}
    >
      {children}
    </main>
  );
}
