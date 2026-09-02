import {
  CalendarOff,
  ClipboardList,
  GraduationCap,
  Info,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import type { EventoCalendarioOut, TipoEventoCalendario } from "@/lib/types";

// ---------------------------------------------------------------------------
// Configuración visual por tipo de evento
// ---------------------------------------------------------------------------

/**
 * Rol del evento para el alumno. Es lo que decide el color.
 *
 * El color solía nombrar la categoría: cinco tipos, cinco tonos. Pero al
 * alumno no le importa el tipo, le importa **si tiene que venir a cursar**, y
 * en esa pregunta una mesa de examen y un feriado significan lo mismo. Así que
 * el color pasó a decir eso y la categoría la dicen el ícono y la palabra.
 *
 * - `sin_cursada` — no hay clases (mesa de examen, feriado).
 * - `propio` — lo que cargó el alumno (su examen, su TP). Celeste de marca.
 * - `info` — institucional y sin efecto sobre la cursada (inscripciones,
 *   inicio de cuatrimestre). Neutro a propósito: no compite por atención.
 */
export type RolEvento = "sin_cursada" | "propio" | "info";

export interface TipoConfig {
  label: string;
  plural: string;
  Icono: LucideIcon;
  rol: RolEvento;
  /** Prioridad para "próximo evento importante" (mayor = más importante). */
  peso: number;
}

export const TIPO: Record<TipoEventoCalendario, TipoConfig> = {
  examen: { label: "Examen", plural: "Exámenes", Icono: PenLine, rol: "propio", peso: 5 },
  trabajo_practico: { label: "TP", plural: "Trabajos prácticos", Icono: ClipboardList, rol: "propio", peso: 4 },
  mesa: { label: "Mesa", plural: "Mesas de examen", Icono: GraduationCap, rol: "sin_cursada", peso: 3 },
  feriado: { label: "Feriado", plural: "Feriados", Icono: CalendarOff, rol: "sin_cursada", peso: 2 },
  evento: { label: "Evento", plural: "Eventos", Icono: Info, rol: "info", peso: 1 },
};

/** Clases de cada rol. Todo sale de tokens: los dos modos salen gratis. */
export const ROL: Record<RolEvento, { fg: string; bg: string; borde: string; punto: string }> = {
  sin_cursada: {
    fg: "text-[var(--cal-alerta-fg)]",
    bg: "bg-[var(--cal-alerta-bg)]",
    borde: "border-[var(--cal-alerta-bd)]",
    punto: "bg-[var(--cal-alerta-solid)]",
  },
  propio: {
    fg: "text-[var(--shell-accent-fg)]",
    bg: "bg-[#1CA4DF]/10",
    borde: "border-[#1CA4DF]/25",
    punto: "bg-[#1CA4DF]",
  },
  info: {
    fg: "text-[var(--shell-fg-muted)]",
    bg: "bg-[var(--shell-hover)]",
    borde: "border-[var(--shell-border)]",
    punto: "bg-[var(--shell-fg-dim)]",
  },
};

export function rolDe(tipo: TipoEventoCalendario) {
  return ROL[TIPO[tipo].rol];
}

/** ¿Este evento implica que ese día no se cursa? */
export function impideCursada(e: EventoCalendarioOut): boolean {
  return TIPO[e.tipo].rol === "sin_cursada";
}

/**
 * Orden de los tipos en filtros y leyendas: primero lo que suspende la
 * cursada, después lo del alumno, al final lo informativo.
 */
export const ORDEN_TIPOS: TipoEventoCalendario[] = [
  "mesa",
  "feriado",
  "examen",
  "trabajo_practico",
  "evento",
];

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

export function toISODate(f: Date): string {
  const y = f.getFullYear();
  const m = String(f.getMonth() + 1).padStart(2, "0");
  const d = String(f.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function inicioDia(f: Date): Date {
  return new Date(f.getFullYear(), f.getMonth(), f.getDate());
}
export function inicioMes(f: Date): Date {
  return new Date(f.getFullYear(), f.getMonth(), 1);
}
export function finMes(f: Date): Date {
  return new Date(f.getFullYear(), f.getMonth() + 1, 0);
}
export function sumarMeses(f: Date, n: number): Date {
  return new Date(f.getFullYear(), f.getMonth() + n, 1);
}
export function sumarDias(f: Date, n: number): Date {
  const d = new Date(f);
  d.setDate(d.getDate() + n);
  return d;
}

/** Lunes como primer día de la semana que contiene `f`. */
export function inicioSemana(f: Date): Date {
  const base = inicioDia(f);
  const offset = (base.getDay() + 6) % 7;
  return sumarDias(base, -offset);
}

/** 42 celdas (6 semanas) del mes, empezando en lunes. */
export function celdasMes(f: Date): Date[] {
  const primer = inicioSemana(inicioMes(f));
  return Array.from({ length: 42 }, (_, i) => sumarDias(primer, i));
}

export function diasSemana(f: Date): Date[] {
  const ini = inicioSemana(f);
  return Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/** Días (ISO) que ocupa un evento (los feriados/exámenes pueden abarcar rango). */
export function diasDelEvento(e: EventoCalendarioOut): string[] {
  const ini = inicioDia(new Date(e.fecha_inicio));
  if (e.tipo === "trabajo_practico" || e.tipo === "evento") return [toISODate(ini)];
  const fin = e.fecha_fin ? inicioDia(new Date(e.fecha_fin)) : ini;
  const out: string[] = [];
  const cur = new Date(ini);
  while (cur <= fin) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function agruparPorDia(eventos: EventoCalendarioOut[]): Map<string, EventoCalendarioOut[]> {
  const map = new Map<string, EventoCalendarioOut[]>();
  for (const e of eventos) {
    for (const k of diasDelEvento(e)) {
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
  }
  return map;
}

export function eventoTocaMes(e: EventoCalendarioOut, mes: Date): boolean {
  const ini = inicioDia(new Date(e.fecha_inicio));
  const fin = e.fecha_fin ? inicioDia(new Date(e.fecha_fin)) : ini;
  return ini <= finMes(mes) && fin >= inicioMes(mes);
}

export function mesConDatosMasCercano(eventos: EventoCalendarioOut[], ref: Date): Date | null {
  if (eventos.length === 0) return null;
  const actual = inicioMes(ref);
  const meses = eventos.map((e) => inicioMes(new Date(e.fecha_inicio))).sort((a, b) => a.getTime() - b.getTime());
  return meses.find((m) => m >= actual) ?? meses[meses.length - 1] ?? null;
}

/** Eventos futuros (desde hoy), ordenados cronológicamente, deduplicados. */
export function eventosFuturos(eventos: EventoCalendarioOut[], hoy = new Date()): EventoCalendarioOut[] {
  const piso = inicioDia(hoy).getTime();
  return [...eventos]
    .filter((e) => {
      const ini = inicioDia(new Date(e.fecha_inicio)).getTime();
      const fin = e.fecha_fin ? inicioDia(new Date(e.fecha_fin)).getTime() : ini;
      return fin >= piso;
    })
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
}

/** Próximo evento "importante" (mayor peso, desempata por fecha). */
export function proximoImportante(eventos: EventoCalendarioOut[], hoy = new Date()): EventoCalendarioOut | null {
  const fut = eventosFuturos(eventos, hoy);
  if (fut.length === 0) return null;
  const prioritarios = fut.filter((e) => TIPO[e.tipo].peso >= 3);
  return (prioritarios[0] ?? fut[0]) ?? null;
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Parsea evitando el corrimiento de día: "YYYY-MM-DD" como medianoche local. */
export function parseFecha(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00:00` : s);
}

export function diffDias(fechaISO: string, hoy = new Date()): number {
  const a = inicioDia(hoy).getTime();
  const b = inicioDia(parseFecha(fechaISO)).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function countdown(n: number): string {
  if (n < 0) return "Finalizado";
  if (n === 0) return "Es hoy";
  if (n === 1) return "Mañana";
  return `Faltan ${n} días`;
}

export function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mesLargo(f: Date): string {
  return capitalizar(f.toLocaleDateString("es-AR", { month: "long", year: "numeric" }));
}

export function diaMes(fechaISO: string): { dia: string; mes: string } {
  const d = parseFecha(fechaISO);
  return {
    dia: String(d.getDate()),
    mes: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

export function fechaLarga(fechaISO: string): string {
  return capitalizar(
    parseFecha(fechaISO).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long" }),
  );
}

export function rangoEvento(e: EventoCalendarioOut): string {
  const ini = new Date(e.fecha_inicio);
  if (!e.fecha_fin) return capitalizar(ini.toLocaleDateString("es-AR", { day: "2-digit", month: "long" }));
  const fin = new Date(e.fecha_fin);
  if (toISODate(ini) === toISODate(fin)) {
    return capitalizar(ini.toLocaleDateString("es-AR", { day: "2-digit", month: "long" }));
  }
  const f = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return `${f(ini)} – ${f(fin)}`;
}
