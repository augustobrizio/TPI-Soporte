"use client";

import { useCerrarSesion } from "./useCerrarSesion";

/**
 * Item de "cerrar sesion" de la barra lateral.
 *
 * La logica (POST a `/api/auth/logout` y redireccion) vive en
 * `useCerrarSesion`, compartida con el menu de cuenta de la barra superior.
 */
export function LogoutButton({
  collapsed,
  tooltip,
}: {
  collapsed: boolean;
  /** Tooltip a mostrar cuando la sidebar esta colapsada. */
  tooltip?: React.ReactNode;
}) {
  const { salir, saliendo } = useCerrarSesion();

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
