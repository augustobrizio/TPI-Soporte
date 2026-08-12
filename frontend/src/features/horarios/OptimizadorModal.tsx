"use client";

import { useState, useMemo } from "react";
import { optimizarHorario } from "@/lib/api";
import { materiaIcon } from "@/lib/materiaIcon";
import type { AsignacionOut, CriterioOptimizacion, HorarioOut, OptimizacionOut, TurnoPref } from "@/lib/types";

export interface OptMateria {
  codigo: string;
  nombre: string;
  anio: number | null;
  anual: boolean;
  rgb: string;
  text: string;
  numComisiones: number;
}

interface Props {
  materias: OptMateria[];
  preseleccionados: string[];
  anio: number;
  cuatrimestre: number;
  onAplicar: (asignaciones: AsignacionOut[]) => void;
  onClose: () => void;
}

const CRITERIOS: { id: CriterioOptimizacion; icon: string; titulo: string; desc: string }[] = [
  { id: "huecos", icon: "compress", titulo: "Menos huecos", desc: "Clases lo más seguidas posible, sin tiempos muertos." },
  { id: "dias", icon: "event_available", titulo: "Menos días", desc: "Concentra todo en pocos días y te libera jornadas." },
  { id: "turno", icon: "wb_sunny", titulo: "Por turno", desc: "Prioriza cursar en la franja que prefieras." },
];

const TURNOS: { id: TurnoPref; icon: string; label: string }[] = [
  { id: "manana", icon: "wb_twilight", label: "Mañana" },
  { id: "tarde", icon: "wb_sunny", label: "Tarde" },
  { id: "noche", icon: "dark_mode", label: "Noche" },
];

const DIAS_SEMANA: { id: string; label: string }[] = [
  { id: "lunes", label: "Lun" },
  { id: "martes", label: "Mar" },
  { id: "miercoles", label: "Mié" },
  { id: "jueves", label: "Jue" },
  { id: "viernes", label: "Vie" },
];

const DIA_NOMBRE: Record<string, string> = {
  lunes: "lunes", martes: "martes", miercoles: "miércoles",
  jueves: "jueves", viernes: "viernes", sabado: "sábado",
};

const DIA_LABEL: Record<string, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié", "miércoles": "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", "sábado": "Sáb",
};

