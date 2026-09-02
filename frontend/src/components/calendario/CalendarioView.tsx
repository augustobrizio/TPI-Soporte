"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarOff,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";

import type { EventoCalendarioCreate, EventoCalendarioOut, TipoEventoCalendario } from "@/lib/types";
import { crearEvento, actualizarEvento, eliminarEvento } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  TIPO, ROL, rolDe, impideCursada,
  type RolEvento,
  toISODate, inicioMes, sumarMeses, sumarDias, inicioSemana,
  celdasMes, diasSemana, agruparPorDia, eventoTocaMes,
  eventosFuturos, proximoImportante,
  diffDias, countdown, mesLargo, diaMes, fechaLarga, rangoEvento, capitalizar,
} from "./utils";
import { EventoModal } from "./EventoModal";
import { SuscribirseModal } from "./SuscribirseModal";

type Vista = "mes" | "semana" | "agenda";

const HOY = new Date();
const DIAS_LBL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Los filtros son por rol, no por tipo: tres opciones con sentido, no cinco. */
const FILTROS: { rol: RolEvento; label: string }[] = [
  { rol: "sin_cursada", label: "Sin cursada" },
  { rol: "propio", label: "Míos" },
  { rol: "info", label: "Institucionales" },
];
const TODOS_LOS_ROLES: RolEvento[] = ["sin_cursada", "propio", "info"];

/** Adonde mandamos al visitante sin cuenta que quiere agendar algo propio. */
const LOGIN_CALENDARIO = `/login?next=${encodeURIComponent("/calendario")}`;

function coincide(e: EventoCalendarioOut, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  const fecha = new Date(e.fecha_inicio).toLocaleDateString("es-AR", { day: "2-digit", month: "long" }).toLowerCase();
  return (
    e.titulo.toLowerCase().includes(s) ||
    TIPO[e.tipo].label.toLowerCase().includes(s) ||
    fecha.includes(s) ||
    (e.descripcion?.toLowerCase().includes(s) ?? false)
  );
}

