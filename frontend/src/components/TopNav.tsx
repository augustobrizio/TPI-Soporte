"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { useSidebar } from "./SidebarContext";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // El server no conoce el tema real (vive en localStorage) — hasta que
  // el cliente monte, mostramos un icono fijo para no romper la hidratación.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const esOscuro = montado ? resolvedTheme === "dark" : true;
  return (
    <button
      type="button"
      onClick={() => setTheme(esOscuro ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
      aria-label={esOscuro ? "Activar modo claro" : "Activar modo oscuro"}
    >
      <span className="material-symbols-outlined text-[20px]">
        {esOscuro ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}

/**
 * Barra superior — lenguaje "Vercel × UTN": canvas neutro real, borders
 * hairline, acento celeste institucional e isotipo UTN.
 */
function UtnLogo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/utn-isotipo-white.png"
        alt="UTN"
        className="h-5 w-5 object-contain opacity-90"
      />
    </div>
  );
}

export function TopNav({ autenticado = true }: { autenticado?: boolean }) {
  const { collapsed, toggleMobile } = useSidebar();
  return (
    <nav className="fixed top-0 z-50 flex h-16 w-full items-center gap-3 border-b border-[var(--shell-border)] bg-[var(--shell-panel-blur)] px-4 backdrop-blur-xl sm:gap-4 lg:px-6">
      {/* Unica forma de abrir los modulos en mobile: ahi la barra es un drawer
          fuera de pantalla. De `lg` para arriba esta siempre visible y sobra. */}
      <button
        type="button"
        onClick={toggleMobile}
        aria-label="Abrir menú"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] lg:hidden"
      >
        <span className="material-symbols-outlined text-[22px]">menu</span>
      </button>

      {/* Logo + nombre — de `lg` para arriba el ancho se alinea con la sidebar */}
      <div
        className={`flex shrink-0 items-center gap-3 transition-[width] duration-200 ease-out ${collapsed ? "lg:w-9" : "lg:w-56"}`}
      >
        <UtnLogo />
        {!collapsed && (
          <div className="leading-none">
            <span className="font-headline text-[15px] font-extrabold tracking-tight text-[var(--shell-fg)]">
              UTNHub
            </span>
            <p className="mt-0.5 font-label text-[9px] uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
              ISI · UTN FRRO
            </p>
          </div>
        )}
      </div>

      {/* Buscador — abajo de `md` no entra: con el hamburger, el logo y las
          acciones desbordaba la barra. */}
      <div className="hidden w-72 items-center gap-2 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-hover)] px-3 py-1.5 transition-colors focus-within:border-[#1CA4DF]/50 focus-within:ring-1 focus-within:ring-[#1CA4DF]/20 hover:border-[var(--shell-border)] md:flex">
        <span className="material-symbols-outlined shrink-0 text-[16px] text-[var(--shell-fg-dim)]">
          search
        </span>
        <input
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--shell-fg)] placeholder:text-[var(--shell-fg-dim)] focus:outline-none"
          placeholder="Buscar materias, profesores..."
          type="text"
        />
        <kbd className="hidden shrink-0 items-center rounded border border-[var(--shell-border)] px-1 py-0.5 font-label text-[9px] text-[var(--shell-fg-dim)] lg:inline-flex">
          ⌘K
        </kbd>
      </div>

      <div className="flex-1" />

      {/* Acciones */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
          aria-label="Notificaciones"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-[var(--shell-panel)] bg-[#1CA4DF]" />
        </button>

        {autenticado ? (
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 font-headline text-xs font-extrabold text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15"
            aria-label="Cuenta"
          >
            JR
          </button>
        ) : (
          // Sin sesion el avatar no representa a nadie: en su lugar va el
          // acceso a entrar, que es la accion que le queda al visitante.
          <Link
            href="/login"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 px-3 font-body text-sm font-semibold text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            Ingresar
          </Link>
        )}
      </div>
    </nav>
  );
}
