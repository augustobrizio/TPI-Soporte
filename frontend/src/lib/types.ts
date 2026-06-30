/**
 * Tipos espejo de los Pydantic schemas del backend.
 *
 * Mantener en sincro con `backend/app/schemas/`. La idea es que sean
 * exactamente el shape JSON que devuelven los endpoints — ni un campo
 * mas, ni uno menos.
 */

// ---------------------------------------------------------------------------
// Dominio academico — refleja `app/schemas/materia.py`
// ---------------------------------------------------------------------------

export type TipoMateria = "troncal" | "electiva";
export type TipoCorrelativa = "regular" | "aprobada";

/** Valores posibles de cuatrimestre en la DB. */
export type Cuatrimestre = "1" | "2" | "anual" | "1 y 2";

/** Estados calculados para mostrar en el grafo. */
export type EstadoMateria =
  | "aprobado"
  | "regular"
  | "cursando"
  | "cursable"
  | "libre";

/** Condicion como esta guardada en la DB (mas amplio que estado). */
export type CondicionMateria =
  | "aprobado"
  | "regular"
  | "cursando"
  | "libre"
  | "none";

export interface MateriaOut {
  codigo: string;
  nombre: string;
  anio_carrera: number | null;
  cuatrimestre: Cuatrimestre | null;
  horas: number | null;
  creditos: number | null;
  tipo: TipoMateria | null;
}

export interface MateriaNodo {
  codigo: string;
  nombre: string;
  anio_carrera: number | null;
  cuatrimestre: Cuatrimestre | null;
  horas: number | null;
  tipo: TipoMateria | null;
  estado: EstadoMateria;
  nota: number | null;
}

export interface CorrelativaEdge {
  /** codigo de la materia requerida (origen de la flecha). */
  desde: string;
  /** codigo de la materia que la requiere (destino de la flecha). */
  hacia: string;
  tipo: TipoCorrelativa;
}

export interface ContadoresGrafo {
  aprobadas: number;
  regulares: number;
  cursando: number;
  cursables: number;
  libres: number;
  total: number;
  porcentaje_aprobadas: number;
  carga_horaria_cursando: number;
  creditos_electivas: number;
  meta_creditos_electivas: number;
  /** Promedio global (troncales + electivas), igual en ambas pestañas. */
  promedio_general: number | null;
}

export interface GrafoResponse {
  tipo: TipoMateria;
  nodos: MateriaNodo[];
  edges: CorrelativaEdge[];
  contadores: ContadoresGrafo;
  /** Mapa codigo→condicion de todas las materias del usuario (cross-tab cascade). */
  registros_usuario: Record<string, EstadoMateria>;
  /** Nodos de otras pestanas referenciados en edges (para mostrar en panel de detalle). */
  nodos_externos: MateriaNodo[];
}

// ---------------------------------------------------------------------------
// Validacion de correlatividades
// ---------------------------------------------------------------------------

export interface FaltanteCorrelativa {
  materia_requerida: string;
  nombre: string;
  requiere: TipoCorrelativa;
  tiene: CondicionMateria;
}

export interface ValidacionCorrelativas {
  materia_codigo: string;
  accion: "cursar" | "rendir";
  permitido: boolean;
  faltantes: FaltanteCorrelativa[];
  motivo: string | null;
}

// ---------------------------------------------------------------------------
// Importacion desde texto pegado de SYSACAD
// ---------------------------------------------------------------------------

export interface ItemImportMapeado {
  nombre_original: string;
  estado_texto: string;
  materia_codigo: string | null;
  materia_nombre: string | null;
  confianza: number;
  condicion: CondicionMateria;
  nota: number | null;
  anio_cursada: number | null;
  importar: boolean;
}

export interface PreviewImportSysacad {
  items: ItemImportMapeado[];
  total_parseados: number;
  total_mapeados: number;
  advertencias: string[];
}

