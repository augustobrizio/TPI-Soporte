"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seleccionarCursada, deseleccionarCursada } from "@/lib/api";
import { materiaIcon } from "@/lib/materiaIcon";
import type { AsignacionOut, HorarioOut, MateriaCursableOut } from "@/lib/types";
import { OptimizadorModal, type OptMateria } from "./OptimizadorModal";

const ANIO_ACADEMICO = 2025;

const DIAS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];
const DIA_LABEL: Record<string, string> = {
  Lunes: "Lunes", Martes: "Martes", Miercoles: "Miérc.",
  Jueves: "Jueves", Viernes: "Viernes", Sabado: "Sáb.",
};
const DIA_NORM: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miercoles", "miércoles": "Miercoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sabado", "sábado": "Sabado",
};
const normDia = (d: string) => DIA_NORM[d.toLowerCase()] ?? d;

// Módulos de UTN FRRO (compartimentos fijos extraídos del Excel)
const UTN_MODULOS = [
  "07:15", "08:45", "09:45", "10:30",
  "11:20", "12:50", "13:35", "15:00",
  "16:05", "17:40", "18:35", "20:00",
  "21:05", "22:35",
];

const DAY_FLOOR = 7; // antes de las 7 = madrugada → +24 para ordenar clases nocturnas
const LABEL_W = 60;

function parseHF(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  let v = h + (m ?? 0) / 60;
  if (v < DAY_FLOOR) v += 24;
  return v;
}
const moduloH = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
};

interface Color { rgb: string; text: string; }
// Orden pensado para máxima separación de tono entre materias consecutivas.
const PALETTE: Color[] = [
  { rgb: "138,180,255", text: "#bcd4ff" }, // azul
  { rgb: "255,176,72",  text: "#ffce8f" }, // naranja
  { rgb: "112,240,160", text: "#9cffc2" }, // verde
  { rgb: "255,120,180", text: "#ffadd0" }, // magenta
  { rgb: "186,150,255", text: "#d3c2ff" }, // violeta
  { rgb: "94,222,222",  text: "#a3eded" }, // cyan
  { rgb: "255,214,92",  text: "#ffe4a5" }, // amarillo
];

// ---------------------------------------------------------------------------
// Modelo unificado: una materia con sus comisiones cruzando ambos cuatrimestres.
// Las anuales tienen cursada en c[0] y c[1] (misma comisión todo el año).
// ---------------------------------------------------------------------------

type Idx = 0 | 1;
interface MCursada { cursada_id: number; horarios: HorarioOut[]; }
interface MComision { comision_id: number; comision_nombre: string | null; docente: string | null; c: [MCursada | null, MCursada | null]; }
interface MMateria {
  codigo: string; nombre: string; anio: number | null; anual: boolean;
  comisiones: MComision[]; en: [boolean, boolean]; selId: number | null;
}
// cuatri=null → anual (aparece en ambos); 0|1 → cuatrimestre específico
interface Sel { comisionId: number; cuatri: Idx | null; }

/** Cursada visible de una materia seleccionada para un cuatrimestre dado. */
function vistaCursada(mat: MMateria, sel: Sel, idx: Idx): { horarios: HorarioOut[]; comision_nombre: string | null } | null {
  const com = mat.comisiones.find(c => c.comision_id === sel.comisionId);
  if (!com) return null;
  if (mat.anual) {
    const cu = com.c[idx];
    return cu ? { horarios: cu.horarios, comision_nombre: com.comision_nombre } : null;
  }
  if (sel.cuatri === idx) {
    const cu = com.c[idx];
    return cu ? { horarios: cu.horarios, comision_nombre: com.comision_nombre } : null;
  }
  return null;
}

function solapan(a: HorarioOut[], b: HorarioOut[]): boolean {
  for (const h of a) {
    const hS = parseHF(h.hora_inicio), hE = parseHF(h.hora_fin);
    if (hS == null || hE == null || !h.dia) continue;
    const dia = normDia(h.dia);
    for (const o of b) {
      if (!o.dia || normDia(o.dia) !== dia) continue;
      const oS = parseHF(o.hora_inicio), oE = parseHF(o.hora_fin);
      if (oS == null || oE == null) continue;
      if (hS < oE && hE > oS) return true;
    }
  }
  return false;
}