function fmtHuecos(min: number): string {
  if (min <= 0) return "Sin huecos";
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

function resumenHorarios(horarios: HorarioOut[]): string {
  return horarios
    .map(h => `${DIA_LABEL[(h.dia ?? "").toLowerCase()] ?? h.dia ?? ""} ${h.hora_inicio?.slice(0, 5) ?? ""}–${h.hora_fin?.slice(0, 5) ?? ""}`)
    .join("  ·  ");
}

export function OptimizadorModal({ materias, preseleccionados, anio, cuatrimestre, onAplicar, onClose }: Props) {
  const [criterio, setCriterio] = useState<CriterioOptimizacion>("huecos");
  const [turno, setTurno] = useState<TurnoPref>("manana");
  const [diaLibre, setDiaLibre] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(preseleccionados));
  const [fase, setFase] = useState<"config" | "loading" | "result">("config");
  const [resultado, setResultado] = useState<OptimizacionOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const colorDe = useMemo(() => {
    const m = new Map<string, OptMateria>();
    for (const x of materias) m.set(x.codigo, x);
    return m;
  }, [materias]);

  // Agrupar por año para el checklist
  const grupos = useMemo(() => {
    const map = new Map<number | "E", OptMateria[]>();
    for (const m of materias) {
      const k = m.anio ?? "E";
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    }
    const orden = [...map.entries()].sort((a, b) => {
      const av = a[0] === "E" ? 99 : a[0];
      const bv = b[0] === "E" ? 99 : b[0];
      return av - bv;
    });
    return orden;
  }, [materias]);

  function toggle(codigo: string) {
    setSeleccion(prev => {
      const n = new Set(prev);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });
  }
  const todasSel = seleccion.size === materias.length && materias.length > 0;
  const toggleTodas = () => setSeleccion(todasSel ? new Set() : new Set(materias.map(m => m.codigo)));

  async function ejecutar() {
    setFase("loading");
    setError(null);
    try {
      const r = await optimizarHorario([...seleccion], anio, cuatrimestre, criterio, {
        diaLibre: criterio === "dias" ? diaLibre : null,
        turno: criterio === "turno" ? turno : null,
      });
      setResultado(r);
      setFase("result");
    } catch {
      setError("No se pudo optimizar. Intentá de nuevo.");
      setFase("config");
    }
  }

  // Re-optimizar liberando un día sugerido (desde la pantalla de resultado).
  async function reoptimizarDia(dia: string) {
    setDiaLibre(dia);
    setFase("loading");
    try {
      const r = await optimizarHorario([...seleccion], anio, cuatrimestre, "dias", { diaLibre: dia });
      setResultado(r);
    } catch {
      setError("No se pudo optimizar. Intentá de nuevo.");
    }
    setFase("result");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(5,5,6,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[640px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "#121215", border: "1px solid rgba(115,115,115,0.16)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid rgba(115,115,115,0.12)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(173,198,255,0.14)", border: "1px solid rgba(0,0,0,0.35)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#fafafa" }}>auto_awesome</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-black font-headline text-on-surface leading-none">Optimización de horarios</h2>
            <p className="text-[11px] text-outline mt-1">Elegí qué priorizar y qué materias cursar</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Cuerpo */}
        {fase === "result" && resultado
          ? <ResultadoView resultado={resultado} colorDe={colorDe} onVolver={() => setFase("config")} onAplicar={() => { onAplicar(resultado.asignaciones); onClose(); }} onElegirDia={reoptimizarDia} />
          : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Criterio */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-outline/60 font-label font-bold mb-2.5">¿Qué priorizás?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {CRITERIOS.map(c => {
                      const on = criterio === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setCriterio(c.id)}
                          className="text-left rounded-xl p-3 transition-all"
                          style={{
                            background: on ? "rgba(173,198,255,0.1)" : "rgba(35,35,39,0.5)",
                            border: `1px solid ${on ? "rgba(173,198,255,0.45)" : "rgba(115,115,115,0.16)"}`,
                            boxShadow: on ? "0 0 14px rgba(173,198,255,0.1)" : undefined,
                          }}
                        >
                          <span className="material-symbols-outlined text-[20px]" style={{ color: on ? "#fafafa" : "rgba(163,163,163,0.7)" }}>{c.icon}</span>
                          <p className="font-headline font-bold text-[12.5px] mt-1.5" style={{ color: on ? "#fafafa" : "#a3a3a3" }}>{c.titulo}</p>
                          <p className="text-[10.5px] leading-snug mt-1" style={{ color: "rgba(115,115,115,0.8)" }}>{c.desc}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-opción: turno preferido */}
                  {criterio === "turno" && (
                    <div className="flex gap-1.5 mt-2.5">
                      {TURNOS.map(t => {
                        const on = turno === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setTurno(t.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold font-label transition-all"
                            style={{
                              color: on ? "#09090b" : "rgba(163,163,163,0.72)",
                              background: on ? "#fafafa" : "rgba(35,35,39,0.6)",
                              border: `1px solid ${on ? "#fafafa" : "rgba(115,115,115,0.18)"}`,
                            }}
                          >
                            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-opción: día libre */}
                  {criterio === "dias" && (
                    <div className="mt-2.5">
                      <p className="text-[10px] text-outline/60 font-label mb-1.5">¿Querés dejar algún día libre?</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setDiaLibre(null)}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-bold font-label transition-all"
                          style={{
                            color: diaLibre === null ? "#09090b" : "rgba(163,163,163,0.72)",
                            background: diaLibre === null ? "#fafafa" : "rgba(35,35,39,0.6)",
                            border: `1px solid ${diaLibre === null ? "#fafafa" : "rgba(115,115,115,0.18)"}`,
                          }}
                        >
                          Cualquiera
                        </button>
                        {DIAS_SEMANA.map(d => {
                          const on = diaLibre === d.id;
                          return (
                            <button
                              key={d.id}
                              onClick={() => setDiaLibre(on ? null : d.id)}
                              className="rounded-lg px-3 py-1.5 text-[11px] font-bold font-label transition-all"
                              style={{
                                color: on ? "#09090b" : "rgba(163,163,163,0.72)",
                                background: on ? "#fafafa" : "rgba(35,35,39,0.6)",
                                border: `1px solid ${on ? "#fafafa" : "rgba(115,115,115,0.18)"}`,
                              }}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Materias */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-outline/60 font-label font-bold">
                      Materias a cursar · {seleccion.size}
                    </p>
                    <button onClick={toggleTodas} className="text-[11px] font-bold font-label text-primary hover:opacity-80 transition-opacity">
                      {todasSel ? "Ninguna" : "Todas"}
                    </button>
                  </div>

                  {materias.length === 0 ? (
                    <p className="text-xs text-outline/40 py-6 text-center">No hay materias cursables este cuatrimestre.</p>
                  ) : (
                    <div className="space-y-3">
                      {grupos.map(([k, lista]) => (
                        <div key={String(k)}>
                          <p className="text-[10px] font-bold font-label text-outline/50 mb-1.5">
                            {k === "E" ? "Electivas" : `${k}° Año`}
                          </p>
                          <div className="space-y-1.5">
                            {lista.map(m => {
                              const on = seleccion.has(m.codigo);
                              return (
                                <button
                                  key={m.codigo}
                                  onClick={() => toggle(m.codigo)}
                                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors text-left"
                                  style={{ background: on ? `rgba(${m.rgb},0.08)` : "rgba(35,35,39,0.4)", border: `1px solid ${on ? `rgba(${m.rgb},0.3)` : "rgba(115,115,115,0.1)"}` }}
                                >
                                  <span
                                    className="w-4 h-4 rounded-[5px] flex items-center justify-center shrink-0"
                                    style={{ background: on ? `rgb(${m.rgb})` : "transparent", border: `1.5px solid ${on ? `rgb(${m.rgb})` : "rgba(115,115,115,0.4)"}` }}
                                  >
                                    {on && <span className="material-symbols-outlined" style={{ fontSize: "13px", color: "#09090b", fontVariationSettings: "'FILL' 1" }}>check</span>}
                                  </span>
                                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", color: m.text }}>{materiaIcon(m.nombre)}</span>
                                  <span className="flex-1 min-w-0 text-[12px] font-medium truncate" style={{ color: on ? "#fafafa" : "#a3a3a3" }}>
                                    {m.nombre}
                                    {m.anual && <span className="text-[9px] text-outline/60 ml-1.5">anual</span>}
                                  </span>
                                  <span className="text-[10px] text-outline/50 shrink-0">{m.numComisiones} com.</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-error bg-error/10 border border-error/25 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 shrink-0 flex items-center justify-end gap-2" style={{ borderTop: "1px solid rgba(115,115,115,0.12)" }}>
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold font-label text-outline hover:text-on-surface transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={ejecutar}
                  disabled={seleccion.size === 0 || fase === "loading"}
                  className="px-4 py-2 rounded-lg text-xs font-bold font-label flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#fafafa", color: "#09090b", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
                >
                  {fase === "loading"
                    ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Optimizando…</>
                    : <><span className="material-symbols-outlined text-[16px]">auto_awesome</span>Optimizar</>}
                </button>
              </div>
            </>
          )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ResultadoView({
  resultado,
  colorDe,
  onVolver,
  onAplicar,
  onElegirDia,
}: {
  resultado: OptimizacionOut;
  colorDe: Map<string, OptMateria>;
  onVolver: () => void;
  onAplicar: () => void;
  onElegirDia: (dia: string) => void;
}) {
  if (!resultado.ok) {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center justify-center text-center gap-3">
          <span className="material-symbols-outlined text-[40px]" style={{ color: "rgba(255,130,130,0.6)" }}>error</span>
          <p className="text-sm text-on-surface font-medium">{resultado.motivo ?? "No se encontró una combinación."}</p>
          {resultado.combinaciones_evaluadas > 0 && (
            <p className="text-[11px] text-outline">Se evaluaron {resultado.combinaciones_evaluadas.toLocaleString("es-AR")} combinaciones.</p>
          )}
        </div>
        <div className="px-5 py-3.5 shrink-0 flex justify-end" style={{ borderTop: "1px solid rgba(115,115,115,0.12)" }}>
          <button onClick={onVolver} className="px-4 py-2 rounded-lg text-xs font-bold font-label" style={{ background: "rgba(35,35,39,0.7)", color: "#fafafa", border: "1px solid rgba(115,115,115,0.2)" }}>
            Volver a elegir
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2">
          <Metric icon="compress" valor={fmtHuecos(resultado.total_huecos_min)} label="huecos totales" />
          <Metric icon="event_available" valor={`${resultado.dias_usados}`} label={resultado.dias_usados === 1 ? "día de cursada" : "días de cursada"} />
          <Metric icon="bolt" valor={resultado.combinaciones_evaluadas.toLocaleString("es-AR")} label="combinaciones" />
        </div>

        {resultado.materias_sin_comision.length > 0 && (
          <p className="text-[11px] text-tertiary bg-tertiary/10 border border-tertiary/25 rounded-lg px-3 py-2">
            Sin comisión este cuatrimestre: {resultado.materias_sin_comision.join(", ")}
          </p>
        )}

        {/* Aviso: el día pedido no se pudo liberar, pero hay alternativas */}
        {!resultado.dia_libre_ok && (
          <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,185,80,0.1)", border: "1px solid rgba(255,185,80,0.28)" }}>
            <p className="text-[11.5px] font-medium" style={{ color: "#ffce8f" }}>
              No se puede liberar ese día con estas materias.
            </p>
            {resultado.dias_libres_posibles.length > 0 ? (
              <>
                <p className="text-[11px] text-outline mt-1.5 mb-2">Pero sí podés dejar libre:</p>
                <div className="flex flex-wrap gap-1.5">
                  {resultado.dias_libres_posibles.map(d => (
                    <button
                      key={d}
                      onClick={() => onElegirDia(d)}
                      className="hz-yearchip rounded-lg px-3 py-1.5 text-[11px] font-bold font-label capitalize"
                      style={{ color: "#09090b", background: "#ffce8f" }}
                    >
                      {DIA_NOMBRE[d] ?? d}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-outline mt-1.5">No hay ningún día que se pueda liberar por completo.</p>
            )}
          </div>
        )}

        {/* Asignaciones */}
        <div className="space-y-2">
          {resultado.asignaciones.map(a => {
            const col = colorDe.get(a.materia_codigo);
            const rgb = col?.rgb ?? "138,180,255";
            const text = col?.text ?? "#bcd4ff";
            return (
              <div
                key={a.cursada_id}
                className="rounded-xl p-3"
                style={{ background: `linear-gradient(0deg, rgba(${rgb},0.08), rgba(${rgb},0.08)), rgba(35,35,39,0.4)`, border: `1px solid rgba(${rgb},0.22)`, borderLeft: `3px solid rgb(${rgb})` }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: "18px", color: text }}>{materiaIcon(a.materia_nombre)}</span>
                  <p className="font-headline font-bold text-[13px] flex-1 min-w-0 truncate" style={{ color: "#fafafa" }}>{a.materia_nombre}</p>
                  <span className="text-[11px] font-bold font-label px-2 py-0.5 rounded-md shrink-0" style={{ background: `rgba(${rgb},0.16)`, color: text }}>
                    {a.comision_nombre ?? `#${a.comision_id}`}
                  </span>
                </div>
                <p className="text-[10.5px] font-label mt-1.5 pl-[28px]" style={{ color: "rgba(163,163,163,0.65)" }}>
                  {resumenHorarios(a.horarios)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3.5 shrink-0 flex items-center justify-end gap-2" style={{ borderTop: "1px solid rgba(115,115,115,0.12)" }}>
        <button onClick={onVolver} className="px-4 py-2 rounded-lg text-xs font-bold font-label text-outline hover:text-on-surface transition-colors">
          Volver a elegir
        </button>
        <button
          onClick={onAplicar}
          className="px-4 py-2 rounded-lg text-xs font-bold font-label flex items-center gap-1.5 transition-all"
          style={{ background: "#7dffa2", color: "#003918", boxShadow: "0 2px 10px rgba(125,255,162,0.25)" }}
        >
          <span className="material-symbols-outlined text-[16px]">calendar_add_on</span>
          Aplicar al calendario
        </button>
      </div>
    </>
  );
}

function Metric({ icon, valor, label }: { icon: string; valor: string; label: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex flex-col items-center text-center" style={{ background: "rgba(35,35,39,0.5)", border: "1px solid rgba(115,115,115,0.14)" }}>
      <span className="material-symbols-outlined text-[18px] mb-1" style={{ color: "#fafafa" }}>{icon}</span>
      <p className="font-headline font-black text-[14px] leading-none" style={{ color: "#fafafa" }}>{valor}</p>
      <p className="text-[9.5px] text-outline/60 mt-1 font-label">{label}</p>
    </div>
  );
}
