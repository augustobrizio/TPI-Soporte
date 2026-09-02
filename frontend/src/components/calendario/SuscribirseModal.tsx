"use client";

/**
 * "Agregar a mi calendario" (T11.3 del Frente 11).
 *
 * Ofrece las dos cosas, que no son la misma y la diferencia importa:
 *
 * - **Suscribirse** (con sesión): se copia una URL y se pega una sola vez en
 *   Google/Apple/Outlook. El cliente la relee solo cada varias horas, así que
 *   cuando la facultad mueve una mesa el alumno la ve movida sin hacer nada.
 * - **Descargar el .ics**: una foto del calendario de hoy. Se importa una vez
 *   y no se entera de ningún cambio posterior. Es lo único disponible sin
 *   cuenta, y alcanza para "quiero las fechas y listo".
 *
 * La URL de suscripción **es** la credencial —Google refresca sin poder
 * autenticarse—, así que la pantalla lo dice con todas las letras y ofrece
 * regenerarla.
 */

import { useState } from "react";
import { Check, Copy, Download, RefreshCw, X } from "lucide-react";

import { ApiError, getSuscripcionCalendario, regenerarSuscripcionCalendario } from "@/lib/api";

/** Route handler propio, no `/api/backend/*`: ese proxy corta con 401 sin
 *  cookie y la descarga se le ofrece también al visitante sin cuenta. */
const URL_EXPORT = "/api/calendario/export.ics";

export function SuscribirseModal({
  abierto,
  onCerrar,
  autenticado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  autenticado: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (!abierto) return null;

  async function pedirUrl(regenerar = false) {
    setCargando(true);
    setError(null);
    try {
      const r = regenerar
        ? await regenerarSuscripcionCalendario()
        : await getSuscripcionCalendario();
      setUrl(r.url);
      setCopiado(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `El backend devolvió ${err.status}.`
          : "No pude generar la URL.",
      );
    } finally {
      setCargando(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o en http sin localhost) el input sigue
      // ahí para copiar a mano: no vale la pena un error para esto.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-suscribirse"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="titulo-suscribirse"
              className="font-headline text-lg font-bold text-[var(--shell-fg)]"
            >
              Agregar a mi calendario
            </h2>
            <p className="mt-1 text-sm text-[var(--shell-fg-muted)]">
              Mesas, finales y feriados en Google, Apple u Outlook.
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-[var(--shell-fg-dim)] transition-colors hover:text-[var(--shell-fg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Suscripción ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-[var(--shell-border)] p-4">
          <h3 className="font-body text-sm font-semibold text-[var(--shell-fg)]">
            Suscribirse
            <span className="ml-2 rounded bg-[#1CA4DF]/15 px-1.5 py-0.5 font-label text-[10px] uppercase tracking-wider text-[#1CA4DF]">
              se actualiza solo
            </span>
          </h3>

          {!autenticado ? (
            <p className="mt-2 text-sm text-[var(--shell-fg-muted)]">
              Necesitás una cuenta: la URL es personal e incluye también los
              eventos que agendes vos.
            </p>
          ) : !url ? (
            <>
              <p className="mt-2 text-sm text-[var(--shell-fg-muted)]">
                Generá tu URL y pegala una sola vez. Cuando la facultad mueva
                una mesa, se te actualiza sola.
              </p>
              <button
                onClick={() => pedirUrl()}
                disabled={cargando}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1CA4DF] px-3.5 py-2 font-body text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cargando ? "Generando…" : "Generar mi URL"}
              </button>
            </>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="URL de suscripción"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3 py-2 font-mono text-xs text-[var(--shell-fg)]"
                />
                <button
                  onClick={copiar}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--shell-border)] px-3 py-2 font-body text-sm font-medium text-[var(--shell-fg)] transition-colors hover:bg-[var(--shell-canvas)]"
                >
                  {copiado ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>

              <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[var(--shell-fg-muted)]">
                <li>
                  En Google Calendar: <strong>Otros calendarios</strong> →{" "}
                  <strong>Suscribirse a un calendario</strong> →{" "}
                  <strong>Desde la URL</strong>.
                </li>
                <li>Pegá la URL y confirmá.</li>
                <li>
                  Google la relee cada varias horas. Los cambios aparecen solos,
                  aunque no al instante.
                </li>
              </ol>

              <p className="mt-4 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-canvas)] p-3 text-xs text-[var(--shell-fg-muted)]">
                Cualquiera con esta URL ve tu calendario, así que no la
                compartas. Si se te escapó, regenerala y la anterior deja de
                funcionar en el acto.
              </p>
              <button
                onClick={() => pedirUrl(true)}
                disabled={cargando}
                className="mt-2 inline-flex items-center gap-1.5 font-body text-xs font-medium text-[var(--shell-fg-dim)] transition-colors hover:text-[var(--shell-fg)] disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerar la URL
              </button>
            </>
          )}

          {error && (
            <p className="mt-3 text-sm font-medium text-[#dc2626] dark:text-[#f87171]">
              {error}
            </p>
          )}
        </section>

        {/* ── Descarga puntual ────────────────────────────────────── */}
        <section className="mt-4 rounded-xl border border-[var(--shell-border)] p-4">
          <h3 className="font-body text-sm font-semibold text-[var(--shell-fg)]">
            Descargar el archivo
          </h3>
          <p className="mt-2 text-sm text-[var(--shell-fg-muted)]">
            Un <code className="font-mono text-xs">.ics</code> con el calendario
            de hoy. Se importa una vez y no se entera de los cambios que vengan
            después.
          </p>
          <a
            href={URL_EXPORT}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--shell-border)] px-3.5 py-2 font-body text-sm font-medium text-[var(--shell-fg)] transition-colors hover:bg-[var(--shell-canvas)]"
          >
            <Download className="h-4 w-4" />
            Descargar .ics
          </a>
        </section>
      </div>
    </div>
  );
}
