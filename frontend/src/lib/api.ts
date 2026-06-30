/**
 * Cliente HTTP minimo y tipado contra el backend FastAPI.
 *
 * No usamos axios ni react-query a proposito: los Server Components de
 * Next 15 ya nos dan caching y revalidacion via `fetch`. Si en algun
 * momento sumamos client-side fetching pesado, vemos.
 */
import type {
  ConfirmarImportIn,
  CriterioOptimizacion,
  EventoCalendarioCreate,
  EventoCalendarioOut,
  GrafoResponse,
  MateriaCursableOut,
  MateriaOut,
  OptimizacionOut,
  PreviewImportSysacad,
  ResultadoImportSysacad,
  ResultadoSincCalendario,
  TaskCreate,
  TaskOut,
  TaskUpdate,
  TipoEventoCalendario,
  TipoMateria,
  TurnoPref,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Backend devolvio ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface FetchOptions extends RequestInit {
  /** segundos de revalidacion del cache (Server Component). */
  revalidate?: number;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { revalidate, ...init } = options;
  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    // Server Components: cachear con revalidacion. Default 60s.
    next: { revalidate: revalidate ?? 60 },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignorar
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoints del dominio academico
// ---------------------------------------------------------------------------

export interface GrafoParams {
  tipo: TipoMateria;
  usuarioId?: number;
}

export function getGrafo({ tipo, usuarioId }: GrafoParams): Promise<GrafoResponse> {
  const qs = new URLSearchParams({ tipo });
  if (usuarioId !== undefined) qs.set("usuario_id", String(usuarioId));
  // revalidate: 0 → nunca cachear. El grafo es user-specific y cambia con cada mutacion.
  return request<GrafoResponse>(`/materias/grafo?${qs.toString()}`, { revalidate: 0 });
}

export function listarMaterias(tipo?: TipoMateria): Promise<MateriaOut[]> {
  const qs = tipo ? `?tipo=${tipo}` : "";
  return request<MateriaOut[]>(`/materias${qs}`);
}

// ---------------------------------------------------------------------------
// Endpoints del calendario academico
// ---------------------------------------------------------------------------

export interface CalendarioParams {
  desde?: string;
  hasta?: string;
  tipo?: TipoEventoCalendario;
  carrera?: string;
}

export function listarEventosCalendario(
  params: CalendarioParams = {},
): Promise<EventoCalendarioOut[]> {
  const qs = new URLSearchParams();
  if (params.desde) qs.set("desde", params.desde);
  if (params.hasta) qs.set("hasta", params.hasta);
  if (params.tipo) qs.set("tipo", params.tipo);
  if (params.carrera !== undefined) qs.set("carrera", params.carrera);
  const query = qs.toString();
  return request<EventoCalendarioOut[]>(`/calendario${query ? `?${query}` : ""}`);
}

export function getProximosEventosCalendario(
  limite = 5,
  carrera = "ISI",
): Promise<EventoCalendarioOut[]> {
  const qs = new URLSearchParams({ limite: String(limite), carrera });
  return request<EventoCalendarioOut[]>(`/calendario/proximos?${qs.toString()}`, {
    revalidate: 30,
  });
}

export function getEventosHoyCalendario(
  carrera = "ISI",
): Promise<EventoCalendarioOut[]> {
  const qs = new URLSearchParams({ carrera });
  return request<EventoCalendarioOut[]>(`/calendario/hoy?${qs.toString()}`, {
    revalidate: 30,
  });
}

// Las mutaciones se enrutan via /api/backend (proxy Next.js) para evitar CORS en browser.
const MUTATION_BASE = "/api/backend";

export async function registrarEstado(
  usuarioId: number,
  codigo: string,
  payload: { condicion: string; forzar?: boolean },
): Promise<unknown> {
  const res = await fetch(`${MUTATION_BASE}/usuarios/${usuarioId}/materias/${codigo}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export async function eliminarEstado(usuarioId: number, codigo: string): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/usuarios/${usuarioId}/materias/${codigo}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

/** Elimina TODOS los registros de cursada del usuario (reset masivo). */
export async function resetearTodosRegistros(usuarioId: number): Promise<{ eliminados: number }> {
  const res = await fetch(`${MUTATION_BASE}/usuarios/${usuarioId}/materias`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(res.status, null);
  }
  return res.json() as Promise<{ eliminados: number }>;
}

/**
 * Paso 1: manda el texto pegado de SYSACAD al backend y devuelve un preview
 * con las materias detectadas + el matching propuesto.
 * No toca la DB.
 */
export async function previewImportarSysacad(
  usuarioId: number,
  texto: string,
): Promise<PreviewImportSysacad> {
  const res = await fetch(
    `${MUTATION_BASE}/usuarios/${usuarioId}/materias/importar-sysacad/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ texto }),
    },
  );
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<PreviewImportSysacad>;
}

