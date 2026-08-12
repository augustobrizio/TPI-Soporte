"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { EventoCalendarioCreate, EventoCalendarioOut, TipoEventoCalendario } from "@/lib/types";
import { crearEvento, actualizarEvento, eliminarEvento } from "@/lib/api";
import {
  TIPO, ORDEN_TIPOS,
  toISODate, inicioMes, sumarMeses, sumarDias, inicioSemana,
  celdasMes, diasSemana, agruparPorDia, eventoTocaMes,
  eventosFuturos, proximoImportante,
  diffDias, countdown, mesLargo, diaMes, fechaLarga, rangoEvento, capitalizar,
} from "./utils";
import { EventoModal } from "./EventoModal";

type Vista = "mes" | "semana" | "agenda";

const HOY = new Date();
const DIAS_LBL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Métricas del dashboard (los exámenes son los del alumno)
const METRICAS: { tipo: TipoEventoCalendario; label: string }[] = [
  { tipo: "examen", label: "Exámenes" },
  { tipo: "trabajo_practico", label: "TPs" },
  { tipo: "mesa", label: "Mesas" },
  { tipo: "evento", label: "Eventos" },
  { tipo: "feriado", label: "Feriados" },
];

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

// Orden de prioridad para el borde coloreado de cada celda de día.
const PRIORIDAD_BORDER: TipoEventoCalendario[] = [
  "examen", "trabajo_practico", "mesa", "evento", "feriado",
];

/**
 * Devuelve el box-shadow que dibuja el(los) borde(s) de color de una celda.
 * - 1 tipo → borde simple de 1.5 px
 * - 2+ tipos → anillo interior del tipo más importante + anillo exterior del siguiente
 */
function calcBorderShadow(eventos: EventoCalendarioOut[]): string | undefined {
  const presentes = PRIORIDAD_BORDER.filter((t) => eventos.some((e) => e.tipo === t));
  if (presentes.length === 0) return undefined;
  const [p1, p2] = presentes;
  const s1 = `inset 0 0 0 1.5px rgba(${TIPO[p1].rgb},0.85)`;
  if (!p2) return s1;
  return `${s1}, inset 0 0 0 3px rgba(${TIPO[p2].rgb},0.6)`;
}

