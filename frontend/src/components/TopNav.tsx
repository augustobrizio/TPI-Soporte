"use client";

import Link from "next/link";
import { LogIn, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import {
  BuscadorBarra,
  BuscadorBoton,
  BuscadorProvider,
} from "./buscador/BuscadorGlobal";
import { CampanaNotificaciones } from "./CampanaNotificaciones";
import { LogoUTNHub } from "./LogoUTNHub";
import { MenuCuenta, type UsuarioMenu } from "./MenuCuenta";
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
      {esOscuro ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      )}
    </button>
  );
}

/**
 * Barra superior — lenguaje "Vercel × UTN": canvas neutro real, borders
 * hairline, acento celeste institucional e isotipo UTN.
 *
 * `usuario` viene resuelto del layout (Server Component). Es el objeto y no
 * un `autenticado: boolean` porque acá se muestran las iniciales y el nombre
 * reales: con un booleano lo único que se podía pintar era un placeholder.
 * `null` es el visitante sin cuenta.
 */
function UtnLogo() {
  return <LogoUTNHub size={36} className="shrink-0" />;
}

export function TopNav({ usuario }: { usuario: UsuarioMenu | null }) {
  const { collapsed, toggleMobile } = useSidebar();

  return (
    <BuscadorProvider>
      <nav className="fixed top-0 z-50 flex h-16 w-full items-center gap-3 border-b border-[var(--shell-border)] bg-[var(--shell-panel-blur)] px-4 backdrop-blur-xl sm:gap-4 lg:pl-0 lg:pr-6">
        {/* Unica forma de abrir los modulos en mobile: ahi la barra es un drawer
            fuera de pantalla. De `lg` para arriba esta siempre visible y sobra. */}
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] lg:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>

        {/* Logo + nombre.
            De `lg` para arriba este bloque reproduce exactamente la columna de
            la sidebar —mismo ancho (256/64px) y mismo padding interno (`px-5`
            expandida, centrado colapsada)— para que el isotipo de la barra
            quede a plomo con el del header de la sidebar, que está justo
            abajo. Con el padding del `<nav>` la diferencia era de 4px
            expandida y de 10px colapsada: poco en números, evidente en
            pantalla al ser el mismo isotipo repetido. */}
        <div
          className={[
            "flex shrink-0 items-center gap-3 transition-[width,padding] duration-200 ease-out",
            collapsed ? "lg:w-16 lg:justify-center lg:gap-0 lg:px-0" : "lg:w-64 lg:px-5",
          ].join(" ")}
        >
          <UtnLogo />
          {/* Se oculta con CSS y no con un condicional de JS porque
              `collapsed` es una preferencia **de escritorio**: colapsada en la
              compu, un condicional dejaba también al celular sin el nombre,
              donde la barra lateral es un drawer y siempre se ve completa.

              Abajo de `sm` no va: en 375px la fila —hamburger, logo, lupa,
              tema, campana y avatar— desbordaba 8px y el avatar quedaba
              cortado contra el borde. El isotipo solo alcanza para saber
              dónde estás; el avatar recortado no se puede tocar. */}
          <div
            className={`hidden leading-none sm:block ${collapsed ? "lg:hidden" : ""}`}
          >
            <span className="font-headline text-[15px] font-extrabold tracking-tight text-[var(--shell-fg)]">
              UTNHub
            </span>
            <p className="mt-0.5 font-label text-[9px] uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
              ISI · UTN FRRO
            </p>
          </div>
        </div>

        {/* Buscador — abajo de `md` no entra la barra ancha: con el hamburger,
            el logo y las acciones desbordaba. Ahí el acceso es el botón de
            lupa que está entre las acciones. */}
        <BuscadorBarra />

        <div className="flex-1" />

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <BuscadorBoton />
          <ThemeToggle />

          {/* La campana sólo existe con sesión: lo "nuevo" se calcula contra
              la última visita de un usuario concreto. Sin cuenta no hay nada
              que notificar, y una campana que no puede avisar de nada es
              justamente el control decorativo que este frente vino a sacar. */}
          {usuario && <CampanaNotificaciones />}

          {usuario ? (
            <MenuCuenta usuario={usuario} />
          ) : (
            // Sin sesion el avatar no representa a nadie: en su lugar va el
            // acceso a entrar, que es la accion que le queda al visitante.
            <Link
              href="/login"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 px-3 font-body text-sm font-semibold text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              Ingresar
            </Link>
          )}
        </div>
      </nav>
    </BuscadorProvider>
  );
}