export function CalendarioView({
  eventos: eventosProp,
  autenticado = false,
}: {
  eventos: EventoCalendarioOut[];
  /**
   * El calendario de la facultad es publico; los eventos propios no. Sin
   * sesion se ve todo igual, pero los disparadores de "crear" llevan al login
   * en vez de abrir un modal que terminaria en un 401 del backend.
   */
  autenticado?: boolean;
}) {
  const router = useRouter();
  const [eventos, setEventos] = useState(eventosProp);
  const [vista, setVista] = useState<Vista>("mes");
  const [visibles, setVisibles] = useState<Set<RolEvento>>(() => new Set(TODOS_LOS_ROLES));
  const [query, setQuery] = useState("");
  const [ancla, setAncla] = useState<Date>(() => inicioMes(HOY));
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [modal, setModal] = useState<{ modo: "crear" | "editar"; evento?: EventoCalendarioOut; fecha?: string; plantilla?: { titulo?: string; tipo?: TipoEventoCalendario } } | null>(null);
  const [suscribirseAbierto, setSuscribirseAbierto] = useState(false);

  // Mobile → Agenda por defecto
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setVista("agenda");
  }, []);

  const prevRef = useRef(eventosProp);
  useEffect(() => {
    if (prevRef.current !== eventosProp) { prevRef.current = eventosProp; setEventos(eventosProp); }
  }, [eventosProp]);

  const visiblesArr = useMemo(
    () => eventos.filter((e) => visibles.has(TIPO[e.tipo].rol) && coincide(e, query)),
    [eventos, visibles, query],
  );
  const futuros = useMemo(() => eventosFuturos(eventos), [eventos]);
  const futurosVisibles = useMemo(() => eventosFuturos(visiblesArr), [visiblesArr]);
  // Con búsqueda activa mostramos todo lo que matchea (no solo lo futuro),
  // ordenado cronológicamente.
  const agendaEventos = useMemo(
    () =>
      query
        ? [...visiblesArr].sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
        : futurosVisibles,
    [query, visiblesArr, futurosVisibles],
  );
  const importante = useMemo(() => proximoImportante(eventos), [eventos]);

  const eventosMes = useMemo(() => eventos.filter((e) => eventoTocaMes(e, ancla)).length, [eventos, ancla]);
  const porDiaVisible = useMemo(() => agruparPorDia(visiblesArr), [visiblesArr]);
  const eventosDia = useMemo(() => (diaSel ? porDiaVisible.get(diaSel) ?? [] : []), [diaSel, porDiaVisible]);

  // Al tipear cambiamos a agenda: los resultados no dependen del mes anclado.
  const handleSearch = (q: string) => {
    setQuery(q);
    if (q) { setVista("agenda"); setDiaSel(null); }
  };

  const nav = (dir: -1 | 1) => { setDiaSel(null); setAncla((a) => (vista === "semana" ? sumarDias(a, dir * 7) : sumarMeses(a, dir))); };
  const irHoy = () => { setDiaSel(null); setAncla(vista === "semana" ? inicioSemana(HOY) : inicioMes(HOY)); };

  // CRUD
  async function submitEvento(p: EventoCalendarioCreate) {
    if (modal?.modo === "editar" && modal.evento) {
      const upd = await actualizarEvento(modal.evento.id, p);
      setEventos((es) => es.map((e) => (e.id === upd.id ? upd : e)));
    } else {
      const nuevo = await crearEvento(p);
      setEventos((es) => [...es, nuevo]);
    }
  }
  async function eliminarEventoActual() {
    if (!modal?.evento) return;
    const id = modal.evento.id;
    await eliminarEvento(id);
    setEventos((es) => es.filter((e) => e.id !== id));
  }

  const onEditar = (e: EventoCalendarioOut) => setModal({ modo: "editar", evento: e });

  const onEvento = (e: EventoCalendarioOut) => {
    if (vista === "agenda") {
      const d = new Date(e.fecha_inicio);
      setQuery("");
      setVista("mes");
      setAncla(inicioMes(d));
      setDiaSel(toISODate(d));
    } else if (e.origen === "usuario") {
      setModal({ modo: "editar", evento: e });
    } else {
      setDiaSel(toISODate(new Date(e.fecha_inicio)));
    }
  };
  const onSelDia = (iso: string) => setDiaSel((d) => (d === iso ? null : iso));
  /** Abre el modal de alta, o manda al login si el visitante no tiene cuenta. */
  const abrirCrear = (cfg: { fecha?: string; plantilla?: { titulo?: string; tipo?: TipoEventoCalendario } } = {}) => {
    if (!autenticado) { router.push(LOGIN_CALENDARIO); return; }
    setModal({ modo: "crear", ...cfg });
  };
  const onCrearDia = (iso: string) => abrirCrear({ fecha: iso });

  const toggleRol = (r: RolEvento) => setVisibles((s) => {
    if (s.size === TODOS_LOS_ROLES.length) return new Set([r]);    // aislar
    if (s.size === 1 && s.has(r)) return new Set(TODOS_LOS_ROLES); // restaurar
    const n = new Set(s);
    if (n.has(r)) n.delete(r); else n.add(r);
    return n.size === 0 ? new Set(TODOS_LOS_ROLES) : n;
  });

  const titulo = vista === "semana" ? rangoSemanaLabel(ancla) : vista === "agenda" ? "Agenda" : mesLargo(ancla);
  const subtitulo = query
    ? `${agendaEventos.length} resultado${agendaEventos.length === 1 ? "" : "s"}`
    : vista === "agenda"
      ? `${futuros.length} evento${futuros.length === 1 ? "" : "s"} por delante`
      : `${eventosMes} evento${eventosMes === 1 ? "" : "s"} este mes`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
      {/* ── Encabezado ──────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
            Calendario académico
          </p>
          <h1 className="mt-1.5 font-headline text-[26px] font-extrabold leading-none tracking-tight text-[var(--shell-fg)] md:text-[30px]">
            {titulo}
          </h1>
          <p className="mt-2 text-sm text-[var(--shell-fg-muted)]">{subtitulo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BuscadorEventos value={query} onChange={handleSearch} />
          {/* Secundario respecto de "Nuevo evento": exportar es algo que se
              hace una vez, agendar es lo de todos los días. */}
          <button
            onClick={() => setSuscribirseAbierto(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--shell-border)] px-3.5 py-2 font-body text-sm font-medium text-[var(--shell-fg)] transition-colors duration-150 hover:bg-[var(--shell-panel)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2} />
            Agregar a mi calendario
          </button>
          <button
            onClick={() => abrirCrear({ fecha: diaSel ?? toISODate(HOY) })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1CA4DF] px-4 py-2 font-body text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuevo evento
          </button>
        </div>
      </header>

      <SuscribirseModal
        abierto={suscribirseAbierto}
        onCerrar={() => setSuscribirseAbierto(false)}
        autenticado={autenticado}
      />

      {/* ── Controles: vistas · navegación · filtros ────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--shell-border)] pb-4">
        <div className="flex items-center gap-2">
          <SelectorVista vista={vista} onChange={(v) => { setVista(v); setDiaSel(null); }} />
          {vista !== "agenda" && (
            <div className="flex items-center gap-0.5">
              <BotonIcono onClick={() => nav(-1)} label={vista === "semana" ? "Semana anterior" : "Mes anterior"}>
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </BotonIcono>
              <button
                onClick={irHoy}
                className="rounded-lg px-2.5 py-1.5 font-label text-xs font-semibold text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
              >
                Hoy
              </button>
              <BotonIcono onClick={() => nav(1)} label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}>
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </BotonIcono>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map(({ rol, label }) => {
            const on = visibles.has(rol);
            return (
              <button
                key={rol}
                onClick={() => toggleRol(rol)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label text-[11px] font-semibold transition-colors",
                  on
                    ? cn(ROL[rol].bg, ROL[rol].borde, ROL[rol].fg)
                    : "border-[var(--shell-border)] text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", on ? ROL[rol].punto : "bg-[var(--shell-fg-dim)]/40")} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cuerpo ──────────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {vista === "mes" && <GrillaMes ancla={ancla} porDia={porDiaVisible} diaSel={diaSel} onSelDia={onSelDia} onEvento={onEvento} onCrear={onCrearDia} />}
          {vista === "semana" && <GrillaSemana ancla={ancla} porDia={porDiaVisible} diaSel={diaSel} onSelDia={onSelDia} onEvento={onEvento} onCrear={onCrearDia} />}
          {vista === "agenda" && <ListaAgenda eventos={agendaEventos} onEvento={onEvento} onEditar={onEditar} query={query} />}
        </section>

        <aside className="min-w-0">
          {diaSel ? (
            <PanelDia
              fechaISO={diaSel}
              eventos={eventosDia}
              onAgregar={() => abrirCrear({ fecha: diaSel })}
              onEditar={(e) => setModal({ modo: "editar", evento: e })}
              onRendir={(e) => abrirCrear({ fecha: toISODate(new Date(e.fecha_inicio)), plantilla: { titulo: e.titulo, tipo: "examen" } })}
              onCerrar={() => setDiaSel(null)}
            />
          ) : (
            <PanelProximo evento={importante} />
          )}
        </aside>
      </div>

      {modal && (
        <EventoModal modo={modal.modo} evento={modal.evento} fechaInicial={modal.fecha} plantilla={modal.plantilla} onSubmit={submitEvento} onEliminar={modal.modo === "editar" ? eliminarEventoActual : undefined} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ── Controles ───────────────────────────────────────────────────────────────

function BuscadorEventos({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 sm:w-64 sm:flex-none">
      <Search className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)]" strokeWidth={2} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar en el calendario"
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--shell-fg)] outline-none placeholder:text-[var(--shell-fg-dim)]"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="shrink-0 text-[var(--shell-fg-dim)] transition-colors hover:text-[var(--shell-fg)]">
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function SelectorVista({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-[var(--shell-border)] p-0.5" role="tablist">
      {(["mes", "semana", "agenda"] as Vista[]).map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={vista === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1 font-label text-xs font-semibold capitalize transition-colors",
            vista === v
              ? "bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
              : "text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function BotonIcono({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
    >
      {children}
    </button>
  );
}

// ── Vista MES ───────────────────────────────────────────────────────────────

interface PropsGrilla {
  ancla: Date;
  porDia: Map<string, EventoCalendarioOut[]>;
  diaSel: string | null;
  onSelDia: (iso: string) => void;
  onEvento: (e: EventoCalendarioOut) => void;
  onCrear: (iso: string) => void;
}

function GrillaMes({ ancla, porDia, diaSel, onSelDia, onEvento, onCrear }: PropsGrilla) {
  const celdas = celdasMes(ancla);
  const hoyKey = toISODate(HOY);
  const mesActual = ancla.getMonth();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)]">
      <div className="grid grid-cols-7 border-b border-[var(--shell-border)]">
        {DIAS_LBL.map((d) => (
          <div key={d} className="py-2 text-center font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {celdas.map((dia, i) => {
          const key = toISODate(dia);
          const delDia = porDia.get(key) ?? [];
          const esMes = dia.getMonth() === mesActual;
          const esHoy = key === hoyKey;
          const sel = key === diaSel;
          const finde = i % 7 >= 5;
          // La señal más fuerte de la grilla: este día no se cursa.
          const sinCursada = delDia.some(impideCursada);

          return (
            <div
              key={key}
              onClick={() => onSelDia(key)}
              onDoubleClick={() => onCrear(key)}
              title="Clic para ver el día · doble clic para agregar"
              className={cn(
                "min-h-[104px] cursor-pointer select-none border-b border-r border-[var(--shell-border)] p-2 transition-colors",
                "[&:nth-child(7n)]:border-r-0",
                sinCursada ? "bg-[var(--cal-alerta-bg)]" : finde ? "bg-[var(--shell-hover)]" : "",
                sel && "ring-1 ring-inset ring-[#1CA4DF]",
                !esMes && "opacity-40",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 font-headline text-xs font-bold tabular-nums",
                    esHoy ? "bg-[#1CA4DF] text-white" : "text-[var(--shell-fg)]",
                  )}
                >
                  {dia.getDate()}
                </span>
                {sinCursada && (
                  <CalendarOff className="h-3 w-3 shrink-0 text-[var(--cal-alerta-fg)]" strokeWidth={2} aria-label="Sin cursada" />
                )}
              </div>

              {/* Dos eventos y no tres: con el título en dos líneas se lee
                  entero, que es lo que el alumno vino a buscar. El resto está
                  a un clic, en el panel del día. */}
              <div className="space-y-0.5">
                {delDia.slice(0, 2).map((e) => (
                  <FilaEvento key={e.id} evento={e} onClick={() => onEvento(e)} />
                ))}
                {delDia.length > 2 && (
                  <p className="pl-1 font-label text-[10px] text-[var(--shell-fg-dim)]">+{delDia.length - 2} más</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Una línea de evento dentro de una celda: punto de color + título legible. */
function FilaEvento({ evento, onClick }: { evento: EventoCalendarioOut; onClick: () => void }) {
  const rol = rolDe(evento.tipo);
  return (
    <button
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      onDoubleClick={(ev) => ev.stopPropagation()}
      title={evento.titulo}
      className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--shell-hover)]"
    >
      <span className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", rol.punto)} />
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-[var(--shell-fg-muted)]">
        {evento.titulo}
      </span>
    </button>
  );
}

