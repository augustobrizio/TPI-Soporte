"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { materiaIcon } from "@/lib/materiaIcon";
import { actualizarTarea, crearTarea, eliminarTarea } from "@/lib/api";
import type { PrioridadTask, TaskCreate, TaskOut, TaskUpdate, TipoTask } from "@/lib/types";

// ===========================================================================
// Tipos auxiliares
// ===========================================================================

export interface MateriaLite {
  codigo: string;
  nombre: string;
  anio: number | null;
}

type Vista = "hoy" | "semana" | "todo";

// La "importancia" reemplaza a la prioridad manual de 3 niveles. Es binaria:
// el alumno marca una estrella si la tarea importa. La urgencia (cuánto falta)
// se deriva sola de la fecha → un solo eje temporal, sin redundancia.
// En la DB seguimos guardando prioridad="alta" para importante / null para normal.
const IMPORTANTE: PrioridadTask = "alta";
const esImportante = (t: { prioridad: PrioridadTask | null }) => t.prioridad === IMPORTANTE;

// Capacidad diaria por defecto (horas de estudio que el alumno se banca por día).
// En V2 esto saldrá de los huecos reales de la grilla de Horarios.
const CAPACIDAD_DIARIA_H = 4;

// ===========================================================================
// Config visual — color con jerarquía: la MATERIA es el único color de la
// tarjeta. El tipo es un ícono monocromo, la urgencia es texto. Menos ruido.
// ===========================================================================

const TIPO: Record<TipoTask, { label: string; icon: string }> = {
  examen:   { label: "Examen",   icon: "quiz" },
  tp:       { label: "TP",       icon: "assignment" },
  entrega:  { label: "Entrega",  icon: "upload_file" },
  lectura:  { label: "Lectura",  icon: "menu_book" },
  estudio:  { label: "Estudio",  icon: "school" },
  personal: { label: "Personal", icon: "interests" },
};
const TIPOS_ORDEN: TipoTask[] = ["examen", "tp", "entrega", "lectura", "estudio", "personal"];

