"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Cierre de sesion manual (RNF-05).
 *
 * Va por POST: un GET puede dispararlo un `<img src>` de otro sitio y
 * desloguear al usuario sin que lo pida.
 */
export function LogoutButton({
  collapsed,
  tooltip,
}: {
  collapsed: boolean;
  /** Tooltip a mostrar cuando la sidebar esta colapsada. */
  tooltip?: React.ReactNode;
}) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Si la request falla igual se manda a /login: el middleware va a
      // rebotarlo de vuelta si la cookie sigue viva, y el usuario reintenta.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={saliendo}
      aria-label="Cerrar sesión"
      className={[
        "group relative flex w-full items-center gap-3 rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] disabled:opacity-60",
        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
      ].join(" ")}
    >
      <span className="material-symbols-outlined shrink-0 text-[20px]">logout</span>
      {!collapsed && (
        <span className="font-body text-sm font-medium">
          {saliendo ? "Saliendo..." : "Cerrar sesión"}
        </span>
      )}
      {collapsed && tooltip}
    </button>
  );
}