// ── Vista SEMANA ────────────────────────────────────────────────────────────

function GrillaSemana({ ancla, porDia, diaSel, onSelDia, onEvento, onCrear }: PropsGrilla) {
  const dias = diasSemana(ancla);
  const hoyKey = toISODate(HOY);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {dias.map((dia, i) => {
        const key = toISODate(dia);
        const delDia = porDia.get(key) ?? [];
        const esHoy = key === hoyKey;
        const sel = key === diaSel;
        const sinCursada = delDia.some(impideCursada);

        return (
          <div
            key={key}
            onClick={() => onSelDia(key)}
            onDoubleClick={() => onCrear(key)}
            className={cn(
              "flex min-h-[180px] cursor-pointer select-none flex-col rounded-xl border p-2.5 transition-colors",
              sinCursada
                ? "border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)]"
                : "border-[var(--shell-border)] bg-[var(--shell-panel)]",
              sel && "ring-1 ring-inset ring-[#1CA4DF]",
            )}
          >
            <div className="mb-2 flex items-baseline gap-1.5">
              <span className="font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
                {DIAS_LBL[i]}
              </span>
              <span
                className={cn(
                  "font-headline text-lg font-bold leading-none tabular-nums",
                  esHoy ? "text-[var(--shell-accent-fg)]" : "text-[var(--shell-fg)]",
                )}
              >
                {dia.getDate()}
              </span>
            </div>

            {sinCursada && (
              <p className="mb-2 inline-flex items-center gap-1 font-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cal-alerta-fg)]">
                <CalendarOff className="h-3 w-3" strokeWidth={2} />
                Sin cursada
              </p>
            )}

            <div className="flex-1 space-y-1.5">
              {delDia.length === 0 ? (
                <p className="text-[11px] text-[var(--shell-fg-dim)]">Sin eventos</p>
              ) : (
                delDia.map((e) => {
                  const rol = rolDe(e.tipo);
                  const { Icono } = TIPO[e.tipo];
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEvento(e); }}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      className={cn("flex w-full items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left", rol.bg, rol.borde)}
                    >
                      <Icono className={cn("mt-px h-3 w-3 shrink-0", rol.fg)} strokeWidth={2} />
                      <span className="text-[11px] font-medium leading-snug text-[var(--shell-fg)]">{e.titulo}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Vista AGENDA ────────────────────────────────────────────────────────────

function ListaAgenda({ eventos, onEvento, onEditar, query }: { eventos: EventoCalendarioOut[]; onEvento: (e: EventoCalendarioOut) => void; onEditar: (e: EventoCalendarioOut) => void; query: string }) {
  if (eventos.length === 0) {
    return <VacioCard texto={query ? `Sin resultados para “${query}”.` : "No hay eventos próximos."} />;
  }

  const grupos = new Map<string, EventoCalendarioOut[]>();
  for (const e of eventos) {
    const k = toISODate(new Date(e.fecha_inicio));
    const arr = grupos.get(k) ?? [];
    arr.push(e);
    grupos.set(k, arr);
  }

  return (
    <div className="space-y-5">
      {[...grupos.entries()].map(([iso, evs]) => {
        const n = diffDias(iso);
        const { dia, mes } = diaMes(iso);
        const esHoy = n === 0;
        const sinCursada = evs.some(impideCursada);

        return (
          <div key={iso} className="flex gap-4">
            <div className="w-12 shrink-0 pt-0.5 text-center">
              <p className={cn("font-headline text-2xl font-extrabold leading-none tabular-nums", esHoy ? "text-[var(--shell-accent-fg)]" : "text-[var(--shell-fg)]")}>
                {dia}
              </p>
              <p className="mt-1 font-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--shell-fg-dim)]">{mes}</p>
              <p className="mt-1.5 font-label text-[10px] text-[var(--shell-fg-dim)]">{countdown(n)}</p>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              {sinCursada && (
                <p className="inline-flex items-center gap-1.5 font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cal-alerta-fg)]">
                  <CalendarOff className="h-3 w-3" strokeWidth={2} />
                  Este día no se cursa
                </p>
              )}
              {evs.map((e) => {
                const rol = rolDe(e.tipo);
                const { Icono, label } = TIPO[e.tipo];
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEvento(e)}
                    onKeyDown={(ev) => ev.key === "Enter" && onEvento(e)}
                    className="cursor-pointer rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-3 transition-colors hover:border-[#1CA4DF]/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", rol.bg, rol.borde)}>
                        <Icono className={cn("h-3.5 w-3.5", rol.fg)} strokeWidth={2} />
                      </span>
                      <p className="min-w-0 flex-1 truncate font-headline text-sm font-bold text-[var(--shell-fg)]">{e.titulo}</p>
                      {e.origen === "usuario" && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); onEditar(e); }}
                          aria-label={`Editar ${e.titulo}`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--shell-fg-dim)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      )}
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-[0.08em]", rol.bg, rol.borde, rol.fg)}>
                        {label}
                      </span>
                    </div>
                    <p className="mt-1.5 pl-8 text-xs text-[var(--shell-fg-muted)]">{rangoEvento(e)}</p>
                    {e.descripcion && (
                      <p className="mt-1 line-clamp-2 pl-8 text-xs text-[var(--shell-fg-dim)]">{e.descripcion}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Panel derecho ───────────────────────────────────────────────────────────

function PanelProximo({ evento }: { evento: EventoCalendarioOut | null }) {
  if (!evento) return <VacioCard texto="No hay próximos eventos." />;

  const { Icono, label } = TIPO[evento.tipo];
  const rol = rolDe(evento.tipo);
  const n = diffDias(toISODate(new Date(evento.fecha_inicio)));

  return (
    <section className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-5">
      <p className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
        Lo próximo
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border", rol.bg, rol.borde)}>
          <Icono className={cn("h-3.5 w-3.5", rol.fg)} strokeWidth={2} />
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-[0.08em]", rol.bg, rol.borde, rol.fg)}>
          {label}
        </span>
      </div>

      <h2 className="mt-3 font-headline text-lg font-bold leading-tight text-[var(--shell-fg)]">{evento.titulo}</h2>
      <p className="mt-1.5 text-sm text-[var(--shell-fg-muted)]">{rangoEvento(evento)}</p>

      <div className="mt-4 flex items-baseline gap-2 border-t border-[var(--shell-border)] pt-4">
        <span className="font-headline text-[32px] font-extrabold leading-none tabular-nums text-[var(--shell-fg)]">
          {n <= 0 ? (n === 0 ? "Hoy" : "—") : n}
        </span>
        {n > 0 && <span className="text-sm text-[var(--shell-fg-muted)]">{n === 1 ? "día" : "días"}</span>}
      </div>
    </section>
  );
}

function PanelDia({ fechaISO, eventos, onAgregar, onEditar, onRendir, onCerrar }: { fechaISO: string; eventos: EventoCalendarioOut[]; onAgregar: () => void; onEditar: (e: EventoCalendarioOut) => void; onRendir: (e: EventoCalendarioOut) => void; onCerrar: () => void }) {
  const sinCursada = eventos.some(impideCursada);

  return (
    <section className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--shell-fg-muted)]">
          {fechaLarga(fechaISO)}
        </p>
        <button
          onClick={onCerrar}
          aria-label="Cerrar el detalle del día"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--shell-fg-dim)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {sinCursada && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)] px-2.5 py-1.5 font-label text-[11px] font-semibold text-[var(--cal-alerta-fg)]">
          <CalendarOff className="h-3.5 w-3.5" strokeWidth={2} />
          Este día no se cursa
        </p>
      )}

      <div className="mt-4 space-y-2">
        {eventos.length === 0 ? (
          <p className="text-sm text-[var(--shell-fg-muted)]">Día sin eventos.</p>
        ) : (
          eventos.map((e) => {
            const editable = e.origen === "usuario";
            const rol = rolDe(e.tipo);
            const { Icono } = TIPO[e.tipo];
            return (
              <div key={e.id} className={cn("rounded-lg border p-3", rol.bg, rol.borde)}>
                <div className="flex items-center gap-2">
                  <Icono className={cn("h-3.5 w-3.5 shrink-0", rol.fg)} strokeWidth={2} />
                  <p className="min-w-0 flex-1 font-headline text-[13px] font-bold text-[var(--shell-fg)]">{e.titulo}</p>
                  {editable && (
                    <button
                      onClick={() => onEditar(e)}
                      aria-label={`Editar ${e.titulo}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--shell-fg-dim)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
                {e.descripcion && <p className="mt-1.5 text-xs text-[var(--shell-fg-muted)]">{e.descripcion}</p>}
                {e.tipo === "mesa" && (
                  <button
                    onClick={() => onRendir(e)}
                    className="mt-2.5 w-full rounded-lg border border-[#1CA4DF]/30 bg-[#1CA4DF]/10 py-1.5 font-label text-[11px] font-semibold text-[var(--shell-accent-fg)] transition-colors hover:bg-[#1CA4DF]/20"
                  >
                    Anotar que rindo
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={onAgregar}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--shell-border)] py-2 font-label text-xs font-semibold text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Agregar evento este día
      </button>
    </section>
  );
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

function VacioCard({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-5 py-10 text-center">
      <p className="text-sm text-[var(--shell-fg-muted)]">{texto}</p>
    </div>
  );
}

function rangoSemanaLabel(ancla: Date): string {
  const ini = inicioSemana(ancla);
  const fin = sumarDias(ini, 6);
  const f = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return capitalizar(`${f(ini)} – ${f(fin)}`);
}
