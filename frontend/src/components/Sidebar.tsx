"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard",    icon: "dashboard",      href: "/"          },
  { label: "Chatbot",      icon: "smart_toy",       href: "/chat"      },
  { label: "Calendario",   icon: "calendar_month",  href: "/calendario"},
  { label: "Tareas",       icon: "checklist",       href: "/tareas"    },
  { label: "Materias",     icon: "account_tree",    href: "/materias"  },
  { label: "Horarios",     icon: "schedule",        href: "/horarios"  },
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
      className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-surface-container-highest px-2.5 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
    >
      {label}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className="h-screen fixed left-0 top-0 z-40 flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? "64px" : "256px" }}
    >
      {/* Logo — altura alineada con el TopNav (h-16) */}
      <div className={`h-16 flex items-center shrink-0 border-b border-outline-variant/10 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              hub
            </span>
          </div>
          {!collapsed && (
            <div className="leading-none">
              <p className="text-[15px] font-black font-headline tracking-tight text-on-surface">UTNHub</p>
              <p className="text-[9px] text-outline tracking-[0.14em] uppercase font-label mt-0.5">ISI · UTN FRRO</p>
            </div>
          )}
        </div>
      </div>

      {/* Navegacion — cuando está colapsada NO recortamos overflow para que los tooltips puedan salir */}
      <nav className={`flex-1 pt-5 pb-3 space-y-0.5 ${collapsed ? "px-2 overflow-visible" : "px-3 overflow-y-auto overflow-x-hidden"}`}>
        {!collapsed && (
          <p className="text-[9px] text-outline/50 uppercase tracking-[0.15em] px-3 pb-3 font-label select-none">
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
                "flex items-center gap-3 rounded-xl transition-all duration-200 group relative",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-outline hover:text-on-surface hover:bg-surface-container/70",
              ].join(" ")}
            >
              {/* Accent pill para item activo (solo expandido) */}
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-secondary shadow-[0_0_8px_rgba(125,255,162,0.6)]" />
              )}
              <span
                className={[
                  "material-symbols-outlined text-[20px] transition-transform duration-200 shrink-0",
                  active || collapsed ? "" : "group-hover:translate-x-0.5",
                ].join(" ")}
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              {!collapsed && <span className="text-sm font-medium font-body">{item.label}</span>}
              {collapsed && <Tooltip label={item.label} />}
            </Link>
          );
        })}
      </nav>

      {/* Toggle colapsar */}
      <div className={`shrink-0 border-t border-outline-variant/10 py-2 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={[
            "flex items-center gap-3 rounded-xl w-full transition-colors group relative text-outline hover:text-on-surface hover:bg-surface-container/70",
            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
          ].join(" ")}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">
            {collapsed ? "left_panel_open" : "left_panel_close"}
          </span>
          {!collapsed && <span className="text-sm font-medium font-body">Colapsar</span>}
          {collapsed && <Tooltip label="Expandir menú" />}
        </button>
      </div>

      {/* Usuario */}
      <div className={`pb-4 shrink-0 border-t border-outline-variant/10 pt-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-center gap-3 rounded-xl hover:bg-surface-container/60 cursor-pointer transition-colors group relative ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}`}>
          <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-primary font-headline font-black text-xs shrink-0">
            JR
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 leading-none">
                <p className="text-on-surface font-semibold text-xs truncate">Julian Rossi</p>
                <p className="text-outline text-[10px] truncate mt-0.5">Leg. 194.201</p>
              </div>
              <span className="material-symbols-outlined text-[16px] text-outline/50 group-hover:text-outline transition-colors">
                unfold_more
              </span>
            </>
          )}
          {collapsed && <Tooltip label="Julian Rossi" />}
        </div>
      </div>
    </aside>
  );
}
