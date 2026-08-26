"use client";

/**
 * Avatar de la barra superior + menú de cuenta.
 *
 * Antes acá había un `"JR"` literal y el botón no abría nada: perfil y cerrar
 * sesión vivían sólo en la barra lateral, que en mobile es un drawer cerrado.
 * Ahora las iniciales son las del usuario real (o su foto de Google) y el
 * botón abre el menú, así las dos acciones de cuenta están donde uno las
 * busca en cualquier app.
 */

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCerrarSesion } from "@/features/auth/useCerrarSesion";

export interface UsuarioMenu {
  nombre: string;
  /** Legajo o email — la segunda línea que desambigua de quién es la cuenta. */
  detalle: string;
  iniciales: string;
  /** Foto de Google. `null` en las cuentas creadas con email + contraseña. */
  avatarUrl: string | null;
}

export function MenuCuenta({ usuario }: { usuario: UsuarioMenu }) {
  const { salir, saliendo } = useCerrarSesion();
  // Una URL de foto puede romperse (link vencido de Google, sin red). Cuando
  // pasa, se cae a las iniciales en vez de dejar el hueco del `alt`.
  const [fotoRota, setFotoRota] = useState(false);
  const mostrarFoto = Boolean(usuario.avatarUrl) && !fotoRota;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[#1CA4DF]/25 bg-[#1CA4DF]/10 font-headline text-xs font-extrabold text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/15"
          aria-label={`Cuenta de ${usuario.nombre}`}
        >
          {mostrarFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={usuario.avatarUrl as string}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setFotoRota(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            usuario.iniciales
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate text-xs font-semibold text-[var(--shell-fg)]">
            {usuario.nombre}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--shell-fg-dim)]">
            {usuario.detalle}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <User className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => {
            // Sin esto Radix cierra el menú antes de que el handler corra y
            // el estado "Saliendo..." no se llega a ver.
            e.preventDefault();
            void salir();
          }}
          disabled={saliendo}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {saliendo ? "Saliendo..." : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