/**
 * Paso 2 OCR: aplica la importacion con los items que el alumno confirmo.
 */
export async function confirmarImportarSysacad(
  usuarioId: number,
  payload: ConfirmarImportIn,
): Promise<ResultadoImportSysacad> {
  const res = await fetch(
    `${MUTATION_BASE}/usuarios/${usuarioId}/materias/importar-sysacad/confirmar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResultadoImportSysacad>;
}

// ---------------------------------------------------------------------------
// Horarios / comisiones
// ---------------------------------------------------------------------------

export function getComisionesCursables(
  usuarioId: number,
  anio: number,
  cuatrimestre: number,
): Promise<MateriaCursableOut[]> {
  const qs = new URLSearchParams({
    usuario_id: String(usuarioId),
    anio: String(anio),
    cuatrimestre: String(cuatrimestre),
  });
  return request<MateriaCursableOut[]>(`/comisiones/cursables?${qs.toString()}`, {
    revalidate: 0,
  });
}

export async function seleccionarCursada(
  usuarioId: number,
  materia_codigo: string,
  cursada_id: number,
): Promise<unknown> {
  const res = await fetch(
    `${MUTATION_BASE}/usuarios/${usuarioId}/materias/${materia_codigo}/cursada`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ cursada_id }),
    },
  );
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export async function optimizarHorario(
  materias: string[],
  anio: number,
  cuatrimestre: number,
  criterio: CriterioOptimizacion,
  opts: { diaLibre?: string | null; turno?: TurnoPref | null } = {},
): Promise<OptimizacionOut> {
  const res = await fetch(`${MUTATION_BASE}/comisiones/optimizar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      materias, anio, cuatrimestre, criterio,
      dia_libre: opts.diaLibre ?? null,
      turno: opts.turno ?? null,
    }),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<OptimizacionOut>;
}

export async function deseleccionarCursada(
  usuarioId: number,
  materia_codigo: string,
): Promise<void> {
  const res = await fetch(
    `${MUTATION_BASE}/usuarios/${usuarioId}/materias/${materia_codigo}/cursada`,
    {
      method: "DELETE",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

// ---------------------------------------------------------------------------
// Eventos propios del alumno (CRUD)
// ---------------------------------------------------------------------------

export async function crearEvento(payload: EventoCalendarioCreate): Promise<EventoCalendarioOut> {
  const res = await fetch(`${MUTATION_BASE}/calendario/eventos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<EventoCalendarioOut>;
}

export async function actualizarEvento(
  id: number,
  payload: Partial<EventoCalendarioCreate>,
): Promise<EventoCalendarioOut> {
  const res = await fetch(`${MUTATION_BASE}/calendario/eventos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<EventoCalendarioOut>;
}

export async function eliminarEvento(id: number): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/calendario/eventos/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

export async function sincronizarCalendario(): Promise<ResultadoSincCalendario> {
  const res = await fetch(`${MUTATION_BASE}/calendario/sincronizar`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResultadoSincCalendario>;
}

// ---------------------------------------------------------------------------
// Tareas (to-do list)
// ---------------------------------------------------------------------------

export function listarTareas(usuarioId = 1): Promise<TaskOut[]> {
  return request<TaskOut[]>(`/tareas?usuario_id=${usuarioId}`, { revalidate: 0 });
}

export async function crearTarea(payload: TaskCreate, usuarioId = 1): Promise<TaskOut> {
  const res = await fetch(`${MUTATION_BASE}/tareas?usuario_id=${usuarioId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<TaskOut>;
}

export async function actualizarTarea(id: number, payload: TaskUpdate): Promise<TaskOut> {
  const res = await fetch(`${MUTATION_BASE}/tareas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<TaskOut>;
}

export async function eliminarTarea(id: number): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/tareas/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

export const api = {
  getGrafo,
  listarMaterias,
  listarEventosCalendario,
  getProximosEventosCalendario,
  getEventosHoyCalendario,
  registrarEstado,
  eliminarEstado,
  resetearTodosRegistros,
  previewImportarSysacad,
  confirmarImportarSysacad,
  sincronizarCalendario,
  crearEvento,
  actualizarEvento,
  eliminarEvento,
  getComisionesCursables,
  seleccionarCursada,
  deseleccionarCursada,
  optimizarHorario,
  listarTareas,
  crearTarea,
  actualizarTarea,
  eliminarTarea,
};
