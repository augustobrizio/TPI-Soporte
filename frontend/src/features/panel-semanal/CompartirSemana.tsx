"use client";

import { useEffect, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

import type { DiaCursada } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/**
 * El link que se comparte: la portada, anclada en esa semana.
 *
 * Antes apuntaba a una página propia de la semana. Manda mejor a la portada: el
 * panel vive ahí, y el que recibe el link cae en UTNHub entero —panel,
 * novedades, secciones— en vez de en una pantalla suelta. El `?semana=` no es
 * tracking, es lo que hace que la preview hable de esa semana y no de la actual.
 *
 * El origen sale de `window.location`, no de `SITIO_URL`: esa constante lee
 * `APP_URL`, que no es `NEXT_PUBLIC_*` y por lo tanto vale `undefined` en el
 * bundle del browser. Acá estamos en el cliente y el origen real es
 * exactamente el que el usuario tiene en la barra.
 */
function urlSemana(lunes: string): string {
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  return `${origen}/?semana=${lunes}`;
}

/**
 * El texto que acompaña al link en WhatsApp.
 *
 * La preview la arma el teléfono del que comparte leyendo las meta de la URL,
 * y puede tardar o no llegar. Por eso el mensaje ya dice lo importante —qué
 * días no se cursa— en vez de confiar en que la tarjeta cargue.
 */
function mensaje(lunes: string, dias: DiaCursada[], conUrl = true): string {
  const sin = dias.filter((d) => !d.se_cursa);
  const cabecera =
    sin.length === 0
      ? "Esta semana se cursa normal los cinco días."
      : sin
          .map((d) => {
            const i = dias.indexOf(d);
            return `${DIAS[i]}: sin cursada${d.motivo ? ` (${d.motivo})` : ""}`;
          })
          .join("\n");
  return `Semana en la UTN FRRO\n${cabecera}\n\n${urlSemana(lunes)}`;
}

export function CompartirSemana({
  lunes,
  dias,
}: {
  lunes: string;
  dias: DiaCursada[];
}) {
  const [copiado, setCopiado] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  // En un `useEffect` y no directo: `navigator.share` no existe en el render
  // del servidor, y leerlo durante el primer render del cliente rompe la
  // hidratación (el HTML del server no tiene el botón nativo).
  useEffect(() => {
    setPuedeCompartir(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  /**
   * En el celular, el selector nativo del sistema.
   *
   * `wa.me/?text=` sin destinatario abre WhatsApp pero no siempre muestra a
   * quién mandarle, y el mensaje se pierde. La Web Share API abre la hoja de
   * compartir del sistema, donde se elige WhatsApp y el contacto — que es lo
   * que uno espera al tocar "compartir" en un teléfono.
   */
  async function compartirNativo() {
    try {
      await navigator.share({
        title: "Semana en la UTN FRRO",
        text: mensaje(lunes, dias, false),
        url: urlSemana(lunes),
      });
    } catch {
      // Cancelar la hoja de compartir tira `AbortError`: no es un error que
      // haya que mostrarle a nadie.
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlSemana(lunes));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer desde acá: queda el
      // botón de WhatsApp, que no lo necesita.
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Compartir la semana"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--shell-border)] text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
      >
        <Share2 className="h-4 w-4" strokeWidth={2} />
      </PopoverTrigger>

      <PopoverContent className="w-56 p-1.5">
        {puedeCompartir && (
          <button
            onClick={compartirNativo}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--shell-fg)] transition-colors hover:bg-[var(--shell-hover)]"
          >
            <Share2 className="h-4 w-4 shrink-0" strokeWidth={2} />
            Compartir…
          </button>
        )}

        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje(lunes, dias))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[var(--shell-fg)] transition-colors hover:bg-[var(--shell-hover)]"
        >
          {/* El isotipo de WhatsApp como path: una dependencia menos y toma el
              color del tema. */}
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2m0 18.2c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2" />
          </svg>
          WhatsApp
        </a>

        <button
          onClick={copiar}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--shell-fg)] transition-colors hover:bg-[var(--shell-hover)]"
        >
          {copiado ? (
            <Check className="h-4 w-4 shrink-0 text-[var(--shell-accent-fg)]" strokeWidth={2} />
          ) : (
            <Link2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          {copiado ? "Copiado" : "Copiar link"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
