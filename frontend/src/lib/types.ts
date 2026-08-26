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

export interface ResultadoSincCalendario {
  fuentes_procesadas: number;
  eventos_detectados: number;
  eventos_creados: number;
  eventos_actualizados: number;
  eventos_sin_cambios: number;
  advertencias: string[];
  errores: string[];
}

// ---------------------------------------------------------------------------
// Dominio profesores — refleja `app/schemas/profesor.py`
// ---------------------------------------------------------------------------

export interface ProfesorListItem {
  id: number;
  nombre: string | null;
  email: string | null;
  cantidad_materias: number;
  cantidad_horarios: number;
}

export interface HorarioConsultaOut {
  id: number;
  profesor_id: number;
  dia: string | null;
  hora_inicio: string | null; // "HH:MM:SS"
  hora_fin: string | null;    // "HH:MM:SS"
  modalidad: string | null;
  aula: string | null;
}

export interface MateriaProfesorOut {
  materia_codigo: string;
  materia_nombre: string | null;
  cargo: string | null;
  anio: number | null;
}

export interface ProfesorDetalleOut {
  id: number;
  nombre: string | null;
  email: string | null;
  materias: MateriaProfesorOut[];
  horarios_consulta: HorarioConsultaOut[];
}

export interface ResultadoSincHorarios {
  profesores_tocados: number;
  horarios_borrados: number;
  horarios_creados: number;
  materia_profesor_borrados: number;
  materia_profesor_creados: number;
  advertencias: string[];
  errores: string[];
}

export interface ResultadoSincMails {
  filas_procesadas: number;
  emails_seteados: number;
  emails_ya_existentes: number;
  profesores_creados: number;
  advertencias: string[];
  errores: string[];
}

export interface ResultadoSincCatedras {
  filas_procesadas: number;
  profesores_creados: number;
  materia_profesor_creados: number;
  materia_profesor_ya_existentes: number;
  asignaturas_no_mapeadas: string[];
  errores: string[];
}

// ---------------------------------------------------------------------------
// Comisiones con profesores — refleja el endpoint GET /comisiones/con-profesores
// (schemas/comision.py: ComisionOut / CursadaOut + ProfesorMiniOut). Reutiliza
// HorarioOut, ya definido para el armador de horarios.
// ---------------------------------------------------------------------------

export interface ProfesorMini {
  id: number;
  nombre: string | null;
}

export interface CursadaConProfesor {
  id: number;
  materia_codigo: string;
  materia_nombre: string | null;
  cuatrimestre: number | null;
  /** Cuatrimestre real de la materia en el plan: "1" | "2" | "anual" | "1 y 2". */
  cuatrimestre_materia: string | null;
  docente: string | null;
  /** Profesor real resuelto; null si ambiguo/sin match (se cae al docente). */
  profesor: ProfesorMini | null;
  /** Reseña (profesor×materia) desde UTNTAC. null si no hay reseña. */
  nota: number | null;
  clasificacion: string | null;
  cantidad_respuestas: number | null;
  horarios: HorarioOut[];
}

export interface ComisionConProfesores {
  id: number;
  nombre: string | null;
  anio: number | null;
  /** Promedio de las notas de las cátedras con reseña. null si ninguna la tiene. */
  score: number | null;
  /** Cobertura: cátedras con reseña / total de cátedras. */
  score_con_review: number;
  score_total: number;
  cursadas: CursadaConProfesor[];
}

// ---------------------------------------------------------------------------
// Novedades - refleja `app/schemas/novedad.py`
// ---------------------------------------------------------------------------

export type CategoriaNovedad = "evento" | "aviso" | "noticia" | "general";
export type FuenteNovedad = "instagram" | "utn_web";
export type EstadoNovedad = "publicada" | "pendiente" | "descartada";

export interface CentroOut {
  handle: string;
  nombre: string;
  tipo: FuenteNovedad | string;
  url_perfil: string | null;
  logo_url: string | null;
}

export interface FuenteOut {
  centro: CentroOut;
  url: string | null;
}

export interface NovedadOut {
  id: number;
  titulo: string | null;
  descripcion: string | null;
  contenido: string | null;
  imagen_url: string | null;
  categoria: CategoriaNovedad | string | null;
  estado: EstadoNovedad;
  confianza: number | null;
  fecha_publicacion: string | null;
  created_at: string | null;
  fuentes: FuenteOut[];
}