/** Minutos totales de hueco entre clases del mismo día para un set de horarios. */
function totalHuecosMin(items: { horarios: HorarioOut[] }[]): number {
  const porDia = new Map<string, [number, number][]>();
  for (const it of items) {
    for (const h of it.horarios) {
      const s = parseHF(h.hora_inicio), e = parseHF(h.hora_fin);
      if (s == null || e == null || !h.dia) continue;
      const dia = normDia(h.dia);
      const arr = porDia.get(dia) ?? [];
      arr.push([s * 60, e * 60]);
      porDia.set(dia, arr);
    }
  }
  let total = 0;
  for (const arr of porDia.values()) {
    arr.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < arr.length; i++) {
      const gap = arr[i][0] - arr[i - 1][1];
      if (gap > 0) total += gap;
    }
  }
  return Math.round(total);
}

function fmtHuecos(min: number): string {
  if (min <= 0) return "sin huecos";
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}min de huecos`;
  if (h) return `${h}h de huecos`;
  return `${m}min de huecos`;
}

// ---------------------------------------------------------------------------
interface Props {
  materias1: MateriaCursableOut[];
  materias2: MateriaCursableOut[];
  cuatriInicial: Idx;
}

export function HorariosBuilder({ materias1, materias2, cuatriInicial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [cuatrimestre, setCuatrimestre] = useState<Idx>(cuatriInicial);
  const [loadingCodigo, setLoadingCodigo] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ codigo: string; comisionId: number } | null>(null);
  const [optAbierto, setOptAbierto] = useState(false);

  // Merge de ambos cuatrimestres en un solo modelo por materia
  const { mergedList, mergedMap } = useMemo(() => {
    const map = new Map<string, MMateria>();
    const add = (mats: MateriaCursableOut[], idx: Idx) => {
      for (const mat of mats) {
        let m = map.get(mat.materia_codigo);
        if (!m) {
          m = { codigo: mat.materia_codigo, nombre: mat.materia_nombre, anio: mat.anio_carrera, anual: mat.es_anual, comisiones: [], en: [false, false], selId: null };
          map.set(mat.materia_codigo, m);
        }
        m.en[idx] = true;
        if (mat.es_anual) m.anual = true;
        if (mat.cursada_seleccionada_id != null) m.selId = mat.cursada_seleccionada_id;
        for (const c of mat.comisiones) {
          let mc = m.comisiones.find(x => x.comision_id === c.comision_id);
          if (!mc) {
            mc = { comision_id: c.comision_id, comision_nombre: c.comision_nombre, docente: c.docente, c: [null, null] };
            m.comisiones.push(mc);
          }
          mc.c[idx] = { cursada_id: c.cursada_id, horarios: c.horarios };
          if (!mc.docente && c.docente) mc.docente = c.docente;
        }
      }
    };
    add(materias1, 0);
    add(materias2, 1);
    for (const m of map.values()) {
      m.comisiones.sort((a, b) => (a.comision_nombre ?? "").localeCompare(b.comision_nombre ?? ""));
    }
    const list = [...map.values()].sort((a, b) => (a.anio ?? 99) - (b.anio ?? 99) || a.codigo.localeCompare(b.codigo));
    return { mergedList: list, mergedMap: map };
  }, [materias1, materias2]);

  // Selección inicial: resolver cada cursada_seleccionada_id → comisión + cuatri
  const [seleccion, setSeleccion] = useState<Map<string, Sel>>(() => {
    const m = new Map<string, Sel>();
    for (const mat of mergedMap.values()) {
      if (mat.selId == null) continue;
      for (const com of mat.comisiones) {
        for (const idx of [0, 1] as const) {
          if (com.c[idx]?.cursada_id === mat.selId) {
            m.set(mat.codigo, { comisionId: com.comision_id, cuatri: mat.anual ? null : idx });
          }
        }
      }
    }
    return m;
  });

  const [anioFiltro, setAnioFiltro] = useState<number | "E">(() => {
    for (let i = 1; i <= 5; i++) if (mergedList.some(m => m.anio === i && m.en[cuatriInicial])) return i;
    return "E";
  });

  // Índice de color preferido y estable por materia (mismo color en tarjeta y calendario).
  const hashIndex = (codigo: string) => {
    let h = 0;
    for (let k = 0; k < codigo.length; k++) h = (h * 31 + codigo.charCodeAt(k)) >>> 0;
    return h % PALETTE.length;
  };
  const hashColor = (codigo: string) => PALETTE[hashIndex(codigo)];

  // Colores de la agenda: cada materia usa su color preferido; si ya está tomado por
  // otra materia en el calendario, cae al siguiente libre (garantiza que no se repitan).
  const colorAsignado = useMemo(() => {
    const map = new Map<string, Color>();
    const used = new Set<number>();
    const pending: string[] = [];
    for (const codigo of seleccion.keys()) {
      const pref = hashIndex(codigo);
      if (!used.has(pref)) { used.add(pref); map.set(codigo, PALETTE[pref]); }
      else pending.push(codigo);
    }
    let n = 0;
    for (const codigo of pending) {
      while (used.has(n % PALETTE.length) && used.size < PALETTE.length) n++;
      const idx = n % PALETTE.length;
      used.add(idx); map.set(codigo, PALETTE[idx]); n++;
    }
    return map;
  }, [seleccion]);

  // La tarjeta muestra el color que la materia tendrá en el calendario.
  const colorCard = (codigo: string) => colorAsignado.get(codigo) ?? hashColor(codigo);

  // Materias visibles en el cuatrimestre actual
  const materiasVista = useMemo(
    () => mergedList.filter(m => m.en[cuatrimestre]),
    [mergedList, cuatrimestre],
  );
  const years = [1, 2, 3, 4, 5].filter(y => materiasVista.some(m => m.anio === y));
  const tieneElectivas = materiasVista.some(m => m.anio === null);

  // Las que ya están en la agenda no se muestran en "Materias disponibles".
  const materiasFiltradas = useMemo(
    () => materiasVista.filter(m =>
      !seleccion.has(m.codigo) && (anioFiltro === "E" ? m.anio === null : m.anio === anioFiltro),
    ),
    [materiasVista, anioFiltro, seleccion],
  );

  // Ocupación (horarios ya elegidos) en un cuatrimestre dado
  function ocupacion(idx: Idx) {
    const res: { codigo: string; horarios: HorarioOut[] }[] = [];
    for (const [codigo, sel] of seleccion) {
      const mat = mergedMap.get(codigo);
      if (!mat) continue;
      const v = vistaCursada(mat, sel, idx);
      if (v) res.push({ codigo, horarios: v.horarios });
    }
    return res;
  }

  // Lo que se dibuja en la grilla del cuatrimestre actual
  const seleccionActiva = useMemo(() => {
    const res: { codigo: string; nombre: string; comision_nombre: string | null; horarios: HorarioOut[] }[] = [];
    for (const [codigo, sel] of seleccion) {
      const mat = mergedMap.get(codigo);
      if (!mat) continue;
      const v = vistaCursada(mat, sel, cuatrimestre);
      if (v) res.push({ codigo, nombre: mat.nombre, comision_nombre: v.comision_nombre, horarios: v.horarios });
    }
    return res;
  }, [seleccion, mergedMap, cuatrimestre]);

  const huecosMin = useMemo(() => totalHuecosMin(seleccionActiva), [seleccionActiva]);

  // ¿Agregar esta comisión genera superposición? Las anuales se chequean en ambos cuatris.
  function conflictaComision(mat: MMateria, com: MComision): boolean {
    const cuatris: Idx[] = mat.anual ? [0, 1] : [cuatrimestre];
    for (const ci of cuatris) {
      const cand = com.c[ci];
      if (!cand) continue;
      const occ = ocupacion(ci).filter(o => o.codigo !== mat.codigo);
      for (const o of occ) {
        if (solapan(cand.horarios, o.horarios)) return true;
      }
    }
    return false;
  }

  function isComSelected(mat: MMateria, com: MComision): boolean {
    const cur = seleccion.get(mat.codigo);
    return !!cur && cur.comisionId === com.comision_id && (mat.anual || cur.cuatri === cuatrimestre);
  }

  async function toggleComision(mat: MMateria, com: MComision) {
    const idx = cuatrimestre;
    const yaEsta = isComSelected(mat, com);
    setLoadingCodigo(mat.codigo);
    try {
      if (yaEsta) {
        await deseleccionarCursada(mat.codigo);
        setSeleccion(p => { const n = new Map(p); n.delete(mat.codigo); return n; });
      } else {
        const cu = mat.anual ? (com.c[idx] ?? com.c[idx === 0 ? 1 : 0]) : com.c[idx];
        if (!cu) return;
        await seleccionarCursada(mat.codigo, cu.cursada_id);
        setSeleccion(p => new Map(p).set(mat.codigo, { comisionId: com.comision_id, cuatri: mat.anual ? null : idx }));
      }
    } catch (e) { console.error(e); }
    finally {
      setLoadingCodigo(null);
      startTransition(() => router.refresh());
    }
  }

  async function quitarMateria(codigo: string) {
    setLoadingCodigo(codigo);
    try {
      await deseleccionarCursada(codigo);
      setSeleccion(p => { const n = new Map(p); n.delete(codigo); return n; });
    } catch (e) { console.error(e); }
    finally {
      setLoadingCodigo(null);
      startTransition(() => router.refresh());
    }
  }

  // Materias del cuatrimestre actual en el formato que consume el optimizador
  const materiasOpt: OptMateria[] = materiasVista.map(m => {
    const c = colorCard(m.codigo);
    return {
      codigo: m.codigo,
      nombre: m.nombre,
      anio: m.anio,
      anual: m.anual,
      rgb: c.rgb,
      text: c.text,
      numComisiones: m.comisiones.filter(x => x.c[cuatrimestre]).length,
    };
  });

  async function aplicarOptimizacion(asignaciones: AsignacionOut[]) {
    setSeleccion(prev => {
      const n = new Map(prev);
      for (const a of asignaciones) {
        const mat = mergedMap.get(a.materia_codigo);
        n.set(a.materia_codigo, { comisionId: a.comision_id, cuatri: mat?.anual ? null : cuatrimestre });
      }
      return n;
    });
    try {
      await Promise.all(asignaciones.map(a => seleccionarCursada(a.materia_codigo, a.cursada_id)));
    } catch (e) { console.error(e); }
    startTransition(() => router.refresh());
  }

  function switchCuatrimestre(idx: Idx) {
    setCuatrimestre(idx);
    for (let i = 1; i <= 5; i++) {
      if (mergedList.some(m => m.anio === i && m.en[idx])) { setAnioFiltro(i); return; }
    }
    setAnioFiltro("E");
  }

  // Drag & drop: soltar una comisión sobre la grilla la agrega
  function onGridDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragInfo(null);
    let payload: { codigo: string; comisionId: number } | null = null;
    try { payload = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { /* noop */ }
    if (!payload) return;
    const mat = mergedMap.get(payload.codigo);
    if (!mat) return;
    const com = mat.comisiones.find(c => c.comision_id === payload!.comisionId);
    if (!com) return;
    if (conflictaComision(mat, com) || isComSelected(mat, com)) return;
    void toggleComision(mat, com);
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>

      {/* ── Header (compacto) ── */}
      <div className="flex items-center gap-4 px-5 shrink-0" style={{ height: "46px", borderBottom: "1px solid rgba(115,115,115,0.1)" }}>
        <h1 className="text-[15px] font-black font-headline text-on-surface tracking-tight leading-none shrink-0">
          Armador de Horarios
        </h1>
        <span className="text-[11px] text-outline/70 shrink-0 flex items-center gap-2">
          <span>{seleccionActiva.length} materia{seleccionActiva.length !== 1 ? "s" : ""} en este cuatrimestre</span>
          {seleccionActiva.length > 0 && (
            <>
              <span className="text-outline/30">·</span>
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: huecosMin > 0 ? "rgba(255,206,143,0.95)" : "rgba(156,255,194,0.95)" }}
              >
                <span className="material-symbols-outlined text-[13px]">compress</span>
                {fmtHuecos(huecosMin)}
              </span>
            </>
          )}
        </span>

        <div className="flex-1" />

        {/* Botón de optimización */}
        <button
          onClick={() => setOptAbierto(true)}
          title="Optimización de horarios"
          className="hz-yearchip flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-xs font-bold font-label shrink-0"
          style={{ color: "#09090b", background: "#fafafa", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
        >
          <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
          Optimizar
        </button>

        <div className="flex gap-0.5 p-0.5 rounded-[10px] shrink-0" style={{ backgroundColor: "rgba(5,5,6,0.9)", border: "1px solid rgba(115,115,115,0.1)" }}>
          {["1° Cuatrimestre", "2° Cuatrimestre"].map((label, i) => (
            <button
              key={i}
              onClick={() => switchCuatrimestre(i as Idx)}
              className="hz-yearchip px-3.5 py-1.5 rounded-lg text-xs font-bold font-label"
              style={{
                color: cuatrimestre === i ? "#09090b" : "rgba(163,163,163,0.7)",
                backgroundColor: cuatrimestre === i ? "#fafafa" : "transparent",
                boxShadow: cuatrimestre === i ? "0 2px 8px rgba(0,0,0,0.35)" : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layout principal ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Panel izquierdo: tarjetas de materia ── */}
        <div className="shrink-0 flex flex-col" style={{ width: "232px", borderRight: "1px solid rgba(115,115,115,0.1)" }}>
          {/* Filtro por año — chips */}
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-2.5 shrink-0">
            {years.map(y => {
              const on = anioFiltro === y;
              return (
                <button
                  key={y}
                  onClick={() => setAnioFiltro(y)}
                  className="hz-yearchip rounded-lg text-[11px] font-bold font-label"
                  style={{
                    padding: "5px 11px",
                    color: on ? "#09090b" : "rgba(163,163,163,0.7)",
                    background: on ? "#fafafa" : "rgba(35,35,39,0.6)",
                    border: `1px solid ${on ? "#fafafa" : "rgba(115,115,115,0.18)"}`,
                  }}
                >
                  {y}° Año
                </button>
              );
            })}
            {tieneElectivas && (
              <button
                onClick={() => setAnioFiltro("E")}
                className="hz-yearchip rounded-lg text-[11px] font-bold font-label"
                style={{
                  padding: "5px 11px",
                  color: anioFiltro === "E" ? "#09090b" : "rgba(163,163,163,0.7)",
                  background: anioFiltro === "E" ? "#ffb950" : "rgba(35,35,39,0.6)",
                  border: `1px solid ${anioFiltro === "E" ? "#ffb950" : "rgba(115,115,115,0.18)"}`,
                }}
              >
                Electivas
              </button>
            )}
          </div>

          <p className="text-[9px] text-outline/45 uppercase tracking-[0.15em] px-3.5 pb-1.5 font-label select-none shrink-0">
            Materias disponibles
          </p>

          {/* Tarjetas (compactas) */}
          <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2">
            {materiasFiltradas.length === 0 ? (
              <p className="text-xs text-outline/40 text-center px-4 py-10 leading-relaxed">
                Sin materias cursables para este año.
              </p>
            ) : (
              materiasFiltradas.map(mat => {
                const color = colorCard(mat.codigo);
                const comisVista = mat.comisiones.filter(c => c.c[cuatrimestre]);
                return (
                  <div
                    key={mat.codigo}
                    className="hz-card relative"
                    style={{
                      ["--c" as string]: color.rgb,
                      borderRadius: "12px",
                      padding: "9px 10px 9px 12px",
                      background: `rgba(${color.rgb},0.05)`,
                      border: `1px solid rgba(${color.rgb},0.16)`,
                    }}
                  >
                    {/* Barra de acento lateral (identidad de color) */}
                    <span style={{ position: "absolute", left: 0, top: "9px", bottom: "9px", width: "3px", borderRadius: "0 3px 3px 0", background: `rgb(${color.rgb})`, opacity: 0.85 }} />

                    {/* Encabezado */}
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        style={{
                          width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: `rgba(${color.rgb},0.16)`,
                          border: `1px solid rgba(${color.rgb},0.25)`,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px", color: color.text }}>
                          {materiaIcon(mat.nombre)}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="font-headline"
                          style={{
                            fontSize: "12px", fontWeight: 800, lineHeight: 1.15, color: "#fafafa",
                            letterSpacing: "-0.01em",
                            overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          }}
                        >
                          {mat.nombre}
                        </p>
                        <p className="font-label" style={{ fontSize: "9.5px", fontWeight: 500, color: "rgba(115,115,115,0.8)", marginTop: "1px" }}>
                          {comisVista.length} comisión{comisVista.length !== 1 ? "es" : ""}
                          {mat.anual ? " · anual" : ""}
                        </p>
                      </div>
                    </div>

                    {/* Chips de comisión */}
                    {comisVista.length === 0 ? (
                      <p style={{ fontSize: "10px", color: "rgba(115,115,115,0.35)" }}>
                        Sin comisiones este cuatrimestre.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {comisVista.map(com => {
                          const conflict = conflictaComision(mat, com);
                          const loading = loadingCodigo === mat.codigo;
                          const cu = com.c[cuatrimestre]!;
                          const resumen = cu.horarios
                            .map(h => `${normDia(h.dia ?? "").slice(0, 3)} ${h.hora_inicio?.slice(0, 5) ?? ""}-${h.hora_fin?.slice(0, 5) ?? ""}`)
                            .join("\n");
                          return (
                            <button
                              key={com.comision_id}
                              draggable={!conflict && !loading}
                              onDragStart={e => {
                                setDragInfo({ codigo: mat.codigo, comisionId: com.comision_id });
                                e.dataTransfer.effectAllowed = "copy";
                                e.dataTransfer.setData("text/plain", JSON.stringify({ codigo: mat.codigo, comisionId: com.comision_id }));
                              }}
                              onDragEnd={() => setDragInfo(null)}
                              onClick={() => !loading && !conflict && toggleComision(mat, com)}
                              disabled={loading || conflict}
                              title={[com.docente ? `Prof: ${com.docente}` : null, resumen].filter(Boolean).join("\n") || undefined}
                              className="hz-chip font-label"
                              style={{
                                ["--c" as string]: color.rgb,
                                padding: "3.5px 9px",
                                borderRadius: "7px",
                                fontSize: "11px",
                                fontWeight: 700,
                                letterSpacing: "0.01em",
                                border: `1px solid ${conflict ? "rgba(115,115,115,0.1)" : "rgba(115,115,115,0.22)"}`,
                                background: conflict ? "rgba(9,9,11,0.4)" : "rgba(35,35,39,0.8)",
                                color: conflict ? "rgba(115,115,115,0.3)" : "#fafafa",
                                cursor: conflict ? "not-allowed" : "grab",
                                textDecoration: conflict ? "line-through" : undefined,
                              }}
                            >
                              {com.comision_nombre ?? `#${com.comision_id}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[10px] text-outline/35 text-center px-4 py-2 leading-relaxed shrink-0 border-t border-outline-variant/10">
            Arrastrá o hacé clic en una comisión
          </p>
        </div>

        {/* ── Panel derecho: calendario (drop zone) ── */}
        <div
          className="flex-1 min-w-0"
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            outline: dragInfo ? "2px dashed rgba(125,255,162,0.4)" : "none",
            outlineOffset: "-6px",
            transition: "outline-color 0.15s",
          }}
          onDragOver={e => { if (dragInfo) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
          onDrop={onGridDrop}
        >
          <ScheduleGrid seleccionados={seleccionActiva} colorMap={colorAsignado} dragging={!!dragInfo} onRemove={quitarMateria} />
        </div>
      </div>

      {optAbierto && (
        <OptimizadorModal
          materias={materiasOpt}
          preseleccionados={[...seleccion.keys()]}
          anio={ANIO_ACADEMICO}
          cuatrimestre={cuatrimestre === 0 ? 1 : 2}
          onAplicar={aplicarOptimizacion}
          onClose={() => setOptAbierto(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleGrid — ventana vertical dinámica + columnas flexibles
// ---------------------------------------------------------------------------

type SelItem = { codigo: string; nombre: string; comision_nombre: string | null; horarios: HorarioOut[] };

function ScheduleGrid({
  seleccionados,
  colorMap,
  dragging,
  onRemove,
}: {
  seleccionados: SelItem[];
  colorMap: Map<string, Color>;
  dragging: boolean;
  onRemove: (codigo: string) => void;
}) {
  const tieneSab = seleccionados.some(s => s.horarios.some(h => h.dia && normDia(h.dia) === "Sabado"));
  const dias = tieneSab ? [...DIAS, "Sabado"] : DIAS;

  let minStart = Infinity, maxEnd = -Infinity;
  for (const sel of seleccionados) {
    for (const h of sel.horarios) {
      const s = parseHF(h.hora_inicio), e = parseHF(h.hora_fin);
      if (s != null) minStart = Math.min(minStart, s);
      if (e != null) maxEnd = Math.max(maxEnd, e);
    }
  }
  const vacio = !isFinite(minStart) || !isFinite(maxEnd) || minStart >= maxEnd;
  let startH = vacio ? 7.0 : minStart - 0.4;
  let endH = vacio ? 13.5 : maxEnd + 0.4;
  startH = Math.max(6.75, startH);
  endH = Math.min(24.2, endH);
  if (endH - startH < 5) endH = Math.min(24.2, startH + 5);
  const span = endH - startH;

  const pct = (v: number) => ((v - startH) / span) * 100;
  const toPct = (t: string | null) => { const v = parseHF(t); return v === null ? null : pct(v); };
  const modulosVis = UTN_MODULOS.filter(t => { const v = moduloH(t); return v >= startH - 0.05 && v <= endH + 0.05; });

  return (
    <div style={{ height: "100%", minWidth: `${LABEL_W + dias.length * 104}px`, display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Encabezado de días — barra sólida tipo Google/Cron */}
      <div
        className="flex shrink-0"
        style={{
          paddingLeft: `${LABEL_W}px`,
          background: "rgba(9,9,11,0.75)",
          borderBottom: "1px solid rgba(115,115,115,0.16)",
        }}
      >
        {dias.map((dia, i) => (
          <div
            key={dia}
            className="text-center font-headline uppercase"
            style={{
              flex: 1,
              fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em",
              color: "rgba(250,250,250,0.95)",
              padding: "14px 0",
              borderLeft: i === 0 ? "none" : "1px solid rgba(115,115,115,0.1)",
            }}
          >
            {DIA_LABEL[dia] ?? dia.slice(0, 3).toUpperCase()}
          </div>
        ))}
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1" style={{ minHeight: 0 }}>
        {/* Etiquetas de módulo (horas) — más contraste y peso */}
        <div className="shrink-0" style={{ width: `${LABEL_W}px`, position: "relative", borderRight: "1px solid rgba(115,115,115,0.1)" }}>
          {modulosVis.map(t => (
            <div key={t} className="font-label" style={{ position: "absolute", top: `${pct(moduloH(t))}%`, right: "10px", transform: "translateY(-50%)", fontSize: "11px", fontWeight: 700, color: "rgba(163,163,163,0.78)", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
              {t}
            </div>
          ))}
        </div>

        {/* Columnas */}
        <div className="relative flex" style={{ flex: 1 }}>
          {/* Líneas horizontales en los módulos — un poco más visibles para seguir la fila */}
          {modulosVis.map(t => (
            <div key={t} style={{ position: "absolute", left: 0, right: 0, top: `${pct(moduloH(t))}%`, borderTop: "1px solid rgba(115,115,115,0.1)", pointerEvents: "none" }} />
          ))}

          {dias.map((dia, i) => (
            <div
              key={dia}
              className="relative hz-col"
              style={{
                flex: 1,
                // Fondo alternado muy sutil + separadores de columna definidos
                background: i % 2 === 1 ? "rgba(115,115,115,0.025)" : "transparent",
                borderLeft: i === 0 ? "none" : "1px solid rgba(115,115,115,0.09)",
              }}
            >
              {seleccionados.map(sel => {
                const color = colorMap.get(sel.codigo) ?? PALETTE[0];
                return sel.horarios
                  .filter(h => h.dia && normDia(h.dia) === dia)
                  .map((h, idx) => {
                    const top = toPct(h.hora_inicio), bot = toPct(h.hora_fin);
                    if (top === null || bot === null) return null;
                    const height = Math.max(bot - top, 2.2);
                    const showCom = height >= 6.5;   // nivel 2: comisión
                    const showHora = height >= 9.5;  // nivel 3: horario
                    const tiny = height < 4.5;
                    return (
                      <div
                        key={`${sel.codigo}-${idx}`}
                        onClick={() => onRemove(sel.codigo)}
                        title={`${sel.nombre} · ${sel.comision_nombre ?? ""}\n${h.hora_inicio?.slice(0, 5) ?? ""}–${h.hora_fin?.slice(0, 5) ?? ""}${h.aula ? ` · ${h.aula}` : ""}\n(clic para quitar)`}
                        className="group hz-event"
                        style={{
                          ["--c" as string]: color.rgb,
                          position: "absolute", top: `${top}%`, height: `${height}%`, left: "4px", right: "4px",
                          borderRadius: "8px", overflow: "hidden", cursor: "pointer",
                          // Evento SÓLIDO estilo Linear: base opaca + tinte de color suave, borde discreto.
                          background: `linear-gradient(0deg, rgba(${color.rgb},0.14), rgba(${color.rgb},0.14)), #1a1a1e`,
                          border: `1px solid rgba(${color.rgb},0.26)`,
                          borderLeft: `3px solid rgb(${color.rgb})`,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                          display: "flex", flexDirection: "column",
                          justifyContent: tiny ? "center" : "flex-start",
                          padding: tiny ? "0 8px" : "6px 8px",
                        }}
                      >
                        {/* Botón quitar (hover) */}
                        <span
                          className="material-symbols-outlined opacity-0 group-hover:opacity-100"
                          style={{ position: "absolute", top: "3px", right: "3px", fontSize: "14px", color: color.text, transition: "opacity 0.15s", background: "rgba(9,9,11,0.7)", borderRadius: "6px", padding: "1px" }}
                        >
                          close
                        </span>

                        {/* Nivel 1 — nombre + ícono (domina visualmente) */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                          {!tiny && (
                            <span className="material-symbols-outlined shrink-0" style={{ fontSize: "15px", color: color.text }}>
                              {materiaIcon(sel.nombre)}
                            </span>
                          )}
                          <p className="font-headline" style={{ fontSize: "12px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.01em", color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: tiny ? "nowrap" : "normal", display: "-webkit-box", WebkitLineClamp: showHora ? 2 : 1, WebkitBoxOrient: "vertical", flex: 1, minWidth: 0 }}>
                            {sel.nombre}
                          </p>
                        </div>

                        {/* Nivel 2 — comisión */}
                        {showCom && sel.comision_nombre && (
                          <p className="font-label" style={{ fontSize: "10.5px", fontWeight: 700, lineHeight: 1.2, marginTop: "4px", color: "rgba(250,250,250,0.9)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sel.comision_nombre}
                          </p>
                        )}

                        {/* Nivel 3 — horario (presente pero discreto) */}
                        {showHora && (
                          <p className="font-label" style={{ fontSize: "9.5px", fontWeight: 500, lineHeight: 1.2, marginTop: "auto", paddingTop: "4px", color: "rgba(163,163,163,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {h.hora_inicio?.slice(0, 5) ?? ""} – {h.hora_fin?.slice(0, 5) ?? ""}
                          </p>
                        )}
                      </div>
                    );
                  });
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Empty / drop hint */}
      {(seleccionados.length === 0 || dragging) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", pointerEvents: "none" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "40px", color: dragging ? "rgba(125,255,162,0.4)" : "rgba(115,115,115,0.14)", fontVariationSettings: "'FILL' 0" }}>
            {dragging ? "add_circle" : "calendar_view_week"}
          </span>
          <p style={{ fontSize: "12px", color: dragging ? "rgba(125,255,162,0.6)" : "rgba(115,115,115,0.3)" }}>
            {dragging ? "Soltá para agregar a tu cursada" : "Elegí una materia y arrastrá sus comisiones acá"}
          </p>
        </div>
      )}
    </div>
  );
}