const PALETTE = [
  "138,180,255", "255,176,72", "112,240,160", "255,120,180",
  "186,150,255", "94,222,222", "255,214,92",
];
function materiaColor(codigo: string): string {
  let h = 0;
  for (let k = 0; k < codigo.length; k++) h = (h * 31 + codigo.charCodeAt(k)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ===========================================================================
// Urgencia automática (único eje temporal)
// ===========================================================================

interface Urgencia {
  level: "vencida" | "horas" | "hoy" | "manana" | "semana" | "lejos" | "ninguna";
  label: string;
  rgb: string;
  pulse: boolean;
}

function calcUrgencia(iso: string | null, ahora: number): Urgencia {
  if (!iso) return { level: "ninguna", label: "", rgb: "141,145,155", pulse: false };
  const t = new Date(iso).getTime();
  const diffMs = t - ahora;
  const diffH = diffMs / 3_600_000;
  const diffD = diffMs / 86_400_000;

  if (diffMs < 0) {
    const absH = Math.abs(diffH);
    const label = absH < 24 ? `hace ${Math.max(1, Math.round(absH))}h` : `hace ${Math.round(Math.abs(diffD))}d`;
    return { level: "vencida", label: `Venció ${label}`, rgb: "255,90,90", pulse: true };
  }
  if (diffH < 12) return { level: "horas", label: `en ${Math.max(1, Math.round(diffH))}h`, rgb: "255,120,90", pulse: true };
  if (diffH < 24) return { level: "hoy", label: "hoy", rgb: "255,150,90", pulse: false };
  if (diffD < 2)  return { level: "manana", label: "mañana", rgb: "255,190,90", pulse: false };
  if (diffD < 7)  return { level: "semana", label: `en ${Math.ceil(diffD)} días`, rgb: "255,214,120", pulse: false };
  return { level: "lejos", label: `en ${Math.ceil(diffD)} días`, rgb: "141,180,160", pulse: false };
}

// ===========================================================================
// Buckets temporales — el orden en que el cerebro decide "qué hago ahora"
// ===========================================================================

type Bucket = "vencido" | "hoy" | "manana" | "semana" | "adelante" | "sinfecha";

const BUCKET_META: Record<Bucket, { label: string; icon: string; rgb: string }> = {
  vencido:  { label: "Vencido",       icon: "warning",     rgb: "255,90,90" },
  hoy:      { label: "Hoy",           icon: "today",       rgb: "255,150,90" },
  manana:   { label: "Mañana",        icon: "wb_twilight", rgb: "255,190,90" },
  semana:   { label: "Próximos días", icon: "date_range",  rgb: "255,214,120" },
  adelante: { label: "Más adelante",  icon: "event",       rgb: "141,180,160" },
  sinfecha: { label: "Sin fecha",     icon: "inbox",       rgb: "141,145,155" },
};
const BUCKET_ORDEN: Bucket[] = ["vencido", "hoy", "manana", "semana", "adelante", "sinfecha"];

function mismoDia(a: number, b: number): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function bucketDe(t: TaskOut, ahora: number): Bucket {
  if (!t.fecha_vencimiento) return "sinfecha";
  const venc = new Date(t.fecha_vencimiento).getTime();
  if (venc < ahora && !mismoDia(venc, ahora)) return "vencido";
  if (mismoDia(venc, ahora)) return "hoy";
  const finManana = new Date(ahora); finManana.setDate(finManana.getDate() + 1);
  if (mismoDia(venc, finManana.getTime())) return "manana";
  const diffD = (venc - ahora) / 86_400_000;
  if (diffD < 7) return "semana";
  return "adelante";
}

// Buckets visibles según la vista (qué se muestra primero, qué se esconde)
const BUCKETS_POR_VISTA: Record<Vista, Bucket[]> = {
  hoy:    ["vencido", "hoy"],
  semana: ["vencido", "hoy", "manana", "semana"],
  todo:   BUCKET_ORDEN,
};

// ===========================================================================
// Parser de captura en lenguaje natural — el corazón de "agregar en segundos"
// Ej: "TP Análisis vie 18h 3h #AM2 !" → título + fecha + estimado + materia + importante
// ===========================================================================

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const DIAS_ABBR: Record<string, number> = {
  dom: 0, lun: 1, mar: 2, mie: 3, "mié": 3, jue: 4, vie: 5, sab: 6, "sáb": 6,
};

const normTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface ParsedCapture {
  titulo: string;
  fecha_vencimiento: string | null;
  estimado_horas: number | null;
  materia_codigo: string | null;
  tipo: TipoTask | null;
  importante: boolean;
  chips: { icon: string; label: string; rgb: string }[];
}

function proximoDiaSemana(target: number, base: Date): Date {
  const d = new Date(base);
  d.setHours(23, 59, 0, 0);
  const delta = (target - d.getDay() + 7) % 7 || 7; // siempre el próximo, nunca hoy
  d.setDate(d.getDate() + delta);
  return d;
}

function inferirTipo(txt: string): TipoTask | null {
  const n = normTxt(txt);
  if (/\b(parcial|final|examen|recuperatorio|coloquio)\b/.test(n)) return "examen";
  if (/\b(tp|trabajo practico)\b/.test(n)) return "tp";
  if (/\b(entrega|informe|presentar|subir)\b/.test(n)) return "entrega";
  if (/\b(leer|lectura|capitulo|cap\.?)\b/.test(n)) return "lectura";
  if (/\b(estudiar|repasar|estudio)\b/.test(n)) return "estudio";
  return null;
}

function parseCaptura(raw: string, materias: MateriaLite[], ahora: number): ParsedCapture {
  let txt = ` ${raw} `;
  const chips: ParsedCapture["chips"] = [];
  let fecha: Date | null = null;
  let hora: { h: number; m: number } | null = null;
  let estimado: number | null = null;
  let materia_codigo: string | null = null;
  let importante = false;

  // --- importante (!) ---
  if (/\s!\s*$/.test(txt) || /\s!\s/.test(txt)) {
    importante = true;
    txt = txt.replace(/\s!(?=\s)/g, " ");
    chips.push({ icon: "star", label: "Importante", rgb: "255,206,84" });
  }

  // --- estimado de horas (3h, 2.5h, 90m) --- (antes que la hora del día)
  const mEst = txt.match(/\s(\d+(?:[.,]\d+)?)\s*h(?:s|rs)?\b(?!:)/i);
  const mEstMin = txt.match(/\s(\d{2,3})\s*m(?:in)?\b/i);
  if (mEst) {
    estimado = parseFloat(mEst[1].replace(",", "."));
    txt = txt.replace(mEst[0], " ");
    chips.push({ icon: "timer", label: `${estimado}h estim.`, rgb: "186,150,255" });
  } else if (mEstMin) {
    estimado = Math.round((parseInt(mEstMin[1], 10) / 60) * 10) / 10;
    txt = txt.replace(mEstMin[0], " ");
    chips.push({ icon: "timer", label: `${estimado}h estim.`, rgb: "186,150,255" });
  }

  // --- hora del día (18:30, 18hs como hora si no se tomó como estimado) ---
  const mHora = txt.match(/\s(\d{1,2}):(\d{2})\b/) || txt.match(/\sa\s+las?\s+(\d{1,2})\b/i);
  if (mHora) {
    hora = { h: parseInt(mHora[1], 10), m: mHora[2] ? parseInt(mHora[2], 10) : 0 };
    txt = txt.replace(mHora[0], " ");
  }

  // --- fechas relativas / días / dd/mm ---
  const n = normTxt(txt);
  const base = new Date(ahora);
  if (/\bhoy\b/.test(n)) {
    fecha = new Date(ahora); txt = txt.replace(/\bhoy\b/i, " ");
  } else if (/\bmanana\b/.test(n) || /\bmañana\b/i.test(txt)) {
    fecha = new Date(ahora); fecha.setDate(fecha.getDate() + 1); txt = txt.replace(/\bma(n|ñ)ana\b/i, " ");
  } else if (/\bpasado\s*manana\b/.test(n) || /\bpasado\s*mañana\b/i.test(txt)) {
    fecha = new Date(ahora); fecha.setDate(fecha.getDate() + 2); txt = txt.replace(/\bpasado\s*ma(n|ñ)ana\b/i, " ");
  } else {
    // día de la semana completo o abreviado
    let dia = -1, matched = "";
    for (let i = 0; i < DIAS_SEMANA.length; i++) {
      if (new RegExp(`\\b${DIAS_SEMANA[i]}\\b`).test(n)) { dia = i; matched = DIAS_SEMANA[i]; break; }
    }
    if (dia < 0) {
      for (const [abbr, d] of Object.entries(DIAS_ABBR)) {
        if (new RegExp(`\\b${abbr}\\b`).test(n)) { dia = d; matched = abbr; break; }
      }
    }
    if (dia >= 0) {
      fecha = proximoDiaSemana(dia, base);
      txt = txt.replace(new RegExp(`\\b${matched}\\b`, "i"), " ");
    } else {
      // dd/mm
      const mFecha = txt.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (mFecha) {
        const dd = parseInt(mFecha[1], 10), mm = parseInt(mFecha[2], 10) - 1;
        const yy = mFecha[3] ? (mFecha[3].length === 2 ? 2000 + parseInt(mFecha[3], 10) : parseInt(mFecha[3], 10)) : base.getFullYear();
        fecha = new Date(yy, mm, dd);
        txt = txt.replace(mFecha[0], " ");
      }
    }
  }

  // aplicar hora a la fecha
  if (fecha) {
    if (hora) fecha.setHours(hora.h, hora.m, 0, 0);
    else fecha.setHours(23, 59, 0, 0);
    const fmt = fecha.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
    const horaLbl = hora ? ` ${String(hora.h).padStart(2, "0")}:${String(hora.m).padStart(2, "0")}` : "";
    chips.push({ icon: "event", label: fmt + horaLbl, rgb: "138,180,255" });
  }

  // --- materia (#codigo o por nombre, nombre más largo primero) ---
  const mHash = txt.match(/\s#(\S+)/);
  if (mHash) {
    const code = mHash[1].toUpperCase();
    const hit = materias.find((x) => x.codigo.toUpperCase() === code);
    materia_codigo = hit?.codigo ?? null;
    if (materia_codigo) {
      txt = txt.replace(mHash[0], " ");
      chips.push({ icon: materiaIcon(hit!.nombre), label: hit!.nombre, rgb: materiaColor(materia_codigo) });
    }
  }
  if (!materia_codigo) {
    const ordenadas = [...materias].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const m of ordenadas) {
      const nm = normTxt(m.nombre);
      // matchea por nombre completo o por la primera palabra significativa (>3 letras)
      const primera = nm.split(/\s+/).find((w) => w.length > 3) ?? nm;
      if (n.includes(nm) || (primera.length > 3 && new RegExp(`\\b${primera}`).test(n))) {
        materia_codigo = m.codigo;
        const re = n.includes(nm) ? new RegExp(m.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : new RegExp(primera, "i");
        txt = txt.replace(re, " ");
        chips.push({ icon: materiaIcon(m.nombre), label: m.nombre, rgb: materiaColor(m.codigo) });
        break;
      }
    }
  }

  const tipo = inferirTipo(raw);
  if (tipo) chips.unshift({ icon: TIPO[tipo].icon, label: TIPO[tipo].label, rgb: "195,200,215" });

  const titulo = txt.replace(/\s+/g, " ").trim();
  return {
    titulo,
    fecha_vencimiento: fecha ? toLocalIso(fecha) : null,
    estimado_horas: estimado,
    materia_codigo,
    tipo,
    importante,
    chips,
  };
}

function toLocalIso(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso);
  const conHora = d.getHours() !== 0 || d.getMinutes() !== 0;
  // 23:59 se trata como "fin del día" → no mostrar hora
  const finDia = d.getHours() === 23 && d.getMinutes() === 59;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
    + (conHora && !finDia ? ` ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "");
}

const fmtHoras = (h: number) => (h % 1 === 0 ? `${h}` : h.toFixed(1));

// ===========================================================================
// Componente raíz
// ===========================================================================

interface Props {
  initialTareas: TaskOut[];
  materias: MateriaLite[];
}

export function TareasView({ initialTareas, materias }: Props) {
  const [tareas, setTareas] = useState<TaskOut[]>(initialTareas);
  const [, startTransition] = useTransition();

  // Reloj que avanza cada 60s → urgencias siempre frescas.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Navegación / estado de UI
  const [vista, setVista] = useState<Vista>("hoy");
  const [filtroMateria, setFiltroMateria] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<TipoTask | null>(null);
  const [mostrarHechas, setMostrarHechas] = useState(false);
  const [expandidaId, setExpandidaId] = useState<number | null>(null);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [planAbierto, setPlanAbierto] = useState(true);
  const [sidebarColapsado, setSidebarColapsado] = useState(false);

  const captureRef = useRef<HTMLInputElement>(null);

  // Mapa código→nombre (incluye materias usadas en tareas aunque ya no se cursen)
  const materiaNombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of materias) m.set(x.codigo, x.nombre);
    for (const t of tareas) if (t.materia_codigo && !m.has(t.materia_codigo)) m.set(t.materia_codigo, t.materia_codigo);
    return m;
  }, [materias, tareas]);

  // -------------------- optimistic --------------------
  const [optimisticTareas, applyOptimistic] = useOptimistic<
    TaskOut[],
    { tipo: "upsert" | "delete"; data: TaskOut }
  >(tareas, (state, action) => {
    if (action.tipo === "delete") return state.filter((t) => t.id !== action.data.id);
    const existe = state.some((t) => t.id === action.data.id);
    return existe ? state.map((t) => (t.id === action.data.id ? action.data : t)) : [...state, action.data];
  });

  // -------------------- handlers --------------------
  const handleToggle = useCallback((tarea: TaskOut) => {
    const upd = { ...tarea, completada: !tarea.completada };
    startTransition(async () => {
      applyOptimistic({ tipo: "upsert", data: upd });
      const saved = await actualizarTarea(tarea.id, { completada: upd.completada });
      setTareas((p) => p.map((t) => (t.id === saved.id ? saved : t)));
    });
  }, [applyOptimistic]);

  const handleCrear = useCallback((payload: TaskCreate) => {
    const temp: TaskOut = {
      id: -Date.now(), usuario_id: 1, titulo: payload.titulo,
      descripcion: payload.descripcion ?? null, completada: false,
      fecha_vencimiento: payload.fecha_vencimiento ?? null,
      prioridad: payload.prioridad ?? null, tipo: payload.tipo ?? null,
      estimado_horas: payload.estimado_horas ?? null,
      materia_codigo: payload.materia_codigo ?? null,
      orden: 0, created_at: new Date().toISOString(),
    };
    startTransition(async () => {
      applyOptimistic({ tipo: "upsert", data: temp });
      const saved = await crearTarea(payload);
      setTareas((p) => [...p.filter((t) => t.id !== temp.id), saved]);
    });
  }, [applyOptimistic]);

  const handleActualizar = useCallback((tarea: TaskOut, updates: TaskUpdate) => {
    const upd = { ...tarea, ...updates } as TaskOut;
    startTransition(async () => {
      applyOptimistic({ tipo: "upsert", data: upd });
      const saved = await actualizarTarea(tarea.id, updates);
      setTareas((p) => p.map((t) => (t.id === saved.id ? saved : t)));
    });
  }, [applyOptimistic]);

  const handleEliminar = useCallback((tarea: TaskOut) => {
    startTransition(async () => {
      applyOptimistic({ tipo: "delete", data: tarea });
      await eliminarTarea(tarea.id);
      setTareas((p) => p.filter((t) => t.id !== tarea.id));
    });
  }, [applyOptimistic]);

  const handleToggleImportante = useCallback((tarea: TaskOut) => {
    handleActualizar(tarea, { prioridad: esImportante(tarea) ? null : IMPORTANTE });
  }, [handleActualizar]);

  // -------------------- atajos de teclado --------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const enInput = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setPaletaAbierta((v) => !v); return;
      }
      if (e.key === "Escape") { setExpandidaId(null); return; }
      if (enInput) return;
      if (e.key === "/" || e.key.toLowerCase() === "n") {
        e.preventDefault(); captureRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // -------------------- derivados --------------------
  const activas = useMemo(() => optimisticTareas.filter((t) => !t.completada), [optimisticTareas]);

  // Filtro por materia + tipo (la vista define la ventana temporal)
  const filtradas = useMemo(() => {
    return activas.filter((t) => {
      if (filtroMateria && t.materia_codigo !== filtroMateria) return false;
      if (filtroTipo && t.tipo !== filtroTipo) return false;
      return true;
    });
  }, [activas, filtroMateria, filtroTipo]);

  // Orden dentro de cada bucket: importantes primero, luego por fecha
  const ordenarBucket = useCallback((arr: TaskOut[]) => {
    return [...arr].sort((a, b) => {
      if (esImportante(a) !== esImportante(b)) return esImportante(a) ? -1 : 1;
      const av = a.fecha_vencimiento ? new Date(a.fecha_vencimiento).getTime() : Infinity;
      const bv = b.fecha_vencimiento ? new Date(b.fecha_vencimiento).getTime() : Infinity;
      return av - bv;
    });
  }, []);

  // Agrupación temporal según la vista
  const grupos = useMemo(() => {
    const visibles = BUCKETS_POR_VISTA[vista];
    const buckets: Record<string, TaskOut[]> = {};
    for (const t of filtradas) {
      const b = bucketDe(t, ahora);
      if (!visibles.includes(b)) continue;
      (buckets[b] ??= []).push(t);
    }
    return visibles
      .filter((b) => buckets[b]?.length)
      .map((b) => ({ key: b, ...BUCKET_META[b], tareas: ordenarBucket(buckets[b]) }));
  }, [filtradas, vista, ahora, ordenarBucket]);

  // Completadas (toggle al pie)
  const completadas = useMemo(
    () => optimisticTareas.filter((t) =>
      t.completada
      && (!filtroMateria || t.materia_codigo === filtroMateria)
      && (!filtroTipo || t.tipo === filtroTipo),
    ),
    [optimisticTareas, filtroMateria, filtroTipo],
  );

  // -------------------- Plan del día (el diferencial) --------------------
  const plan = useMemo(() => {
    const venceHoy = activas.filter((t) => {
      const b = bucketDe(t, ahora);
      return b === "vencido" || b === "hoy";
    });
    const cargaHoy = venceHoy.reduce((acc, t) => acc + (t.estimado_horas ?? 0), 0);
    const cargaSemana = activas
      .filter((t) => ["vencido", "hoy", "manana", "semana"].includes(bucketDe(t, ahora)))
      .reduce((acc, t) => acc + (t.estimado_horas ?? 0), 0);

    // Sugerencia: la más urgente entre las importantes; si no hay, la más urgente.
    const candidatas = [...activas].sort((a, b) => {
      const av = a.fecha_vencimiento ? new Date(a.fecha_vencimiento).getTime() : Infinity;
      const bv = b.fecha_vencimiento ? new Date(b.fecha_vencimiento).getTime() : Infinity;
      if (esImportante(a) !== esImportante(b)) return esImportante(a) ? -1 : 1;
      return av - bv;
    });
    const sugerida = candidatas[0] ?? null;

    // Quick win: la pendiente con fecha más corta de estimado (arranque fácil)
    const quickWin = [...activas]
      .filter((t) => t.estimado_horas != null && t.estimado_horas > 0 && t.id !== sugerida?.id)
      .sort((a, b) => (a.estimado_horas ?? 0) - (b.estimado_horas ?? 0))[0] ?? null;

    return { cargaHoy, cargaSemana, sugerida, quickWin, pendientesHoy: venceHoy.length };
  }, [activas, ahora]);

  // -------------------- comandos para la paleta --------------------
  const comandos = useMemo<Comando[]>(() => {
    const cmds: Comando[] = [
      { id: "v-hoy", icon: "today", label: "Ir a Hoy", grupo: "Vistas", run: () => setVista("hoy") },
      { id: "v-semana", icon: "date_range", label: "Ir a Esta semana", grupo: "Vistas", run: () => setVista("semana") },
      { id: "v-todo", icon: "list", label: "Ir a Todas", grupo: "Vistas", run: () => setVista("todo") },
      { id: "f-clear", icon: "filter_alt_off", label: "Limpiar filtros", grupo: "Filtros", run: () => { setFiltroMateria(null); setFiltroTipo(null); } },
      { id: "t-plan", icon: "insights", label: planAbierto ? "Ocultar plan del día" : "Mostrar plan del día", grupo: "Ver", run: () => setPlanAbierto((v) => !v) },
      { id: "t-hechas", icon: "check_circle", label: mostrarHechas ? "Ocultar completadas" : "Mostrar completadas", grupo: "Ver", run: () => setMostrarHechas((v) => !v) },
    ];
    for (const tp of TIPOS_ORDEN) {
      cmds.push({ id: `tipo-${tp}`, icon: TIPO[tp].icon, label: `Filtrar: ${TIPO[tp].label}`, grupo: "Filtros", run: () => { setFiltroTipo(tp); setVista("todo"); } });
    }
    for (const m of materias) {
      cmds.push({ id: `mat-${m.codigo}`, icon: materiaIcon(m.nombre), label: `Materia: ${m.nombre}`, grupo: "Materias", rgb: materiaColor(m.codigo), run: () => { setFiltroMateria(m.codigo); setVista("todo"); } });
    }
    return cmds;
  }, [materias, planAbierto, mostrarHechas]);

  const irATarea = useCallback((t: TaskOut) => {
    setVista("todo"); setFiltroMateria(null); setFiltroTipo(null);
    setExpandidaId(t.id);
    requestAnimationFrame(() => document.getElementById(`tarea-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);

  // materias presentes (cursando + usadas)
  const materiasSidebar = useMemo(() => {
    const cont = new Map<string, number>();
    for (const t of activas) if (t.materia_codigo) cont.set(t.materia_codigo, (cont.get(t.materia_codigo) ?? 0) + 1);
    const base = [...materias];
    for (const [cod] of cont) if (!base.some((m) => m.codigo === cod)) base.push({ codigo: cod, nombre: materiaNombre.get(cod) ?? cod, anio: null });
    return base.map((m) => ({ ...m, count: cont.get(m.codigo) ?? 0 }));
  }, [materias, activas, materiaNombre]);

  const conteoVistas = useMemo(() => {
    let hoy = 0, semana = 0;
    for (const t of activas) {
      const b = bucketDe(t, ahora);
      if (b === "vencido" || b === "hoy") hoy++;
      if (["vencido", "hoy", "manana", "semana"].includes(b)) semana++;
    }
    return { hoy, semana, todo: activas.length };
  }, [activas, ahora]);

  const tituloVista = vista === "hoy" ? "Hoy" : vista === "semana" ? "Esta semana" : "Todas las tareas";
  const hayFiltro = !!(filtroMateria || filtroTipo);

  return (
    <div className="flex" style={{ height: "calc(100vh - 4rem)" }}>

      {/* ════════════ Sidebar de VISTAS (no de filtros) ════════════ */}
      <aside
        className="shrink-0 hidden md:flex flex-col overflow-y-auto transition-all duration-200"
        style={{ width: sidebarColapsado ? "60px" : "184px", borderRight: "1px solid rgba(141,145,155,0.1)" }}
      >
        <div className="flex items-center justify-between px-3 h-[52px] shrink-0">
          {!sidebarColapsado && <span className="text-[15px] font-black font-headline text-on-surface tracking-tight">Tareas</span>}
          <button
            onClick={() => setSidebarColapsado((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container/60 transition-colors"
            aria-label="Colapsar"
          >
            <span className="material-symbols-outlined text-[18px]">{sidebarColapsado ? "chevron_right" : "chevron_left"}</span>
          </button>
        </div>

        <nav className="px-2 space-y-0.5">
          <VistaItem icon="wb_sunny" label="Hoy" count={conteoVistas.hoy} active={vista === "hoy"} colapsado={sidebarColapsado} onClick={() => { setVista("hoy"); setFiltroMateria(null); setFiltroTipo(null); }} />
          <VistaItem icon="date_range" label="Esta semana" count={conteoVistas.semana} active={vista === "semana"} colapsado={sidebarColapsado} onClick={() => { setVista("semana"); setFiltroMateria(null); setFiltroTipo(null); }} />
          <VistaItem icon="inbox" label="Todas" count={conteoVistas.todo} active={vista === "todo" && !hayFiltro} colapsado={sidebarColapsado} onClick={() => { setVista("todo"); setFiltroMateria(null); setFiltroTipo(null); }} />
        </nav>

        {materiasSidebar.length > 0 && (
          <div className="mt-5 px-2">
            {!sidebarColapsado && <p className="text-[9px] text-outline/45 uppercase tracking-[0.15em] mb-2 px-2 font-label">Materias</p>}
            <div className="space-y-0.5">
              {materiasSidebar.map((m) => (
                <VistaItem
                  key={m.codigo}
                  icon={materiaIcon(m.nombre)}
                  label={m.nombre}
                  count={m.count}
                  rgb={materiaColor(m.codigo)}
                  active={filtroMateria === m.codigo}
                  colapsado={sidebarColapsado}
                  onClick={() => {
                    if (filtroMateria === m.codigo) { setFiltroMateria(null); }
                    else { setFiltroMateria(m.codigo); setVista("todo"); }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto p-2.5">
          <button
            onClick={() => setPaletaAbierta(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-outline/70 hover:text-on-surface hover:bg-surface-container/50 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            {!sidebarColapsado && <span className="text-[11px] font-label">Buscar</span>}
            {!sidebarColapsado && <kbd className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-surface-container/70 text-outline/60 font-mono">⌘K</kbd>}
          </button>
        </div>
      </aside>

      {/* ════════════ Columna central ════════════ */}
      <main className="flex-1 min-w-0 flex flex-col">

        {/* Encabezado liviano: título de la vista + chips de filtro activos */}
        <header className="flex items-center gap-3 px-5 h-[52px] shrink-0" style={{ borderBottom: "1px solid rgba(141,145,155,0.1)" }}>
          <h1 className="text-[15px] font-black font-headline text-on-surface tracking-tight">
            {filtroMateria ? (materiaNombre.get(filtroMateria) ?? filtroMateria) : tituloVista}
          </h1>
          {filtroMateria && (
            <FiltroChip label={materiaNombre.get(filtroMateria) ?? filtroMateria} rgb={materiaColor(filtroMateria)} onClear={() => setFiltroMateria(null)} />
          )}
          {filtroTipo && (
            <FiltroChip label={TIPO[filtroTipo].label} rgb="195,200,215" onClear={() => setFiltroTipo(null)} />
          )}
          <div className="flex-1" />
          <button onClick={() => setPaletaAbierta(true)} className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container/60" aria-label="Buscar">
            <span className="material-symbols-outlined text-[19px]">search</span>
          </button>
          <button
            onClick={() => setPlanAbierto((v) => !v)}
            className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center transition-colors"
            style={{ color: planAbierto ? "rgb(173,198,255)" : "rgba(141,145,155,0.7)", background: planAbierto ? "rgba(173,198,255,0.1)" : "transparent" }}
            aria-label="Plan del día"
          >
            <span className="material-symbols-outlined text-[19px]">insights</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-5">

            {/* ── Captura rápida con parsing en lenguaje natural ── */}
            <QuickCapture ref={captureRef} materias={materias} ahora={ahora} onCrear={handleCrear} />

            {/* ── Lista ── */}
            {grupos.length === 0 ? (
              <EmptyState vista={vista} hayFiltro={hayFiltro} />
            ) : (
              <div className="mt-5 space-y-6">
                {grupos.map((g) => (
                  <section key={g.key}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="material-symbols-outlined text-[15px]" style={{ color: `rgb(${g.rgb})` }}>{g.icon}</span>
                      <h2 className="text-[11px] uppercase tracking-[0.14em] font-bold font-label" style={{ color: `rgba(${g.rgb},0.95)` }}>{g.label}</h2>
                      <span className="text-[10px] text-outline/45 font-label">{g.tareas.length}</span>
                      <div className="flex-1 h-px" style={{ background: `rgba(${g.rgb},0.1)` }} />
                    </div>
                    <div className="space-y-px">
                      {g.tareas.map((t) => (
                        <TaskRow
                          key={t.id}
                          tarea={t}
                          ahora={ahora}
                          materias={materias}
                          materiaNombre={t.materia_codigo ? materiaNombre.get(t.materia_codigo) ?? t.materia_codigo : null}
                          expandida={expandidaId === t.id}
                          onExpandir={() => setExpandidaId(expandidaId === t.id ? null : t.id)}
                          onToggle={() => handleToggle(t)}
                          onToggleImportante={() => handleToggleImportante(t)}
                          onActualizar={(u) => handleActualizar(t, u)}
                          onEliminar={() => { handleEliminar(t); setExpandidaId(null); }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* ── Completadas (colapsable) ── */}
            {completadas.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setMostrarHechas((v) => !v)}
                  className="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.14em] font-bold font-label text-outline/55 hover:text-outline transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">{mostrarHechas ? "expand_more" : "chevron_right"}</span>
                  Completadas
                  <span className="text-[10px] text-outline/40">{completadas.length}</span>
                </button>
                {mostrarHechas && (
                  <div className="mt-2 space-y-px">
                    {completadas.map((t) => (
                      <TaskRow
                        key={t.id}
                        tarea={t}
                        ahora={ahora}
                        materias={materias}
                        materiaNombre={t.materia_codigo ? materiaNombre.get(t.materia_codigo) ?? t.materia_codigo : null}
                        expandida={false}
                        onExpandir={() => {}}
                        onToggle={() => handleToggle(t)}
                        onToggleImportante={() => handleToggleImportante(t)}
                        onActualizar={(u) => handleActualizar(t, u)}
                        onEliminar={() => handleEliminar(t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ════════════ Plan del día (diferencial: carga vs capacidad) ════════════ */}
      {planAbierto && (
        <PlanDelDia
          plan={plan}
          ahora={ahora}
          materiaNombre={materiaNombre}
          onIrATarea={irATarea}
          onCerrar={() => setPlanAbierto(false)}
        />
      )}

      {/* ════════════ Paleta de comandos ════════════ */}
      {paletaAbierta && (
        <CommandPalette
          comandos={comandos}
          tareas={activas}
          materiaNombre={materiaNombre}
          onIrATarea={irATarea}
          onCerrar={() => setPaletaAbierta(false)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Sidebar: item de vista
// ===========================================================================

function VistaItem({
  icon, label, count, active, colapsado, rgb = "138,180,255", onClick,
}: {
  icon: string; label: string; count: number; active: boolean; colapsado: boolean; rgb?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={colapsado ? label : undefined}
      className="hz-yearchip w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left"
      style={{
        background: active ? `rgba(${rgb},0.14)` : "transparent",
        border: `1px solid ${active ? `rgba(${rgb},0.32)` : "transparent"}`,
      }}
    >
      <span className="material-symbols-outlined text-[18px] shrink-0" style={{ color: active ? `rgb(${rgb})` : "rgba(141,145,155,0.75)" }}>{icon}</span>
      {!colapsado && (
        <>
          <span className="text-[12px] font-medium truncate flex-1" style={{ color: active ? "#eaf0ff" : "rgba(195,198,209,0.85)" }}>{label}</span>
          {count > 0 && <span className="text-[10px] font-label tabular-nums" style={{ color: active ? `rgb(${rgb})` : "rgba(141,145,155,0.6)" }}>{count}</span>}
        </>
      )}
    </button>
  );
}

function FiltroChip({ label, rgb, onClear }: { label: string; rgb: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-[10.5px] font-bold font-label transition-colors"
      style={{ background: `rgba(${rgb},0.14)`, border: `1px solid rgba(${rgb},0.3)`, color: `rgb(${rgb})` }}
    >
      {label}
      <span className="material-symbols-outlined text-[13px]">close</span>
    </button>
  );
}

// ===========================================================================
// Captura rápida con NL parsing + preview en vivo
// ===========================================================================

const QuickCapture = forwardRef<
  HTMLInputElement,
  { materias: MateriaLite[]; ahora: number; onCrear: (p: TaskCreate) => void }
>(function QuickCapture({ materias, ahora, onCrear }, ref) {
    const [texto, setTexto] = useState("");
    const parsed = useMemo(() => (texto.trim() ? parseCaptura(texto, materias, ahora) : null), [texto, materias, ahora]);

    function confirmar() {
      if (!parsed?.titulo) return;
      onCrear({
        titulo: parsed.titulo,
        fecha_vencimiento: parsed.fecha_vencimiento,
        estimado_horas: parsed.estimado_horas,
        materia_codigo: parsed.materia_codigo,
        tipo: parsed.tipo,
        prioridad: parsed.importante ? IMPORTANTE : null,
      });
      setTexto("");
    }

    return (
      <div>
        <div
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl transition-colors"
          style={{ background: "rgba(34,42,61,0.5)", border: `1px solid rgba(173,198,255,${parsed ? 0.35 : 0.16})` }}
        >
          <span className="material-symbols-outlined text-[20px] text-primary/80 shrink-0">add</span>
          <input
            ref={ref}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
            placeholder="Agregar tarea…  ej: TP Análisis vie 18h 3h !"
            className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline/55"
          />
          {parsed?.titulo && (
            <button onClick={confirmar} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold font-label" style={{ color: "#0b1326", background: "linear-gradient(135deg,#adc6ff,#7dffa2)" }}>
              Crear
            </button>
          )}
        </div>

        {/* preview en vivo de lo que la app entendió */}
        {parsed && (parsed.chips.length > 0 || parsed.titulo) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1.5">
            {parsed.titulo && <span className="text-[11px] text-on-surface/80 font-medium">“{parsed.titulo}”</span>}
            {parsed.chips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold font-label" style={{ background: `rgba(${c.rgb},0.14)`, border: `1px solid rgba(${c.rgb},0.28)`, color: `rgb(${c.rgb})` }}>
                <span className="material-symbols-outlined text-[12px]">{c.icon}</span>
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
});

// ===========================================================================
// Fila de tarea (minimalista en reposo, detalle inline al expandir)
// ===========================================================================

function TaskRow({
  tarea, ahora, materias, materiaNombre, expandida,
  onExpandir, onToggle, onToggleImportante, onActualizar, onEliminar,
}: {
  tarea: TaskOut;
  ahora: number;
  materias: MateriaLite[];
  materiaNombre: string | null;
  expandida: boolean;
  onExpandir: () => void;
  onToggle: () => void;
  onToggleImportante: () => void;
  onActualizar: (u: TaskUpdate) => void;
  onEliminar: () => void;
}) {
  const urg = calcUrgencia(tarea.fecha_vencimiento, ahora);
  const matRgb = tarea.materia_codigo ? materiaColor(tarea.materia_codigo) : null;
  const importante = esImportante(tarea);

  return (
    <div
      id={`tarea-${tarea.id}`}
      className="group rounded-lg transition-colors"
      style={{ background: expandida ? "rgba(34,42,61,0.4)" : "transparent" }}
    >
      {/* fila principal */}
      <div
        className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-container/40 transition-colors cursor-pointer"
        onClick={onExpandir}
        style={{ opacity: tarea.completada ? 0.5 : 1 }}
      >
        {/* checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={tarea.completada ? "Marcar pendiente" : "Completar"}
          className="shrink-0 w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center transition-all"
          style={{
            borderColor: tarea.completada ? "rgb(112,240,160)" : matRgb ? `rgba(${matRgb},0.55)` : "rgba(141,145,155,0.5)",
            background: tarea.completada ? "rgb(112,240,160)" : "transparent",
          }}
        >
          {tarea.completada && <span className="material-symbols-outlined text-[12px] text-[#0b1326]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>}
        </button>

        {/* punto de materia (único color de la fila) */}
        {matRgb && !tarea.completada && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${matRgb})` }} title={materiaNombre ?? ""} />
        )}

        {/* título */}
        <span className={`flex-1 min-w-0 truncate text-[13.5px] ${tarea.completada ? "line-through text-outline" : "text-on-surface"}`}>
          {tarea.titulo}
        </span>

        {/* indicador temporal (texto, único eje) */}
        {!tarea.completada && urg.level !== "ninguna" && (
          <span
            className={`shrink-0 text-[11px] font-semibold font-label ${urg.pulse ? "tarea-pulse" : ""}`}
            style={{ color: `rgb(${urg.rgb})` }}
          >
            {urg.label}
          </span>
        )}

        {/* tipo + horas (sólo al hover, monocromo) */}
        <div className="shrink-0 hidden group-hover:flex items-center gap-2 text-outline/55">
          {tarea.estimado_horas != null && tarea.estimado_horas > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10.5px] font-label">
              <span className="material-symbols-outlined text-[13px]">timer</span>{fmtHoras(tarea.estimado_horas)}h
            </span>
          )}
          {tarea.tipo && <span className="material-symbols-outlined text-[15px]" title={TIPO[tarea.tipo].label}>{TIPO[tarea.tipo].icon}</span>}
        </div>

        {/* estrella de importancia (siempre visible si está marcada) */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleImportante(); }}
          aria-label="Importante"
          className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all ${importante ? "" : "opacity-0 group-hover:opacity-100"}`}
          title="Marcar importante"
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: importante ? "rgb(255,206,84)" : "rgba(141,145,155,0.6)", fontVariationSettings: importante ? "'FILL' 1" : "'FILL' 0" }}
          >
            star
          </span>
        </button>
      </div>

      {/* detalle inline */}
      {expandida && !tarea.completada && (
        <TaskDetalle
          tarea={tarea}
          materias={materias}
          ahora={ahora}
          onActualizar={onActualizar}
          onEliminar={onEliminar}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Detalle / edición inline
// ===========================================================================

function TaskDetalle({
  tarea, materias, ahora, onActualizar, onEliminar,
}: {
  tarea: TaskOut;
  materias: MateriaLite[];
  ahora: number;
  onActualizar: (u: TaskUpdate) => void;
  onEliminar: () => void;
}) {
  const [desc, setDesc] = useState(tarea.descripcion ?? "");
  const [fecha, setFecha] = useState(tarea.fecha_vencimiento ? tarea.fecha_vencimiento.slice(0, 16) : "");
  const [horas, setHoras] = useState(tarea.estimado_horas != null ? String(tarea.estimado_horas) : "");

  // guardado on-blur para que se sienta sin fricción
  const commitDesc = () => { const v = desc.trim() || null; if (v !== (tarea.descripcion ?? null)) onActualizar({ descripcion: v }); };
  const commitFecha = () => { const v = fecha ? `${fecha}:00` : null; if (v !== (tarea.fecha_vencimiento ?? null)) onActualizar({ fecha_vencimiento: v }); };
  const commitHoras = () => { const v = horas.trim() ? Math.max(0, parseFloat(horas)) : null; if (v !== (tarea.estimado_horas ?? null)) onActualizar({ estimado_horas: v }); };

  return (
    <div className="px-2.5 pb-3 pt-1 space-y-3" style={{ borderTop: "1px solid rgba(141,145,155,0.08)" }} onClick={(e) => e.stopPropagation()}>
      <textarea
        rows={2}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={commitDesc}
        placeholder="Notas o detalles…"
        className="w-full bg-surface-container/40 border border-outline-variant/15 rounded-lg px-3 py-2 text-[12.5px] text-on-surface outline-none focus:border-primary/40 placeholder:text-outline/50 resize-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-outline font-label">
          <span className="material-symbols-outlined text-[15px]">event</span>
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} onBlur={commitFecha} className="bg-surface-container/40 border border-outline-variant/15 rounded-lg px-2 py-1 text-[11px] text-on-surface outline-none focus:border-primary/40" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-outline font-label">
          <span className="material-symbols-outlined text-[15px]">timer</span>
          <input type="number" min={0} step={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} onBlur={commitHoras} placeholder="—" className="w-16 bg-surface-container/40 border border-outline-variant/15 rounded-lg px-2 py-1 text-[11px] text-on-surface outline-none focus:border-primary/40 placeholder:text-outline/40" />
          <span>h</span>
        </label>
      </div>

      {/* tipo */}
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_ORDEN.map((tp) => {
          const on = tarea.tipo === tp;
          return (
            <button
              key={tp}
              onClick={() => onActualizar({ tipo: on ? null : tp })}
              className="hz-chip flex items-center gap-1 font-label"
              style={{ ["--c" as string]: "195,200,215", padding: "4px 9px", borderRadius: "7px", fontSize: "10.5px", fontWeight: 700, border: `1px solid rgba(195,200,215,${on ? 0.5 : 0.18})`, background: on ? "rgba(195,200,215,0.16)" : "rgba(34,42,61,0.6)", color: on ? "#fff" : "#c3c6d1" }}
            >
              <span className="material-symbols-outlined text-[13px]">{TIPO[tp].icon}</span>{TIPO[tp].label}
            </button>
          );
        })}
      </div>

      {/* materia */}
      {materias.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {materias.map((m) => {
            const on = tarea.materia_codigo === m.codigo;
            const rgb = materiaColor(m.codigo);
            return (
              <button
                key={m.codigo}
                onClick={() => onActualizar({ materia_codigo: on ? null : m.codigo })}
                className="hz-chip flex items-center gap-1.5 font-label"
                style={{ ["--c" as string]: rgb, padding: "4px 9px", borderRadius: "7px", fontSize: "10.5px", fontWeight: 700, border: `1px solid rgba(${rgb},${on ? 0.5 : 0.18})`, background: on ? `rgba(${rgb},0.16)` : "rgba(34,42,61,0.6)", color: on ? "#fff" : "#dce0ea", maxWidth: "180px" }}
              >
                <span className="material-symbols-outlined text-[13px] shrink-0" style={{ color: `rgb(${rgb})` }}>{materiaIcon(m.nombre)}</span>
                <span className="truncate">{m.nombre}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onEliminar} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold font-label transition-colors" style={{ color: "rgb(255,107,107)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,107,107,0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <span className="material-symbols-outlined text-[15px]">delete</span>Eliminar
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Plan del día (carga vs capacidad + sugerencia de qué hacer ahora)
// ===========================================================================

interface PlanData {
  cargaHoy: number;
  cargaSemana: number;
  sugerida: TaskOut | null;
  quickWin: TaskOut | null;
  pendientesHoy: number;
}

function PlanDelDia({
  plan, ahora, materiaNombre, onIrATarea, onCerrar,
}: {
  plan: PlanData;
  ahora: number;
  materiaNombre: Map<string, string>;
  onIrATarea: (t: TaskOut) => void;
  onCerrar: () => void;
}) {
  const pct = Math.min(100, Math.round((plan.cargaHoy / CAPACIDAD_DIARIA_H) * 100));
  const sobrecarga = plan.cargaHoy > CAPACIDAD_DIARIA_H;

  return (
    <aside className="shrink-0 hidden lg:flex flex-col overflow-y-auto" style={{ width: "260px", borderLeft: "1px solid rgba(141,145,155,0.1)" }}>
      <div className="flex items-center justify-between px-4 h-[52px] shrink-0" style={{ borderBottom: "1px solid rgba(141,145,155,0.1)" }}>
        <span className="text-[12px] font-bold font-label text-on-surface flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-primary">insights</span>Plan del día
        </span>
        <button onClick={onCerrar} className="w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container/60" aria-label="Cerrar">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Carga de hoy vs capacidad */}
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-outline/55 font-label">Carga de hoy</span>
            <span className="text-[11px] font-bold font-label" style={{ color: sobrecarga ? "rgb(255,120,90)" : "rgb(173,198,255)" }}>
              {fmtHoras(plan.cargaHoy)}h / {CAPACIDAD_DIARIA_H}h
            </span>
          </div>
          <div className="h-2 bg-surface-container/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: sobrecarga ? "linear-gradient(90deg,#ff8c5a,#ff5a5a)" : "linear-gradient(90deg,#adc6ff,#7dffa2)" }} />
          </div>
          <p className="text-[10.5px] mt-1.5 leading-snug" style={{ color: sobrecarga ? "rgb(255,150,120)" : "rgba(141,145,155,0.8)" }}>
            {plan.cargaHoy === 0
              ? "Sin horas estimadas para hoy. Cargá estimados y te armo el plan."
              : sobrecarga
                ? `Te pasás ${fmtHoras(plan.cargaHoy - CAPACIDAD_DIARIA_H)}h de tu capacidad. Pasá algo para mañana.`
                : `Entra cómodo. Te quedan ${fmtHoras(CAPACIDAD_DIARIA_H - plan.cargaHoy)}h libres.`}
          </p>
        </div>

        <div className="h-px bg-outline-variant/10" />

        {/* Empezá por (la sugerencia) */}
        {plan.sugerida ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-outline/55 font-label mb-2">Empezá por</p>
            <SugerenciaCard tarea={plan.sugerida} ahora={ahora} materiaNombre={materiaNombre} onClick={() => onIrATarea(plan.sugerida!)} destacado />
          </div>
        ) : (
          <p className="text-[11px] text-outline/55 leading-snug">No tenés tareas pendientes. 🎉</p>
        )}

        {/* Quick win */}
        {plan.quickWin && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-outline/55 font-label mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-secondary">bolt</span>Victoria rápida
            </p>
            <SugerenciaCard tarea={plan.quickWin} ahora={ahora} materiaNombre={materiaNombre} onClick={() => onIrATarea(plan.quickWin!)} />
          </div>
        )}

        <div className="h-px bg-outline-variant/10" />

        {/* mini stats honestas */}
        <div className="grid grid-cols-2 gap-2">
          <MiniStat icon="checklist" valor={`${plan.pendientesHoy}`} label="para hoy" />
          <MiniStat icon="calendar_view_week" valor={`${fmtHoras(plan.cargaSemana)}h`} label="esta semana" />
        </div>
      </div>
    </aside>
  );
}

function SugerenciaCard({
  tarea, ahora, materiaNombre, onClick, destacado,
}: {
  tarea: TaskOut; ahora: number; materiaNombre: Map<string, string>; onClick: () => void; destacado?: boolean;
}) {
  const urg = calcUrgencia(tarea.fecha_vencimiento, ahora);
  const matRgb = tarea.materia_codigo ? materiaColor(tarea.materia_codigo) : null;
  const mat = tarea.materia_codigo ? materiaNombre.get(tarea.materia_codigo) : null;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 transition-all hover:scale-[1.01]"
      style={{
        background: destacado ? "linear-gradient(135deg,rgba(173,198,255,0.12),rgba(125,255,162,0.06))" : "rgba(34,42,61,0.5)",
        border: `1px solid ${destacado ? "rgba(173,198,255,0.3)" : "rgba(141,145,155,0.16)"}`,
      }}
    >
      <p className="text-[12.5px] font-semibold text-on-surface leading-snug line-clamp-2">{tarea.titulo}</p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {mat && matRgb && (
          <span className="inline-flex items-center gap-1 text-[10px] font-label" style={{ color: `rgb(${matRgb})` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${matRgb})` }} />{mat}
          </span>
        )}
        {urg.level !== "ninguna" && <span className="text-[10px] font-semibold font-label" style={{ color: `rgb(${urg.rgb})` }}>{urg.label}</span>}
        {tarea.estimado_horas != null && tarea.estimado_horas > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-outline/55 font-label">
            <span className="material-symbols-outlined text-[12px]">timer</span>{fmtHoras(tarea.estimado_horas)}h
          </span>
        )}
      </div>
    </button>
  );
}

function MiniStat({ icon, valor, label }: { icon: string; valor: string; label: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(34,42,61,0.5)", border: "1px solid rgba(141,145,155,0.12)" }}>
      <div className="flex items-center gap-1 text-outline/60">
        <span className="material-symbols-outlined text-[13px]">{icon}</span>
        <span className="text-[9px] uppercase tracking-wide font-label">{label}</span>
      </div>
      <p className="text-[15px] font-bold font-headline text-on-surface mt-0.5 tabular-nums">{valor}</p>
    </div>
  );
}

// ===========================================================================
// Paleta de comandos (Ctrl+K): buscar tareas + acciones
// ===========================================================================

interface Comando {
  id: string;
  icon: string;
  label: string;
  grupo: string;
  rgb?: string;
  run: () => void;
}

function CommandPalette({
  comandos, tareas, materiaNombre, onIrATarea, onCerrar,
}: {
  comandos: Comando[];
  tareas: TaskOut[];
  materiaNombre: Map<string, string>;
  onIrATarea: (t: TaskOut) => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const nq = normTxt(q.trim());
  const tareasHit = useMemo(() => {
    if (!nq) return [];
    return tareas.filter((t) => normTxt(t.titulo).includes(nq)).slice(0, 6);
  }, [tareas, nq]);
  const cmdsHit = useMemo(() => {
    if (!nq) return comandos;
    return comandos.filter((c) => normTxt(c.label).includes(nq));
  }, [comandos, nq]);

  // lista plana navegable
  type Item = { kind: "tarea"; t: TaskOut } | { kind: "cmd"; c: Comando };
  const items: Item[] = useMemo(() => [
    ...tareasHit.map((t) => ({ kind: "tarea" as const, t })),
    ...cmdsHit.map((c) => ({ kind: "cmd" as const, c })),
  ], [tareasHit, cmdsHit]);

  useEffect(() => { setSel(0); }, [q]);

  function ejecutar(it: Item) {
    if (it.kind === "tarea") onIrATarea(it.t);
    else it.c.run();
    onCerrar();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onCerrar(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); if (items[sel]) ejecutar(items[sel]); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#0c1426", border: "1px solid rgba(141,145,155,0.18)" }} onKeyDown={onKey}>
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid rgba(141,145,155,0.1)" }}>
          <span className="material-symbols-outlined text-[19px] text-outline/70">search</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tarea o ejecutar comando…"
            className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline/55"
          />
          <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container/70 text-outline/60 font-mono">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {items.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-outline/50">Nada coincide.</p>}

          {tareasHit.length > 0 && <p className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-[0.14em] text-outline/40 font-label">Tareas</p>}
          {items.map((it, i) => {
            if (it.kind !== "tarea") return null;
            const t = it.t;
            const matRgb = t.materia_codigo ? materiaColor(t.materia_codigo) : null;
            return (
              <button
                key={`t-${t.id}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => ejecutar(it)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                style={{ background: sel === i ? "rgba(173,198,255,0.1)" : "transparent" }}
              >
                {matRgb ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `rgb(${matRgb})` }} /> : <span className="material-symbols-outlined text-[15px] text-outline/50">task_alt</span>}
                <span className="flex-1 truncate text-[12.5px] text-on-surface">{t.titulo}</span>
                {t.materia_codigo && <span className="text-[10px] text-outline/50 font-label truncate max-w-[100px]">{materiaNombre.get(t.materia_codigo)}</span>}
              </button>
            );
          })}

          {cmdsHit.length > 0 && <p className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-[0.14em] text-outline/40 font-label">Acciones</p>}
          {items.map((it, i) => {
            if (it.kind !== "cmd") return null;
            const c = it.c;
            return (
              <button
                key={`c-${c.id}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => ejecutar(it)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                style={{ background: sel === i ? "rgba(173,198,255,0.1)" : "transparent" }}
              >
                <span className="material-symbols-outlined text-[16px] shrink-0" style={{ color: c.rgb ? `rgb(${c.rgb})` : "rgba(141,145,155,0.75)" }}>{c.icon}</span>
                <span className="flex-1 truncate text-[12.5px] text-on-surface/90">{c.label}</span>
                <span className="text-[9px] text-outline/40 font-label">{c.grupo}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Empty state
// ===========================================================================

function EmptyState({ vista, hayFiltro }: { vista: Vista; hayFiltro: boolean }) {
  const { icon, msg } = hayFiltro
    ? { icon: "search_off", msg: "No hay tareas que coincidan." }
    : vista === "hoy"
      ? { icon: "self_improvement", msg: "Nada urgente para hoy. Respirá." }
      : { icon: "task_alt", msg: "Todo en orden. Sin pendientes." };
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
      <span className="material-symbols-outlined text-[44px] text-outline/20">{icon}</span>
      <p className="text-sm text-outline/55">{msg}</p>
    </div>
  );
}
