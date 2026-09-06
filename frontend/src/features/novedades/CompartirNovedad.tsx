"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

const VERDE_WHATSAPP = "#25D366";

/**
 * Acciones para compartir una novedad: WhatsApp y copiar el link.
 *
 * El link que se comparte es `/novedades/<id>`, la página propia de la novedad
 * — no el deep link `?novedad=<id>` de la portada. La diferencia importa: la
 * preview de WhatsApp la arma un crawler que pide el HTML y lee las meta de
 * Open Graph, y esas meta las genera `generateMetadata` de esa página con el
 * título, el resumen y el flyer de *esta* novedad. La portada solo puede
 * declarar las meta genéricas del sitio.
 *
 * La URL se arma en el click con `window.location.origin` y no con una constante
 * del servidor: así el link apunta siempre al entorno en el que está parado
 * quien comparte (dev, preview de Railway, producción). Es también la razón por
 * la que estos son `<button>` y no `<a href>` — en el render del servidor
 * todavía no hay `origin` que poner en el href, y un href que se completa
 * después de hidratar es un link roto para quien haga click rápido.
 */
export function CompartirNovedad({
  id,
  titulo,
}: {
  id: number;
  titulo: string | null;
}) {
  const [copiado, setCopiado] = useState(false);

  const url = () => `${window.location.origin}/novedades/${id}`;

  function compartirEnWhatsApp() {
    // Formato oficial de "click to chat" sin destinatario: WhatsApp abre el
    // selector de contacto con el mensaje ya escrito. El texto va URL-encoded.
    // La URL queda al final y sola en su renglón: es la que WhatsApp toma para
    // armar la preview, y el título de arriba es lo que se lee si la preview
    // no llega a cargar.
    const texto = titulo ? `${titulo}\n\n${url()}` : url();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(url());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o en http que no sea localhost) no hay
      // mucho que hacer, y no vale un cartel de error: queda el botón de
      // WhatsApp, que es el camino principal.
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--shell-border)] pt-5">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--shell-fg-dim)]">
        Compartir
      </span>

      <button
        type="button"
        onClick={compartirEnWhatsApp}
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50"
        style={{ backgroundColor: VERDE_WHATSAPP }}
      >
        <IconoWhatsApp />
        WhatsApp
      </button>

      <button
        type="button"
        onClick={copiarLink}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--shell-border)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1CA4DF]/40"
      >
        {copiado ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        {copiado ? "Copiado" : "Copiar link"}
      </button>
    </div>
  );
}

/**
 * El glifo de WhatsApp. Va inline y no como icono de `lucide-react` porque
 * lucide no incluye logos de marca — y acá el logo *es* la señal: dice a qué
 * app te manda el botón antes de leer la etiqueta.
 */
function IconoWhatsApp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}