export interface ConfirmarImportIn {
  items: ItemImportMapeado[];
  forzar: boolean;
  /** Si es true, borra todo el historial previo antes de importar (no acumula). */
  reemplazar?: boolean;
}

export interface ResultadoImportSysacad {
  importadas: number;
  omitidas: number;
  eliminadas: number;
  errores: string[];
}

// ---------------------------------------------------------------------------
// Horarios / comisiones — refleja `app/schemas/comision.py`
// ---------------------------------------------------------------------------

export interface HorarioOut {
  dia: string | null;
  hora_inicio: string | null; // "HH:MM:SS"
  hora_fin: string | null;    // "HH:MM:SS"
  aula: string | null;
}

export interface ComisionCursadaOut {
  comision_id: number;
  comision_nombre: string | null;
  cursada_id: number;
  docente: string | null;
  horarios: HorarioOut[];
}

export interface MateriaCursableOut {
  materia_codigo: string;
  materia_nombre: string;
  anio_carrera: number | null;
  es_anual: boolean;
  cursada_seleccionada_id: number | null;
  comisiones: ComisionCursadaOut[];
}

// Optimizador de horarios
export type CriterioOptimizacion = "huecos" | "dias" | "turno";
export type TurnoPref = "manana" | "tarde" | "noche";

export interface AsignacionOut {
  materia_codigo: string;
  materia_nombre: string;
  comision_id: number;
  comision_nombre: string | null;
  cursada_id: number;
  horarios: HorarioOut[];
}

export interface OptimizacionOut {
  ok: boolean;
  motivo: string | null;
  criterio: CriterioOptimizacion;
  total_huecos_min: number;
  dias_usados: number;
  combinaciones_evaluadas: number;
  materias_sin_comision: string[];
  asignaciones: AsignacionOut[];
  dia_libre_ok: boolean;
  dias_libres_posibles: string[];
}

// ---------------------------------------------------------------------------
// Calendario academico - refleja `app/schemas/calendario.py`
// ---------------------------------------------------------------------------

export type TipoEventoCalendario = "examen" | "mesa" | "trabajo_practico" | "feriado" | "evento";

export interface EventoCalendarioOut {
  id: number;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  tipo: TipoEventoCalendario;
  carrera: string | null;
  fuente_url: string | null;
  origen: string; // "sistema" | "usuario"
}

export interface EventoCalendarioCreate {
  titulo: string;
  descripcion?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  tipo: TipoEventoCalendario;
}

// ---------------------------------------------------------------------------
// Tareas (to-do list) — refleja `app/schemas/task.py`
// ---------------------------------------------------------------------------

export type PrioridadTask = "alta" | "media" | "baja";
export type TipoTask = "examen" | "tp" | "entrega" | "lectura" | "estudio" | "personal";

export interface TaskOut {
  id: number;
  usuario_id: number;
  titulo: string;
  descripcion: string | null;
  completada: boolean;
  fecha_vencimiento: string | null;
  prioridad: PrioridadTask | null;
  tipo: TipoTask | null;
  estimado_horas: number | null;
  materia_codigo: string | null;
  orden: number;
  created_at: string;
}

export interface TaskCreate {
  titulo: string;
  descripcion?: string | null;
  fecha_vencimiento?: string | null;
  prioridad?: PrioridadTask | null;
  tipo?: TipoTask | null;
  estimado_horas?: number | null;
  materia_codigo?: string | null;
  orden?: number;
}

export interface TaskUpdate {
  titulo?: string | null;
  descripcion?: string | null;
  completada?: boolean | null;
  fecha_vencimiento?: string | null;
  prioridad?: PrioridadTask | null;
  tipo?: TipoTask | null;
  estimado_horas?: number | null;
  materia_codigo?: string | null;
  orden?: number | null;
}

export interface ResultadoSincCalendario {
  fuentes_procesadas: number;
  eventos_detectados: number;
  eventos_creados: number;
  eventos_actualizados: number;
  eventos_sin_cambios: number;
  advertencias: string[];
  errores: string[];
}
