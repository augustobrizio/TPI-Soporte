/**
 * Cliente HTTP minimo y tipado contra el backend FastAPI.
 *
 * No usamos axios ni react-query a proposito: los Server Components de
 * Next 15 ya nos dan caching y revalidacion via `fetch`. Si en algun
 * momento sumamos client-side fetching pesado, vemos.
 */
import type {
  CatedraParaCalificar,
  CategoriaNovedad,
  CentroOut,
  ConfirmarImportIn,
  CriterioOptimizacion,
  ComisionConProfesores,
  EventoCalendarioCreate,
  EventoCalendarioOut,
  FuenteNovedad,
  GrafoResponse,
  MateriaCursableOut,
  MateriaOut,
  NovedadOut,
  OptimizacionOut,
  PreviewImportSysacad,
  ProfesorDetalleOut,
  ProfesorListItem,
  ResenaAlumno,
  SemanaCursada,
  ResultadoImportSysacad,
  ResultadoSincCalendario,
  ResultadoSincCatedras,
  ResultadoSincHorarios,
  ResultadoSincMails,
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
  /**
   * Segundos de revalidacion del cache (Server Component). Default 60.
   *
   * **Todo endpoint cuya respuesta dependa del usuario logueado tiene que
   * pasar `revalidate: 0`.** El cache de Next es por URL: si se cachea una
   * respuesta por-usuario, el siguiente que pida la misma URL se lleva los
   * datos del anterior.
   */
  revalidate?: number;
}

/**
 * Header de autorizacion para las lecturas de Server Components.
 *
 * Solo corre en el servidor: en el browser no hay token al que acceder (la
 * cookie es httpOnly) y esas llamadas van por `/api/backend/*`, que pone el
 * header del otro lado. El import es dinamico porque `next/headers` no existe
 * en el bundle del cliente y este archivo tambien se bundlea para el browser.
 */
async function headerAuth(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") return {};
  const { cookies } = await import("next/headers");
  const { COOKIE_SESION } = await import("./sessionCookie");
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { revalidate, ...init } = options;
  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(await headerAuth()),
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
}

/** Grafo del usuario logueado (el backend lo saca del token). */
export function getGrafo({ tipo }: GrafoParams): Promise<GrafoResponse> {
  const qs = new URLSearchParams({ tipo });
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
  // `revalidate: 0`: la respuesta trae los eventos personales del usuario y el
  // cache de Next es por URL — cachearla se los serviria al siguiente visitante.
  return request<EventoCalendarioOut[]>(`/calendario${query ? `?${query}` : ""}`, {
    revalidate: 0,
  });
}

export function getProximosEventosCalendario(
  limite = 5,
  carrera = "ISI",
): Promise<EventoCalendarioOut[]> {
  const qs = new URLSearchParams({ limite: String(limite), carrera });
  // revalidate: 0 → respuesta por-usuario, no cachear por URL.
  return request<EventoCalendarioOut[]>(`/calendario/proximos?${qs.toString()}`, {
    revalidate: 0,
  });
}

/**
 * Estado de cursada de una semana (lunes a viernes).
 *
 * `revalidate: 0` como el resto del calendario: con sesión la respuesta suma
 * los eventos propios del alumno, y el cache de Next es por URL.
 */
export function getSemanaCursada(lunes?: string): Promise<SemanaCursada> {
  const qs = lunes ? `?lunes=${lunes}` : "";
  return request<SemanaCursada>(`/calendario/semana${qs}`, { revalidate: 0 });
}

export function getEventosHoyCalendario(
  carrera = "ISI",
): Promise<EventoCalendarioOut[]> {
  const qs = new URLSearchParams({ carrera });
  // revalidate: 0 → respuesta por-usuario, no cachear por URL.
  return request<EventoCalendarioOut[]>(`/calendario/hoy?${qs.toString()}`, {
    revalidate: 0,
  });
}

// ---------------------------------------------------------------------------
// Endpoints de novedades
// ---------------------------------------------------------------------------

