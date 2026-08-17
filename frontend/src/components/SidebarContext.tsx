"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Estado de la sidebar. Son dos cosas distintas y no hay que mezclarlas:
 *
 * - `collapsed` es de escritorio: la barra sigue visible pero en 64px, y la
 *   preferencia se recuerda entre visitas.
 * - `mobileOpen` es del drawer: abajo de `lg` la barra sale de pantalla y se
 *   abre por encima del contenido. No se persiste — que una visita nueva
 *   arranque con el menu abierto tapando todo seria un bug, no una comodidad.
 */
interface SidebarCtx {
  collapsed: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
}

const Ctx = createContext<SidebarCtx>({
  collapsed: false,
  toggle: () => {},
  mobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
});

const STORAGE_KEY = "utnhub.sidebar.collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restaurar preferencia (solo cliente, evita mismatch de hidratación)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  // Con el drawer abierto se bloquea el scroll del fondo: si no, el dedo
  // scrollea la pagina de atras en vez del menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [mobileOpen]);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });

  return (
    <Ctx.Provider
      value={{
        collapsed,
        toggle,
        mobileOpen,
        toggleMobile: () => setMobileOpen((o) => !o),
        closeMobile: () => setMobileOpen(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
