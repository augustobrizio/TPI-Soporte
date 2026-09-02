"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronsUpDown,
  Clock,
  Contact,
  FolderOpen,
  Gauge,
  House,
  LogIn,
  Megaphone,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { LogoutButton } from "@/features/auth/LogoutButton";
import { LogoUTNHub } from "./LogoUTNHub";
import { useSidebar } from "./SidebarContext";

/**
 * `true` de `lg` para arriba, el mismo corte que usan las clases `lg:` del
 * shell. Hace falta en JS —y no solo en CSS— porque el modo compacto no es
 * cuestion de ancho sino de que se renderiza: con la barra colapsada se
 * ocultan los textos y aparecen tooltips. Sin esto, un usuario que colapso la
 * barra en la compu abriria el drawer del celular en 256px de ancho pero sin
 * un solo texto adentro.
 */
function useEsEscritorio() {
  const [esEscritorio, setEsEscritorio] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setEsEscritorio(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return esEscritorio;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Inicio",       icon: House,        href: "/"          },
  { label: "Chatbot",      icon: Bot,          href: "/chat"      },
  { label: "Calendario",   icon: CalendarDays, href: "/calendario"},
  { label: "Materias",     icon: Network,      href: "/materias"  },
  { label: "Material",     icon: FolderOpen,   href: "/material"  },
  { label: "Horarios",     icon: Clock,        href: "/horarios"  },
  { label: "Comisiones",   icon: Users,        href: "/comisiones"},
  { label: "Novedades",    icon: Megaphone,    href: "/novedades" },
  { label: "Profesores",   icon: Contact,      href: "/profesores"},
  { label: "Perfil",       icon: User,         href: "/perfil"    },
] as const;

function isActive(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Tooltip flotante que aparece a la derecha del ícono cuando la sidebar está colapsada.
 *
 * Aparece con el mouse **y con el foco de teclado**: colapsada, el único
 * texto de cada item es este tooltip, así que si sólo respondiera al hover,
 * quien navega con Tab recorría diez íconos sin nombre. El `aria-label` ya
 * cubría al lector de pantalla; esto cubre al que ve la pantalla y no usa
 * mouse. `group-focus-visible` y no `group-focus`: al hacer click el item
 * también queda enfocado, y el tooltip se quedaba pegado después de navegar. */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-[var(--shell-panel)] border border-[var(--shell-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--shell-fg)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
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
export function Sidebar({
  usuario,
  esAdmin = false,
}: {
  usuario: UsuarioSidebar | null;
  /** Muestra los accesos de administración (ej. huecos del chatbot). */
  esAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();
  const esEscritorio = useEsEscritorio();

  // Colapsar es una preferencia de escritorio: el drawer del celular se abre
  // siempre completo.
  const compacto = collapsed && esEscritorio;

  // Al navegar se cierra solo. Sin esto, tocar una seccion deja el menu
  // abierto tapando justo lo que se acaba de abrir.
  useEffect(() => {
    closeMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Fondo que atrapa el toque para cerrar. Solo existe con el drawer
          abierto, asi no bloquea clicks en escritorio. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          // z alto solo en mobile: el drawer tapa el TopNav (z-50). En
          // escritorio vuelve a z-40, que es como estaba, y el TopNav sigue
          // pasando por encima del header de la barra.
          "fixed left-0 top-0 z-[60] flex h-screen flex-col border-r border-[var(--shell-border)] bg-[var(--shell-panel)] lg:z-40",
          // Mobile: ancho fijo y entra/sale deslizando.
          "w-64 transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Escritorio: siempre visible, y el ancho lo manda `collapsed`.
          "lg:translate-x-0 lg:w-[var(--sb-w)] lg:transition-[width]",
        ].join(" ")}
        style={{ "--sb-w": compacto ? "64px" : "256px" } as React.CSSProperties}
      >
      {/* Logo — alineado con el TopNav (h-16) */}
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--shell-border)] ${compacto ? "justify-center px-0" : "gap-3 px-5"}`}>
        <LogoUTNHub size={36} className="shrink-0" />
        {!compacto && (
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

      {/* Navegacion.
          - Colapsada NO recorta overflow, si no los tooltips quedarian
            cortados contra el borde de la barra.
          - Expandida scrollea, pero con la barra de scroll oculta
            (`sin-scrollbar`): aparecia una barra gris permanente al costado
            de los modulos que ensuciaba toda la columna. Los items entran
            enteros en cualquier pantalla normal; el scroll queda como red de
            seguridad para ventanas muy bajas. */}
      <nav className={`flex-1 space-y-px pb-2 pt-3 ${compacto ? "overflow-visible px-2" : "sin-scrollbar overflow-y-auto overflow-x-hidden px-3"}`}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group relative flex items-center gap-3 rounded-lg transition-colors duration-150",
                compacto ? "justify-center px-0 py-2" : "px-3 py-2",
                active
                  ? "bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
                  : "text-[var(--shell-fg-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]",
              ].join(" ")}
            >
              {/* Accent pill del item activo (solo expandido) */}
              {active && !compacto && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#1CA4DF]" />
              )}
              <item.icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2.25 : 1.75}
              />
              {!compacto && <span className="font-body text-sm font-medium">{item.label}</span>}
              {compacto && <Tooltip label={item.label} />}
            </Link>
          );
        })}

        {/* Sección admin: sólo para cuentas con rol admin. */}
        {esAdmin && (
          <>
            <div className={`my-2 border-t border-[var(--shell-border)] ${compacto ? "mx-2" : "mx-3"}`} />
            <Link
              href="/admin/chatbot"
              className={[
                "group relative flex items-center gap-3 rounded-lg transition-colors duration-150",
                compacto ? "justify-center px-0 py-2" : "px-3 py-2",
                isActive(pathname, "/admin/chatbot")
                  ? "bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
                  : "text-[var(--shell-fg-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]",
              ].join(" ")}
            >
              <Gauge className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!compacto && (
                <span className="font-body text-sm font-medium">Huecos del chatbot</span>
              )}
              {compacto && <Tooltip label="Huecos del chatbot" />}
            </Link>
          </>
        )}
      </nav>

      {/* Toggle colapsar */}
      {/* Colapsar es solo de escritorio: en el drawer no tiene sentido y el
          lugar lo necesitan los modulos. */}
      <div className={`hidden shrink-0 border-t border-[var(--shell-border)] py-2 lg:block ${compacto ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={compacto ? "Expandir menú" : "Colapsar menú"}
          className={[
            "group relative flex w-full items-center gap-3 rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]",
            compacto ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
          ].join(" ")}
        >
          {compacto ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          )}
          {!compacto && <span className="font-body text-sm font-medium">Colapsar</span>}
          {compacto && <Tooltip label="Expandir menú" />}
        </button>
      </div>

      {/* Usuario — o los accesos a entrar, si es un visitante sin cuenta */}
      <div className={`shrink-0 border-t border-[var(--shell-border)] pb-4 pt-3 ${compacto ? "px-2" : "px-3"}`}>
        {usuario ? (
          <>
            <div className={`group relative flex cursor-pointer items-center gap-3 rounded-lg transition-colors hover:bg-[var(--shell-hover)] ${compacto ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 font-headline text-xs font-extrabold text-[var(--shell-accent-fg)]">
                {usuario.iniciales}
              </div>
              {!compacto && (
                <>
                  <div className="min-w-0 flex-1 leading-none">
                    <p className="truncate text-xs font-semibold text-[var(--shell-fg)]">
                      {usuario.nombre}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--shell-fg-dim)]">
                      {usuario.detalle}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)] transition-colors group-hover:text-[var(--shell-fg-muted)]" strokeWidth={1.75} />
                </>
              )}
              {compacto && <Tooltip label={usuario.nombre} />}
            </div>

            <LogoutButton
              collapsed={compacto}
              tooltip={<Tooltip label="Cerrar sesión" />}
            />
          </>
        ) : (
          <div className={compacto ? "space-y-1" : "space-y-2"}>
            <Link
              href="/login"
              className={[
                "group relative flex items-center gap-3 rounded-lg bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15",
                compacto ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
              ].join(" ")}
            >
              <LogIn className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!compacto && (
                <span className="font-body text-sm font-medium">
                  Iniciar sesión
                </span>
              )}
              {compacto && <Tooltip label="Iniciar sesión" />}
            </Link>

            {/* Colapsada queda solo el de entrar: dos íconos parecidos sin
                texto no se distinguen, y desde el login se llega al registro. */}
            {!compacto && (
              <Link
                href="/register"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
              >
                <UserPlus className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="font-body text-sm font-medium">
                  Crear cuenta
                </span>
              </Link>
            )}
          </div>
        )}
        </div>
      </aside>
    </>
  );
}