export interface NovedadesParams {
  fuente?: FuenteNovedad;
  categoria?: CategoriaNovedad;
  centro?: string;
  limite?: number;
}

export function listarNovedades(
  params: NovedadesParams = {},
): Promise<NovedadOut[]> {
  const qs = new URLSearchParams();
  if (params.fuente) qs.set("fuente", params.fuente);
  if (params.categoria) qs.set("categoria", params.categoria);
  if (params.centro) qs.set("centro", params.centro);
  if (params.limite) qs.set("limite", String(params.limite));
  const query = qs.toString();
  // El feed lo alimenta el scheduler por detras; con revalidar cada pocos
  // minutos alcanza.
  return request<NovedadOut[]>(`/novedades${query ? `?${query}` : ""}`, {
    revalidate: 180,
  });
}

export function listarCentros(): Promise<CentroOut[]> {
  return request<CentroOut[]>("/novedades/centros", { revalidate: 180 });
}

/**
 * Una novedad puntual. La usa el deep link `/novedades?novedad=<id>` del
 * buscador y de la campana: la portada trae sólo las últimas doce, así que
 * una novedad más vieja no está en esa lista y hay que pedirla aparte.
 */
export function getNovedad(id: number): Promise<NovedadOut> {
  return request<NovedadOut>(`/novedades/${id}`, { revalidate: 180 });
}

// Las mutaciones se enrutan via /api/backend (proxy Next.js) para evitar CORS en browser.
const MUTATION_BASE = "/api/backend";