export function CalendarioView({ eventos: eventosProp }: { eventos: EventoCalendarioOut[] }) {
  const [eventos, setEventos] = useState(eventosProp);
  const [vista, setVista] = useState<Vista>("mes");
  const [visibles, setVisibles] = useState<Set<TipoEventoCalendario>>(() => new Set(ORDEN_TIPOS));
  const [horizonte, setHorizonte] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [ancla, setAncla] = useState<Date>(() => inicioMes(HOY));
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [modal, setModal] = useState<{ modo: "crear" | "editar"; evento?: EventoCalendarioOut; fecha?: string; plantilla?: { titulo?: string; tipo?: TipoEventoCalendario } } | null>(null);

  // Mobile → Agenda por defecto
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setVista("agenda");
  }, []);

  const prevRef = useRef(eventosProp);
  useEffect(() => {
    if (prevRef.current !== eventosProp) { prevRef.current = eventosProp; setEventos(eventosProp); }
  }, [eventosProp]);

  const visiblesArr = useMemo(() => eventos.filter((e) => {
    if (!visibles.has(e.tipo)) return false;
    if (!coincide(e, query)) return false;
    if (horizonte !== null) {
      const n = diffDias(toISODate(new Date(e.fecha_inicio)));
      return n >= 0 && n <= horizonte;
    }
    return true;
  }), [eventos, visibles, query, horizonte]);
  const futuros = useMemo(() => eventosFuturos(eventos), [eventos]);
  const futurosVisibles = useMemo(() => eventosFuturos(visiblesArr), [visiblesArr]);
  // Cuando hay búsqueda activa mostramos todos los eventos que matchean (no solo futuros)
  // y los ordenamos cronológicamente.
  const agendaEventos = useMemo(
    () =>
      query
        ? [...visiblesArr].sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
        : futurosVisibles,
    [query, visiblesArr, futurosVisibles],
  );
  const importante = useMemo(() => proximoImportante(eventos), [eventos]);

  const conteos = useMemo(() => {
    const lim = horizonte ?? 30;
    const c: Record<string, number> = {};
    for (const m of METRICAS) {
      c[m.tipo] = eventos.filter((e) => {
        const n = diffDias(toISODate(new Date(e.fecha_inicio)));
        return n >= 0 && n <= lim && e.tipo === m.tipo;
      }).length;
    }
    return c;
  }, [eventos, horizonte]);

  const eventosMes = useMemo(() => eventos.filter((e) => eventoTocaMes(e, ancla)).length, [eventos, ancla]);
  const eventosDia = useMemo(() => (diaSel ? agruparPorDia(visiblesArr).get(diaSel) ?? [] : []), [diaSel, visiblesArr]);

  // Al tipear en el buscador cambiamos a agenda para que los resultados siempre sean visibles,
  // independientemente del mes que esté anclado en el calendario.
  const handleSearch = (q: string) => {
    setQuery(q);
    if (q) { setVista("agenda"); setDiaSel(null); }
  };

  const nav = (dir: -1 | 1) => { setDiaSel(null); setAncla((a) => (vista === "semana" ? sumarDias(a, dir * 7) : sumarMeses(a, dir))); };
  const irHoy = () => { setDiaSel(null); setAncla(inicioMes(HOY)); };

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
      // Navegar al mes/día del evento en la vista calendario
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
  const onCrearDia = (iso: string) => setModal({ modo: "crear", fecha: iso });
  const toggleTipo = (t: TipoEventoCalendario) => setVisibles((s) => {
    // Desde "todos activos" → aislar solo este tipo
    if (s.size === ORDEN_TIPOS.length) return new Set([t]);
    // Solo este tipo activo → volver a todos
    if (s.size === 1 && s.has(t)) return new Set(ORDEN_TIPOS);
    // Estado intermedio → toggle normal (add/remove)
    const n = new Set(s);
    if (n.has(t)) n.delete(t); else n.add(t);
    if (n.size === 0) return new Set(ORDEN_TIPOS);
    return n;
  });

  const titulo = vista === "semana" ? rangoSemanaLabel(ancla) : vista === "agenda" ? "Agenda" : mesLargo(ancla);
  const subtitulo = query
    ? `${agendaEventos.length} resultado${agendaEventos.length === 1 ? "" : "s"}`
    : vista === "agenda"
      ? `${futuros.length} próximos`
      : `${eventosMes} evento${eventosMes === 1 ? "" : "s"} este mes`;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">

      {/* ── Header: breadcrumb · búsqueda · acción primaria ─────────────── */}
      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-1.5 text-[11px] font-label shrink-0" aria-label="Ruta">
          <span className="text-outline/55">Dashboard</span>
          <span className="material-symbols-outlined text-[14px] text-outline/35">chevron_right</span>
          <span className="text-on-surface-variant font-semibold">Calendario Académico</span>
        </nav>

        <div className="flex-1 min-w-0 max-w-md mx-auto hidden sm:block">
          <SearchBar value={query} onChange={handleSearch} />
        </div>

        <button
          onClick={() => setModal({ modo: "crear", fecha: diaSel ?? toISODate(HOY) })}
          className="cal-card flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold font-label shrink-0"
          style={{ color: "#09090b", background: "#fafafa", boxShadow: "0 4px 16px -4px rgba(0,0,0,0.45)" }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nuevo Evento
        </button>
      </div>

      <div className="sm:hidden"><SearchBar value={query} onChange={handleSearch} /></div>

      {/* ── Título + vistas + navegación ───────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[28px] md:text-[32px] font-black tracking-tight font-headline text-on-surface leading-none">{titulo}</h1>
          <p className="text-sm text-outline mt-1.5">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 rounded-xl shrink-0" style={{ background: "rgba(5,5,6,0.9)" }}>
            {(["mes", "semana", "agenda"] as Vista[]).map((v) => (
              <button key={v} onClick={() => { setVista(v); setDiaSel(null); }} className="px-3.5 py-1.5 rounded-lg text-xs font-bold font-label capitalize transition-all"
                style={{ color: vista === v ? "#09090b" : "rgba(163,163,163,0.7)", background: vista === v ? "#fafafa" : "transparent" }}>{v}</button>
            ))}
          </div>
          {/* El nav siempre ocupa espacio para evitar que los botones se muevan al cambiar a agenda */}
          <div
            className={`flex items-center gap-0.5 p-0.5 rounded-xl shrink-0 transition-opacity duration-150 ${vista === "agenda" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            style={{ background: "rgba(5,5,6,0.9)" }}
            aria-hidden={vista === "agenda"}
          >
            <IconBtn icon="chevron_left" onClick={() => nav(-1)} label={vista === "semana" ? "Semana anterior" : "Mes anterior"} />
            <button
              onClick={irHoy}
              title="Volver al mes actual"
              className="px-3 h-8 rounded-lg text-xs font-bold font-label text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Hoy
            </button>
            <IconBtn icon="chevron_right" onClick={() => nav(1)} label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"} />
          </div>
        </div>
      </div>

      {/* ── Métricas + filtros ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {METRICAS.map((m) => (
            <div key={m.tipo} className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: `rgba(${TIPO[m.tipo].rgb},0.1)` }}>
              <span className="text-[14px]">{TIPO[m.tipo].emoji}</span>
              <span className="text-[15px] font-black font-headline" style={{ color: TIPO[m.tipo].text }}>{conteos[m.tipo]}</span>
              <span className="text-[11px] font-label text-on-surface-variant">{m.label}</span>
            </div>
          ))}
          <span className="text-[10px] text-outline/40 font-label ml-1">
            {horizonte !== null ? `próximos ${horizonte} días` : "próximos 30 días"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Chips de tipo — click para aislar, click al solo-activo para restaurar todos */}
          {ORDEN_TIPOS.map((t) => {
            const on = visibles.has(t);
            const solo = visibles.size === 1 && on;
            return (
              <button key={t} onClick={() => toggleTipo(t)} className="cal-chip flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-label"
                style={{ background: on ? `rgba(${TIPO[t].rgb},0.16)` : "rgba(35,35,39,0.4)", color: on ? TIPO[t].text : "rgba(115,115,115,0.6)", opacity: on ? 1 : 0.6, boxShadow: solo ? `inset 0 0 0 1.5px rgba(${TIPO[t].rgb},0.7)` : on ? `inset 0 0 0 1px rgba(${TIPO[t].rgb},0.35)` : "none" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? `rgb(${TIPO[t].rgb})` : "rgba(115,115,115,0.5)" }} />
                {TIPO[t].label}
              </button>
            );
          })}

          {/* Separador */}
          <span className="h-4 w-px bg-outline/15 mx-0.5 self-center" />

          {/* Filtro de horizonte temporal */}
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: "rgba(5,5,6,0.85)" }}>
            {([7, 14, 30, 60, null] as (number | null)[]).map((d) => {
              const active = horizonte === d;
              return (
                <button
                  key={d ?? "todo"}
                  onClick={() => setHorizonte(d)}
                  title={d === null ? "Sin límite de tiempo" : `Próximos ${d} días`}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-label transition-all"
                  style={{ color: active ? "#09090b" : "rgba(163,163,163,0.5)", background: active ? "#a3a3a3" : "transparent" }}
                >
                  {d === null ? "Todo" : `${d}d`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Cuerpo: calendario + panel ─────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_330px] gap-4 items-start">
        <section className="group relative cal-panel rounded-2xl p-3 md:p-4 min-w-0">
          {vista !== "agenda" && <><SideArrow dir="left" onClick={() => nav(-1)} label="Mes anterior" /><SideArrow dir="right" onClick={() => nav(1)} label="Mes siguiente" /></>}
          <div key={`${vista}-${toISODate(ancla)}`} className="cal-fade">
            {vista === "mes" && <MonthGrid ancla={ancla} eventos={visiblesArr} diaSel={diaSel} onSelDia={onSelDia} onEvento={onEvento} onCrear={onCrearDia} />}
            {vista === "semana" && <WeekGrid ancla={ancla} eventos={visiblesArr} diaSel={diaSel} onSelDia={onSelDia} onEvento={onEvento} onCrear={onCrearDia} />}
            {vista === "agenda" && <AgendaList eventos={agendaEventos} onEvento={onEvento} onEditar={onEditar} query={query} />}
          </div>
        </section>

        <aside>
          {diaSel ? (
            <DiaPanel
              fechaISO={diaSel}
              eventos={eventosDia}
              onAgregar={() => setModal({ modo: "crear", fecha: diaSel })}
              onEditar={(e) => setModal({ modo: "editar", evento: e })}
              onRendir={(e) => setModal({ modo: "crear", fecha: toISODate(new Date(e.fecha_inicio)), plantilla: { titulo: e.titulo, tipo: "examen" } })}
              onCerrar={() => setDiaSel(null)}
            />
          ) : (
            <ProximoPanel evento={importante} />
          )}
        </aside>
      </div>

      {modal && (
        <EventoModal modo={modal.modo} evento={modal.evento} fechaInicial={modal.fecha} plantilla={modal.plantilla} onSubmit={submitEvento} onEliminar={modal.modo === "editar" ? eliminarEventoActual : undefined} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 h-10 rounded-xl" style={{ background: "rgba(35,35,39,0.5)", boxShadow: "inset 0 0 0 1px rgba(115,115,115,0.12)" }}>
      <span className="material-symbols-outlined text-[18px] text-outline/60">search</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar eventos, exámenes o TPs…" className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-outline/45 min-w-0" />
      {value && (
        <button onClick={() => onChange("")} aria-label="Limpiar" className="text-outline/60 hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

// ── Vista MES ───────────────────────────────────────────────────────────────

function MonthGrid({ ancla, eventos, diaSel, onSelDia, onEvento, onCrear }: { ancla: Date; eventos: EventoCalendarioOut[]; diaSel: string | null; onSelDia: (iso: string) => void; onEvento: (e: EventoCalendarioOut) => void; onCrear: (iso: string) => void }) {
  const celdas = celdasMes(ancla);
  const porDia = agruparPorDia(eventos);
  const hoyKey = toISODate(HOY);
  const mesActual = ancla.getMonth();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7">
        {DIAS_LBL.map((d) => (
          <div key={d} className="text-center font-headline uppercase pb-2" style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", color: "rgba(115,115,115,0.6)" }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {celdas.map((dia) => {
          const key = toISODate(dia);
          const delDia = porDia.get(key) ?? [];
          const esMes = dia.getMonth() === mesActual;
          const esHoy = key === hoyKey;
          const sel = key === diaSel;
          const borderShadow = calcBorderShadow(delDia);
          const boxShadow = [
            sel ? "0 8px 20px -8px rgba(0,0,0,0.5)" : null,
            borderShadow ?? null,
          ].filter(Boolean).join(", ") || undefined;
          return (
            <div
              key={key}
              onClick={() => onSelDia(key)}
              onDoubleClick={() => onCrear(key)}
              title="Clic: ver · Doble clic: agregar evento"
              className={`cal-day min-h-[116px] rounded-xl p-2 overflow-hidden flex flex-col cursor-pointer select-none ${esHoy ? "cal-today-glow" : ""} ${sel ? "cal-card" : ""}`}
              style={{
                background: sel ? "rgba(173,198,255,0.14)" : esMes ? "rgba(35,35,39,0.32)" : "rgba(35,35,39,0.1)",
                boxShadow,
                opacity: esMes ? 1 : 0.4,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold font-headline flex items-center justify-center" style={{ color: esHoy ? "#09090b" : sel ? "#fafafa" : "#fafafa", background: esHoy ? "#7dffa2" : "transparent", width: esHoy ? "20px" : "auto", height: esHoy ? "20px" : "auto", borderRadius: "6px" }}>{dia.getDate()}</span>
                {delDia.length > 0 && (
                  <div className="flex gap-0.5">
                    {ORDEN_TIPOS.filter((t) => delDia.some((e) => e.tipo === t)).map((t) => (
                      <span key={t} className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${TIPO[t].rgb})` }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1 flex-1">
                {delDia.slice(0, 3).map((e) => (
                  <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onEvento(e); }} onDoubleClick={(ev) => ev.stopPropagation()} className="flex items-center gap-1 w-full px-1.5 py-1 text-left" style={{ borderRadius: "6px", background: `rgba(${TIPO[e.tipo].rgb},0.16)` }}>
                    <span className="text-[9px] leading-none">{TIPO[e.tipo].emoji}</span>
                    <span className="truncate text-[10.5px] font-bold font-label" style={{ color: TIPO[e.tipo].text }}>{e.titulo}</span>
                  </button>
                ))}
                {delDia.length > 3 && <span className="block text-[10px] text-outline/70 font-label pl-1">+{delDia.length - 3} más</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista SEMANA ─────────────────────────────────────────────────────────────

function WeekGrid({ ancla, eventos, diaSel, onSelDia, onEvento, onCrear }: { ancla: Date; eventos: EventoCalendarioOut[]; diaSel: string | null; onSelDia: (iso: string) => void; onEvento: (e: EventoCalendarioOut) => void; onCrear: (iso: string) => void }) {
  const dias = diasSemana(ancla);
  const porDia = agruparPorDia(eventos);
  const hoyKey = toISODate(HOY);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
      {dias.map((dia, i) => {
        const key = toISODate(dia);
        const delDia = porDia.get(key) ?? [];
        const esHoy = key === hoyKey;
        const sel = key === diaSel;
        const weekBorder = calcBorderShadow(delDia);
        const weekShadow = [sel ? "inset 0 0 0 1px rgba(173,198,255,0.4)" : null, weekBorder ?? null].filter(Boolean).join(", ") || undefined;
        return (
          <div key={key} onClick={() => onSelDia(key)} onDoubleClick={() => onCrear(key)} title="Clic: ver · Doble clic: agregar evento" className={`rounded-xl p-2.5 min-h-[200px] flex flex-col cursor-pointer select-none ${esHoy ? "cal-today-glow" : ""}`} style={{ background: sel ? "rgba(173,198,255,0.12)" : "rgba(35,35,39,0.28)", boxShadow: weekShadow }}>
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider font-bold font-label" style={{ color: esHoy ? "#9cffc2" : "rgba(115,115,115,0.7)" }}>{DIAS_LBL[i]}</p>
              <p className="text-lg font-black font-headline" style={{ color: esHoy ? "#9cffc2" : "#fafafa" }}>{dia.getDate()}</p>
            </div>
            <div className="space-y-1.5 flex-1">
              {delDia.length === 0 ? <p className="text-[10px] text-outline/25 font-label">—</p> : delDia.map((e) => (
                <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onEvento(e); }} onDoubleClick={(ev) => ev.stopPropagation()} className="flex items-start gap-1.5 w-full text-left px-2 py-1.5 rounded-lg" style={{ background: `rgba(${TIPO[e.tipo].rgb},0.14)` }}>
                  <span className="text-[11px] leading-none mt-0.5">{TIPO[e.tipo].emoji}</span>
                  <p className="text-[11px] font-bold leading-snug" style={{ color: TIPO[e.tipo].text }}>{e.titulo}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Vista AGENDA ─────────────────────────────────────────────────────────────

function AgendaList({ eventos, onEvento, onEditar, query }: { eventos: EventoCalendarioOut[]; onEvento: (e: EventoCalendarioOut) => void; onEditar: (e: EventoCalendarioOut) => void; query: string }) {
  if (eventos.length === 0) return <EmptyState texto={query ? `Sin resultados para “${query}”.` : "No hay eventos próximos."} />;
  const grupos = new Map<string, EventoCalendarioOut[]>();
  for (const e of eventos) {
    const k = toISODate(new Date(e.fecha_inicio));
    const arr = grupos.get(k) ?? [];
    arr.push(e);
    grupos.set(k, arr);
  }
  return (
    <div className="space-y-4 py-1">
      {[...grupos.entries()].map(([iso, evs]) => {
        const n = diffDias(iso);
        const { dia, mes } = diaMes(iso);
        const esHoy = n === 0;
        return (
          <div key={iso} className="flex gap-4">
            <div className="shrink-0 w-14 text-center pt-1">
              <p className="text-2xl font-black font-headline leading-none" style={{ color: esHoy ? "#9cffc2" : "#fafafa" }}>{dia}</p>
              <p className="text-[10px] uppercase tracking-wider font-bold font-label mt-0.5" style={{ color: "rgba(115,115,115,0.7)" }}>{mes}</p>
              <p className="text-[9px] font-label mt-1" style={{ color: esHoy ? "#9cffc2" : "rgba(115,115,115,0.45)" }}>{countdown(n)}</p>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {evs.map((e) => (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEvento(e)}
                  onKeyDown={(ev) => ev.key === "Enter" && onEvento(e)}
                  className="cal-row w-full text-left rounded-xl p-3 cursor-pointer"
                  style={{ background: `rgba(${TIPO[e.tipo].rgb},0.08)`, borderLeft: `3px solid rgb(${TIPO[e.tipo].rgb})` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[15px]">{TIPO[e.tipo].emoji}</span>
                    <p className="font-headline font-bold text-[13px] flex-1 min-w-0 truncate" style={{ color: "#fafafa" }}>{e.titulo}</p>
                    {e.origen === "usuario" && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); onEditar(e); }}
                        title="Editar evento"
                        className="w-6 h-6 rounded-md flex items-center justify-center text-outline/50 hover:text-on-surface hover:bg-white/10 transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                      </button>
                    )}
                    <span className="text-[10px] font-bold font-label px-2 py-0.5 rounded-md shrink-0" style={{ color: TIPO[e.tipo].text, background: `rgba(${TIPO[e.tipo].rgb},0.14)` }}>{TIPO[e.tipo].label}</span>
                  </div>
                  <p className="text-[11px] mt-1 pl-[23px]" style={{ color: "rgba(163,163,163,0.6)" }}>{rangoEvento(e)}</p>
                  {e.descripcion && <p className="text-[11px] mt-1 pl-[23px] line-clamp-2" style={{ color: "rgba(115,115,115,0.7)" }}>{e.descripcion}</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Flecha lateral ───────────────────────────────────────────────────────────

function SideArrow({ dir, onClick, label }: { dir: "left" | "right"; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="absolute top-1/2 -translate-y-1/2 z-10 w-9 h-16 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity duration-200"
      style={{ [dir]: "6px", background: "rgba(9,9,11,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "rgba(250,250,250,0.92)", boxShadow: "0 6px 18px -6px rgba(0,0,0,0.6)" }}>
      <span className="material-symbols-outlined text-[24px]">{dir === "left" ? "chevron_left" : "chevron_right"}</span>
    </button>
  );
}

// ── Panel derecho ────────────────────────────────────────────────────────────

function ProximoPanel({ evento }: { evento: EventoCalendarioOut | null }) {
  if (!evento) return <section className="cal-panel rounded-2xl p-5"><EmptyState texto="No hay próximos eventos importantes." /></section>;
  const cfg = TIPO[evento.tipo];
  const n = diffDias(toISODate(new Date(evento.fecha_inicio)));
  return (
    <section className="cal-panel rounded-2xl p-5 relative overflow-hidden" style={{ background: `linear-gradient(150deg, rgba(${cfg.rgb},0.16), rgba(${cfg.rgb},0.03)), rgba(18,18,21,0.6)` }}>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold font-label mb-3" style={{ color: cfg.text }}>Próximo evento importante</p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[18px]">{cfg.emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider font-label px-2 py-0.5 rounded-full" style={{ color: cfg.text, background: `rgba(${cfg.rgb},0.16)` }}>{cfg.label}</span>
      </div>
      <h3 className="text-xl font-black font-headline leading-tight" style={{ color: "#fafafa" }}>{evento.titulo}</h3>
      <p className="text-sm mt-1.5" style={{ color: "rgba(163,163,163,0.7)" }}>{rangoEvento(evento)}</p>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[34px] font-black font-headline leading-none" style={{ color: cfg.text }}>{n <= 0 ? (n === 0 ? "Hoy" : "—") : n}</span>
        {n > 0 && <span className="text-sm font-label" style={{ color: "rgba(163,163,163,0.7)" }}>{n === 1 ? "día restante" : "días restantes"}</span>}
      </div>
    </section>
  );
}

function DiaPanel({ fechaISO, eventos, onAgregar, onEditar, onRendir, onCerrar }: { fechaISO: string; eventos: EventoCalendarioOut[]; onAgregar: () => void; onEditar: (e: EventoCalendarioOut) => void; onRendir: (e: EventoCalendarioOut) => void; onCerrar: () => void }) {
  return (
    <section className="cal-panel rounded-2xl p-5" style={{ background: "linear-gradient(150deg, rgba(173,198,255,0.1), rgba(18,18,21,0.6))" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-primary font-label">{fechaLarga(fechaISO)}</p>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
      <div className="space-y-2">
        {eventos.length === 0 ? (
          <p className="text-xs text-outline/50 py-1">Día libre.</p>
        ) : eventos.map((e) => {
          const editable = e.origen === "usuario";
          const esMesa = e.tipo === "mesa";
          const cfg = TIPO[e.tipo];
          return (
            <div key={e.id} className="rounded-xl p-3" style={{ background: `rgba(${cfg.rgb},0.1)`, borderLeft: `3px solid rgb(${cfg.rgb})` }}>
              <button
                onClick={() => editable && onEditar(e)}
                disabled={!editable}
                className="flex items-center gap-2 w-full text-left"
                style={{ cursor: editable ? "pointer" : "default" }}
              >
                <span className="text-[14px]">{cfg.emoji}</span>
                <p className="font-headline font-bold text-[13px] flex-1 min-w-0 truncate" style={{ color: "#fafafa" }}>{e.titulo}</p>
                {editable && <span className="material-symbols-outlined text-[15px] text-outline/60">edit</span>}
              </button>
              {e.descripcion && <p className="text-[11px] mt-1.5" style={{ color: "rgba(115,115,115,0.75)" }}>{e.descripcion}</p>}
              {esMesa && (
                <button
                  onClick={() => onRendir(e)}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold font-label transition-all"
                  style={{ background: "rgba(255,120,120,0.14)", color: "#ffb0b0", boxShadow: "inset 0 0 0 1px rgba(255,120,120,0.3)" }}
                >
                  <span className="material-symbols-outlined text-[14px]">how_to_reg</span>
                  Voy a rendir
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onAgregar} className="cal-card mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold font-label" style={{ background: "rgba(173,198,255,0.14)", color: "#fafafa" }}>
        <span className="material-symbols-outlined text-[16px]">add</span>Agregar evento este día
      </button>
    </section>
  );
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

function IconBtn({ icon, onClick, label }: { icon: string; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60 transition-colors">
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}

function EmptyState({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="material-symbols-outlined text-[28px] text-outline/20">event_busy</span>
      <p className="text-xs text-outline/50">{texto}</p>
    </div>
  );
}

function rangoSemanaLabel(ancla: Date): string {
  const ini = inicioSemana(ancla);
  const fin = sumarDias(ini, 6);
  const f = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return capitalizar(`${f(ini)} – ${f(fin)}`);
}
