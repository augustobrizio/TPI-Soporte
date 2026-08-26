"use client";

/**
 * Campana de notificaciones.
 *
 * La versión anterior de este control tenía el puntito de "hay algo nuevo"
 * pintado fijo en el markup: avisaba siempre, y nunca de nada. Acá el punto
 * sale de `nuevas`, que el backend calcula contra la última vez que este
 * usuario abrió el panel (`notificacion_service`). Si no hay nada nuevo, no
 * hay punto.
 *
 * Sólo se monta con sesión: sin saber quién pregunta no hay "nuevo" posible,
 * y el endpoint devuelve 401. Para el visitante anónimo la campana no existe.
 */

import Link from "next/link";
import { Bell, CalendarClock, Megaphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  MesaNotificacion,
  NotificacionesOut,
  NovedadNotificacion,
} from "@/lib/types";

/** Arriba de esto el badge muestra "9+": el número exacto ya no informa. */
const MAXIMO_VISIBLE = 9;

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/** "hoy" / "mañana" / "en N días" — nunca "en 0 días". */
function cuandoEs(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

export function CampanaNotificaciones() {
  const [datos, setDatos] = useState<NotificacionesOut | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/notificaciones", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as NotificacionesOut;
      setDatos(json);
      setPendientes(json.nuevas);
      setError(false);
    } catch {
      // Backend caído o sesión vencida: la campana se queda muda. Mostrar un
      // error acá sería interrumpir por algo que el usuario no pidió ver.
      setError(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Al abrir: se recargan los datos (para ver lo de recién) y recién después
   * se marca como visto. El orden importa — marcar primero devolvería la
   * lista ya sin los flags `nueva` y el panel se abriría sin los resaltados
   * de lo que justamente no habías visto.
   */
  const onOpenChange = useCallback(
    (v: boolean) => {
      setAbierto(v);
      if (!v) return;
      void (async () => {
        await cargar();
        try {
          await fetch("/api/backend/notificaciones/visto", { method: "POST" });
          setPendientes(0);
        } catch {
          // Si falla, el contador queda como estaba y se reintenta al
          // próximo abrir. Nada que avisarle al usuario.
        }
      })();
    },
    [cargar],
  );

  const hayNuevas = pendientes > 0;
  const vacio =
    !error && datos !== null && datos.novedades.length === 0 && datos.mesas.length === 0;

  return (
    <Popover open={abierto} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
          aria-label={
            hayNuevas
              ? `Notificaciones (${pendientes} sin ver)`
              : "Notificaciones"
          }
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {hayNuevas && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--shell-panel)] bg-[#1CA4DF] px-[3px] font-label text-[9px] font-bold leading-none text-white">
              {pendientes > MAXIMO_VISIBLE ? `${MAXIMO_VISIBLE}+` : pendientes}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0">
        <header className="flex items-center justify-between border-b border-[var(--shell-border)] px-4 py-3">
          <h2 className="font-headline text-sm font-bold text-[var(--shell-fg)]">
            Notificaciones
          </h2>
          {hayNuevas && (
            <span className="font-label text-[10px] uppercase tracking-[0.12em] text-[var(--shell-accent-fg)]">
              {pendientes} sin ver
            </span>
          )}
        </header>

        <div className="max-h-[26rem] overflow-y-auto">
          {error ? (
            <Vacio texto="No pudimos cargar las notificaciones." />
          ) : datos === null ? (
            <Vacio texto="Cargando..." />
          ) : vacio ? (
            <Vacio texto="No hay nada nuevo por ahora." />
          ) : (
            <>
              {/* Las mesas van primero: tienen fecha de vencimiento, las
                  novedades no. */}
              {datos.mesas.length > 0 && (
                <Seccion titulo="Mesas y finales">
                  {datos.mesas.map((mesa) => (
                    <ItemMesa key={mesa.id} mesa={mesa} onIr={() => setAbierto(false)} />
                  ))}
                </Seccion>
              )}
              {datos.novedades.length > 0 && (
                <Seccion titulo="Novedades">
                  {datos.novedades.map((novedad) => (
                    <ItemNovedad
                      key={novedad.id}
                      novedad={novedad}
                      onIr={() => setAbierto(false)}
                    />
                  ))}
                </Seccion>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-[var(--shell-border)] px-4 py-2">
          <Link
            href="/novedades"
            onClick={() => setAbierto(false)}
            className="text-[11px] font-medium text-[var(--shell-fg-muted)] transition-colors hover:text-[var(--shell-accent-fg)]"
          >
            Ver todas las novedades
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--shell-border)] py-1.5 last:border-b-0">
      <p className="px-4 py-1 font-label text-[10px] uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
        {titulo}
      </p>
      {children}
    </section>
  );
}

function ItemMesa({ mesa, onIr }: { mesa: MesaNotificacion; onIr: () => void }) {
  return (
    <ItemBase
      href="/calendario"
      onIr={onIr}
      nueva={mesa.nueva}
      titulo={mesa.titulo}
      detalle={`${cuandoEs(mesa.dias_restantes)} · ${fechaCorta(mesa.fecha_inicio) ?? ""}`}
      icono={
        <CalendarClock
          className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)]"
          strokeWidth={1.75}
        />
      }
    />
  );
}

function ItemNovedad({
  novedad,
  onIr,
}: {
  novedad: NovedadNotificacion;
  onIr: () => void;
}) {
  return (
    <ItemBase
      href={`/novedades?novedad=${novedad.id}`}
      onIr={onIr}
      nueva={novedad.nueva}
      titulo={novedad.titulo}
      detalle={fechaCorta(novedad.fecha)}
      icono={
        <Megaphone
          className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)]"
          strokeWidth={1.75}
        />
      }
    />
  );
}

function ItemBase({
  href,
  onIr,
  nueva,
  titulo,
  detalle,
  icono,
}: {
  href: string;
  onIr: () => void;
  nueva: boolean;
  titulo: string;
  detalle: string | null;
  icono: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onIr}
      className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-[var(--shell-hover)]"
    >
      {icono}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug text-[var(--shell-fg)]">
          {titulo}
        </span>
        {detalle && (
          <span className="mt-0.5 block text-[11px] text-[var(--shell-fg-dim)]">
            {detalle}
          </span>
        )}
      </span>
      {/* El punto marca lo que no habías visto. Se calcula por item, no se
          pinta a todos. */}
      {nueva && (
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1CA4DF]"
          aria-label="Sin ver"
        />
      )}
    </Link>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="px-4 py-8 text-center text-[13px] text-[var(--shell-fg-dim)]">
      {texto}
    </p>
  );
}