export async function registrarEstado(
  codigo: string,
  payload: { condicion: string; forzar?: boolean },
): Promise<unknown> {
  const res = await fetch(`${MUTATION_BASE}/mi/materias/${codigo}`, {
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

// ---------------------------------------------------------------------------
// Suscripcion al calendario (.ics)
// ---------------------------------------------------------------------------

/** URL de suscripcion del alumno, creandola si es la primera vez.
 *
 * Va por el proxy autenticado: PEDIR la URL exige sesion. La URL que devuelve,
 * en cambio, apunta directo al backend y no lleva credenciales de sesion — es
 * el token de la propia URL el que autentica, porque Google Calendar refresca
 * sin poder mandar headers.
 */
export async function getSuscripcionCalendario(): Promise<{ url: string }> {
  const res = await fetch(`${MUTATION_BASE}/calendario/suscripcion`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status, null);
  return res.json();
}

/** Rota el token: la URL anterior deja de funcionar en el acto. */
export async function regenerarSuscripcionCalendario(): Promise<{ url: string }> {
  const res = await fetch(`${MUTATION_BASE}/calendario/suscripcion/regenerar`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status, null);
  return res.json();
}

export async function eliminarEstado(codigo: string): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/mi/materias/${codigo}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

/** Elimina TODOS los registros de cursada del usuario (reset masivo). */
export async function resetearTodosRegistros(): Promise<{ eliminados: number }> {
  const res = await fetch(`${MUTATION_BASE}/mi/materias`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(res.status, null);
  }
  return res.json() as Promise<{ eliminados: number }>;
}

// --- Reseñas de alumnos (feature 004) --------------------------------------

/** Mis reseñas (para prellenar la UI). Sin sesión devuelve lista vacía. */
export async function listarMisResenas(): Promise<ResenaAlumno[]> {
  const res = await fetch(`${MUTATION_BASE}/mi/resenas`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return [];
  if (!res.ok) {
    throw new ApiError(res.status, null);
  }
  return res.json() as Promise<ResenaAlumno[]>;
}

/** Crea o actualiza mi reseña sobre una cátedra (una por materia+profesor). */
export async function guardarResena(payload: {
  materia_codigo: string;
  profesor_id: number;
  nivel: number;
  comentario?: string | null;
}): Promise<ResenaAlumno> {
  const res = await fetch(`${MUTATION_BASE}/mi/resenas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResenaAlumno>;
}

/** Cátedras que cursé/curso (con sus profesores), para calificar desde el perfil. */
export async function listarCatedrasParaCalificar(): Promise<CatedraParaCalificar[]> {
  const res = await fetch(`${MUTATION_BASE}/mi/resenas/catedras`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return [];
  if (!res.ok) {
    throw new ApiError(res.status, null);
  }
  return res.json() as Promise<CatedraParaCalificar[]>;
}

/** Borra mi reseña sobre una cátedra. */
export async function borrarResena(
  materia_codigo: string,
  profesor_id: number,
): Promise<void> {
  const qs = new URLSearchParams({
    materia_codigo,
    profesor_id: String(profesor_id),
  });
  const res = await fetch(`${MUTATION_BASE}/mi/resenas?${qs.toString()}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

/**
 * Paso 1: manda el texto pegado de SYSACAD al backend y devuelve un preview
 * con las materias detectadas + el matching propuesto.
 * No toca la DB.
 */
export async function previewImportarSysacad(
  texto: string,
): Promise<PreviewImportSysacad> {
  const res = await fetch(
    `${MUTATION_BASE}/mi/materias/importar-sysacad/preview`,
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
  payload: ConfirmarImportIn,
): Promise<ResultadoImportSysacad> {
  const res = await fetch(
    `${MUTATION_BASE}/mi/materias/importar-sysacad/confirmar`,
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
  anio: number,
  cuatrimestre: number,
): Promise<MateriaCursableOut[]> {
  const qs = new URLSearchParams({
    anio: String(anio),
    cuatrimestre: String(cuatrimestre),
  });
  return request<MateriaCursableOut[]>(`/comisiones/cursables?${qs.toString()}`, {
    revalidate: 0,
  });
}

export async function seleccionarCursada(
  materia_codigo: string,
  cursada_id: number,
): Promise<unknown> {
  const res = await fetch(
    `${MUTATION_BASE}/mi/materias/${materia_codigo}/cursada`,
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
  materia_codigo: string,
): Promise<void> {
  const res = await fetch(
    `${MUTATION_BASE}/mi/materias/${materia_codigo}/cursada`,
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
// Comisiones (vista con profesores)
// ---------------------------------------------------------------------------

export function listarComisionesConProfesores(
  anio?: number,
): Promise<ComisionConProfesores[]> {
  const qs = anio !== undefined ? `?anio=${anio}` : "";
  return request<ComisionConProfesores[]>(`/comisiones/con-profesores${qs}`, {
    revalidate: 30,
  });
}

// ---------------------------------------------------------------------------
// Profesores
// ---------------------------------------------------------------------------

export function listarProfesores(): Promise<ProfesorListItem[]> {
  // revalidate corto: la lista cambia solo cuando corre una sincronizacion,
  // y esas mutaciones invalidan el cache via router.refresh().
  return request<ProfesorListItem[]>(`/profesores`, { revalidate: 30 });
}

export function getProfesorDetalle(id: number): Promise<ProfesorDetalleOut> {
  return request<ProfesorDetalleOut>(`/profesores/${id}`, { revalidate: 30 });
}

/** Full refresh de horarios de consulta + catedras desde el sitio del Dpto. ISI. */
export async function sincronizarHorariosProfesores(): Promise<ResultadoSincHorarios> {
  const res = await fetch(`${MUTATION_BASE}/profesores/sincronizar-horarios`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResultadoSincHorarios>;
}

/** Enriquece emails de docentes desde la sheet publica de UTNTAC. */
export async function sincronizarMailsProfesores(): Promise<ResultadoSincMails> {
  const res = await fetch(`${MUTATION_BASE}/profesores/sincronizar-mails`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResultadoSincMails>;
}

/** Crea catedras (profesor<->materia) desde la sheet de recomendaciones de UTNTAC. */
export async function sincronizarCatedrasUtntac(): Promise<ResultadoSincCatedras> {
  const res = await fetch(`${MUTATION_BASE}/profesores/sincronizar-catedras-utntac`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ResultadoSincCatedras>;
}

// ---------------------------------------------------------------------------
// Chat del asistente (RAG)
// ---------------------------------------------------------------------------

export interface ChatFuente {
  titulo: string | null;
  fuente: string;
  url: string | null;
  fecha?: string | null;
}

export interface CorrelativaFicha {
  nombre: string;
  tipo: string;
}

export interface FichaMateria {
  codigo: string;
  nombre: string;
  carrera: string | null;
  anio: number | null;
  cuatrimestre: string | null;
  tipo: string | null;
  correlativas: CorrelativaFicha[];
}

export interface ChatRespuesta {
  respuesta: string;
  fuentes: ChatFuente[];
  conversacion_id: number | null;
  mensaje_id: number | null;
  fichas: FichaMateria[];
}

/** Un paso del agente (uso de una tool) reportado en vivo durante el stream. */
export interface ChatPaso {
  tool: string;
  label: string;
}

/** Payload del evento `fin`: la respuesta completa ya persistida. */
export interface ChatStreamFin {
  respuesta: string;
  fuentes: ChatFuente[];
  fichas: FichaMateria[];
  conversacion_id: number | null;
  mensaje_id: number | null;
}

/** Callbacks para cada tipo de evento SSE del chat. Todos opcionales. */
export interface ChatStreamHandlers {
  onInicio?: (conversacionId: number) => void;
  onPaso?: (paso: ChatPaso) => void;
  onToken?: (texto: string) => void;
  onFin?: (fin: ChatStreamFin) => void;
  onError?: (mensaje: string) => void;
}

export interface MensajeGuardado {
  id: number;
  role: string | null;
  contenido: string | null;
  created_at: string | null;
  fuentes: ChatFuente[];
}

export interface ConversacionOut {
  id: number;
  titulo: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConversacionDetalle extends ConversacionOut {
  mensajes: MensajeGuardado[];
}

/**
 * Manda una pregunta al asistente y devuelve la respuesta + sus fuentes.
 * Va por el proxy /api/backend (client-side) para que inyecte el token httpOnly.
 * Sin `conversacionId` el backend abre una conversacion nueva.
 */
export async function preguntarChat(
  pregunta: string,
  conversacionId?: number | null,
): Promise<ChatRespuesta> {
  const res = await fetch(`${MUTATION_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pregunta, conversacion_id: conversacionId ?? null }),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ChatRespuesta>;
}

/**
 * Despacha un evento SSE ya parseado al handler que corresponda.
 *
 * Un frame SSE es un bloque de líneas: `event: <tipo>` y una o más `data:`.
 * El `data` es JSON (puede venir partido en varias líneas, se re-une con \n).
 */
function despacharEventoSSE(raw: string, handlers: ChatStreamHandlers): void {
  let evento = "message";
  const datos: string[] = [];
  for (const linea of raw.split("\n")) {
    if (linea.startsWith("event:")) evento = linea.slice(6).trim();
    // SSE descarta un único espacio después de los dos puntos de `data:`.
    else if (linea.startsWith("data:")) datos.push(linea.slice(5).replace(/^ /, ""));
  }
  if (datos.length === 0) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(datos.join("\n"));
  } catch {
    return; // frame incompleto o comentario SSE (`:` keepalive): lo ignoramos
  }

  switch (evento) {
    case "inicio":
      handlers.onInicio?.(payload.conversacion_id as number);
      break;
    case "paso":
      handlers.onPaso?.(payload as unknown as ChatPaso);
      break;
    case "token":
      handlers.onToken?.(payload.texto as string);
      break;
    case "fin":
      handlers.onFin?.(payload as unknown as ChatStreamFin);
      break;
    case "error":
      handlers.onError?.(payload.mensaje as string);
      break;
  }
}

/**
 * Versión en streaming de {@link preguntarChat}: en vez de esperar la respuesta
 * completa, va invocando `handlers` con cada evento SSE (paso del agente, token,
 * fin). Lee `res.body` como un `ReadableStream` y parsea los frames a mano.
 *
 * Va por el proxy /api/backend, que hace passthrough del stream sin bufferear.
 */
export async function preguntarChatStream(
  pregunta: string,
  conversacionId: number | null | undefined,
  handlers: ChatStreamHandlers,
  opts: { regenerar?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      pregunta,
      conversacion_id: conversacionId ?? null,
      regenerar: opts.regenerar ?? false,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignorar */
    }
    throw new ApiError(res.status, body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Los frames vienen separados por doble salto de línea. La red puede partir
  // un frame en varios chunks (o juntar varios en uno), así que acumulamos en
  // `buffer` y cortamos por "\n\n".
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let corte = buffer.indexOf("\n\n");
    while (corte !== -1) {
      const frame = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);
      despacharEventoSSE(frame, handlers);
      corte = buffer.indexOf("\n\n");
    }
  }
  // Último frame sin "\n\n" de cierre (por las dudas).
  if (buffer.trim()) despacharEventoSSE(buffer, handlers);
}

// ---------------------------------------------------------------------------
// Reporte de huecos del chatbot (sólo admin)
// ---------------------------------------------------------------------------

/** Una pregunta agrupada que el chatbot no pudo responder bien. */
export interface HuecoChat {
  pregunta: string;
  cantidad: number;
  /** true = no se apoyó en datos (sin tool estructurada y sin fuentes). */
  sin_datos: boolean;
  /** true = alguien la votó 👎. */
  voto_negativo: boolean;
}

export interface ReporteHuecos {
  dias: number;
  kpis: {
    preguntas: number;
    con_datos_pct: number;
    huecos: number;
    voto_negativo: number;
  };
  huecos: HuecoChat[];
}

/** Reporte de huecos del chatbot (endpoint admin; el backend valida el rol). */
export function getReporteHuecos(dias = 7): Promise<ReporteHuecos> {
  return request<ReporteHuecos>(`/chat/admin/huecos?dias=${dias}`, {
    revalidate: 0,
  });
}

/** Conversaciones del usuario (historial del chat). */
export function listarConversaciones(): Promise<ConversacionOut[]> {
  // revalidate: 0 → es por-usuario, nunca se cachea (ver FetchOptions).
  return request<ConversacionOut[]>("/chat/conversaciones", { revalidate: 0 });
}

/** Una conversacion con todos sus mensajes. */
export function getConversacion(id: number): Promise<ConversacionDetalle> {
  return request<ConversacionDetalle>(`/chat/conversaciones/${id}`, {
    revalidate: 0,
  });
}

/** Envia feedback (👍/👎 + motivo) sobre una respuesta del asistente. */
export async function enviarFeedback(
  mensajeId: number,
  util: boolean,
  motivo?: string | null,
): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/chat/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ mensaje_id: mensajeId, util, motivo: motivo ?? null }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, null);
  }
}

/** Renombra una conversacion (via proxy: mutacion client-side). */
export async function renombrarConversacion(
  id: number,
  titulo: string,
): Promise<ConversacionOut> {
  const res = await fetch(`${MUTATION_BASE}/chat/conversaciones/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ titulo }),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignorar */ }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<ConversacionOut>;
}

/** Elimina una conversacion (via proxy: mutacion client-side). */
export async function eliminarConversacion(id: number): Promise<void> {
  const res = await fetch(`${MUTATION_BASE}/chat/conversaciones/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, null);
  }
}

export const api = {
  getGrafo,
  preguntarChat,
  enviarFeedback,
  listarConversaciones,
  getConversacion,
  renombrarConversacion,
  eliminarConversacion,
  listarMaterias,
  listarEventosCalendario,
  getProximosEventosCalendario,
  getEventosHoyCalendario,
  getSemanaCursada,
  listarNovedades,
  listarCentros,
  getNovedad,
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
  listarProfesores,
  getProfesorDetalle,
  sincronizarHorariosProfesores,
  sincronizarMailsProfesores,
  sincronizarCatedrasUtntac,
  listarComisionesConProfesores,
};
