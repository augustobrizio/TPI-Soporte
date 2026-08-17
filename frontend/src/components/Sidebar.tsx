"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/features/auth/LogoutButton";
import { useSidebar } from "./SidebarContext";

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Inicio",       icon: "home",            href: "/"          },
  { label: "Chatbot",      icon: "smart_toy",       href: "/chat"      },
  { label: "Calendario",   icon: "calendar_month",  href: "/calendario"},
  { label: "Materias",     icon: "account_tree",    href: "/materias"  },
  { label: "Material",     icon: "folder_open",     href: "/material"  },
  { label: "Horarios",     icon: "schedule",        href: "/horarios"  },
  { label: "Comisiones",   icon: "groups",          href: "/comisiones"},
  { label: "Novedades",    icon: "campaign",        href: "/novedades" },
  { label: "Profesores",   icon: "badge",           href: "/profesores"},
  { label: "Perfil",       icon: "person",          href: "/perfil"    },
] as const;

function isActive(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Tooltip flotante que aparece a la derecha del ícono cuando la sidebar está colapsada. */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-[var(--shell-panel)] border border-[var(--shell-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--shell-fg)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
    >
      {label}
    </span>
  );
}

/** Datos del usuario logueado, resueltos en el layout (Server Component). */
export interface UsuarioSidebar {
  nombre: string;
  detalle: string;
  iniciales: string;
}

/** `null` = visitante sin cuenta: en vez del avatar van los accesos a entrar. */
export function Sidebar({ usuario }: { usuario: UsuarioSidebar | null }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[var(--shell-border)] bg-[var(--shell-panel)] transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? "64px" : "256px" }}
    >
      {/* Logo — alineado con el TopNav (h-16) */}
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--shell-border)] ${collapsed ? "justify-center px-0" : "gap-3 px-5"}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/utn-isotipo-white.png"
            alt="UTN"
            className="h-5 w-5 object-contain opacity-90"
          />
        </div>
        {!collapsed && (
          <div className="leading-none">
            <p className="font-headline text-[15px] font-extrabold tracking-tight text-[var(--shell-fg)]">
              UTNHub
            </p>
            <p className="mt-0.5 font-label text-[9px] uppercase tracking-[0.14em] text-[var(--shell-fg-dim)]">
              ISI · UTN FRRO
            </p>
          </div>
        )}
      </div>

      {/* Navegacion — cuando está colapsada NO recortamos overflow para que los tooltips puedan salir */}
      <nav className={`flex-1 pt-5 pb-3 space-y-0.5 ${collapsed ? "px-2 overflow-visible" : "px-3 overflow-y-auto overflow-x-hidden"}`}>
        {!collapsed && (
          <p className="select-none px-3 pb-3 font-label text-[9px] uppercase tracking-[0.15em] text-[var(--shell-fg-dim)]">
            Módulos
          </p>
        )}

        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group relative flex items-center gap-3 rounded-lg transition-all duration-200",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
                  : "text-[var(--shell-fg-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]",
              ].join(" ")}
            >
              {/* Accent pill del item activo (solo expandido) */}
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#1CA4DF]" />
              )}
              <span
                className={[
                  "material-symbols-outlined shrink-0 text-[20px] transition-transform duration-200",
                  active || collapsed ? "" : "group-hover:translate-x-0.5",
                ].join(" ")}
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              {!collapsed && <span className="font-body text-sm font-medium">{item.label}</span>}
              {collapsed && <Tooltip label={item.label} />}
            </Link>
          );
        })}
      </nav>

      {/* Toggle colapsar */}
      <div className={`shrink-0 border-t border-[var(--shell-border)] py-2 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={[
            "group relative flex w-full items-center gap-3 rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]",
            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
          ].join(" ")}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">
            {collapsed ? "left_panel_open" : "left_panel_close"}
          </span>
          {!collapsed && <span className="font-body text-sm font-medium">Colapsar</span>}
          {collapsed && <Tooltip label="Expandir menú" />}
        </button>
      </div>

      {/* Usuario — o los accesos a entrar, si es un visitante sin cuenta */}
      <div className={`shrink-0 border-t border-[var(--shell-border)] pb-4 pt-3 ${collapsed ? "px-2" : "px-3"}`}>
        {usuario ? (
          <>
            <div className={`group relative flex cursor-pointer items-center gap-3 rounded-lg transition-colors hover:bg-[var(--shell-hover)] ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 font-headline text-xs font-extrabold text-[var(--shell-accent-fg)]">
                {usuario.iniciales}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 leading-none">
                    <p className="truncate text-xs font-semibold text-[var(--shell-fg)]">
                      {usuario.nombre}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--shell-fg-dim)]">
                      {usuario.detalle}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-[var(--shell-fg-dim)] transition-colors group-hover:text-[var(--shell-fg-muted)]">
                    unfold_more
                  </span>
                </>
              )}
              {collapsed && <Tooltip label={usuario.nombre} />}
            </div>

            <LogoutButton
              collapsed={collapsed}
              tooltip={<Tooltip label="Cerrar sesión" />}
            />
          </>
        ) : (
          <div className={collapsed ? "space-y-1" : "space-y-2"}>
            <Link
              href="/login"
              className={[
                "group relative flex items-center gap-3 rounded-lg bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
              ].join(" ")}
            >
              <span className="material-symbols-outlined shrink-0 text-[20px]">
                login
              </span>
              {!collapsed && (
                <span className="font-body text-sm font-medium">
                  Iniciar sesión
                </span>
              )}
              {collapsed && <Tooltip label="Iniciar sesión" />}
            </Link>

            {/* Colapsada queda solo el de entrar: dos íconos parecidos sin
                texto no se distinguen, y desde el login se llega al registro. */}
            {!collapsed && (
              <Link
                href="/register"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
              >
                <span className="material-symbols-outlined shrink-0 text-[20px]">
                  person_add
                </span>
                <span className="font-body text-sm font-medium">
                  Crear cuenta
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
