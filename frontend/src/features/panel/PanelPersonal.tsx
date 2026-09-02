import {
  ApiError,
  getComisionesCursables,
  getEventosHoyCalendario,
  getGrafo,
  getProximosEventosCalendario,
  listarNovedades,
} from "@/lib/api";
import type {
  ContadoresGrafo,
  EventoCalendarioOut,
  GrafoResponse,
  MateriaCursableOut,
  NovedadOut,
} from "@/lib/types";
import { materiaIcon } from "@/lib/materiaIcon";
import { getUsuarioActual } from "@/lib/auth";

import { ProgresoHero } from "@/components/dashboard/ProgresoHero";
import { AgendaHoy, type AgendaItem } from "@/components/dashboard/AgendaHoy";
import { ChatSnippet } from "@/components/dashboard/ChatSnippet";
import { AccionesRapidas } from "@/components/dashboard/AccionesRapidas";
import {
  NovedadesAlertas,
  type NovedadAlerta,
  type Severidad,
} from "@/components/dashboard/NovedadesAlertas";
import { AtajosToolbox } from "@/components/dashboard/AtajosToolbox";

// UTNHub cubre una sola carrera: el plan de estudios que hay cargado en la DB
// es el de ISI 2023 y no hay tabla de carreras. O sea que esto no es un dato
// del usuario que este faltando, es una constante del producto — y por eso
// sigue siendo una constante y no un TODO.
//
// Lo que si era del usuario y estaba hardcodeado es la cohorte: `anio_ingresado`
// vivia en el modelo desde siempre pero no se exponia en `UsuarioOut`.
const CARRERA = "Ingeniería en Sistemas de Información";

/** "Ingeniería en Sistemas de Información · Ingreso 2022", si sabemos la cohorte. */
function lineaCarrera(anioIngresado: number | null | undefined): string {
  return anioIngresado ? `${CARRERA} · Ingreso ${anioIngresado}` : CARRERA;
}

// Fallback de contadores si el backend no responde. Mantiene la UI usable
// y evita arrastrar un null por todo el render.
const CONTADORES_VACIOS: ContadoresGrafo = {
  aprobadas: 0,
  regulares: 0,
  cursando: 0,
  cursables: 0,
  libres: 0,
  total: 0,
  porcentaje_aprobadas: 0,
  carga_horaria_cursando: 0,
  creditos_electivas: 0,
  meta_creditos_electivas: 0,
  promedio_general: null,
};

// ---------------------------------------------------------------------------
// Novedades reales
// ---------------------------------------------------------------------------
//
// El panel mostraba dos novedades inventadas —entre ellas "Paro docente del
// 09/05"— con el cartel de "datos de ejemplo". El feed real existe desde el
// pipeline de ingesta; lo unico que faltaba era llamarlo.

/** Cuantas alertas entran en la card sin que se vuelva un muro de texto. */
const NOVEDADES_EN_PANEL = 4;

/** Etiqueta legible de la categoria que devuelve el clasificador. */
const ETIQUETA_CATEGORIA: Record<string, string> = {
  evento: "Evento",
  aviso: "Aviso",
  noticia: "Noticia",
  general: "General",
};

/** Categoria del backend -> severidad visual de la card.
 *
 * `critica` (rojo) queda deliberadamente sin usar: el clasificador no tiene
 * hoy ninguna nocion de urgencia, asi que pintar algo de rojo seria inventarla.
 * Un paro entra como `aviso` igual que un cambio de aula. El dia que
 * `ClasificacionNovedad` gane un campo de urgencia, este es el unico lugar a
 * tocar. */
function severidadDe(categoria: string | null): Severidad {
  return categoria === "aviso" ? "importante" : "info";
}

function novedadToAlerta(n: NovedadOut): NovedadAlerta {
  // `|| null` y no `?? null`: la columna es texto libre en la DB, asi que un
  // string vacio es tan "sin categoria" como un NULL.
  const categoria =
    (typeof n.categoria === "string" ? n.categoria.trim() : "") || null;
  return {
    id: n.id,
    categoria: (categoria && ETIQUETA_CATEGORIA[categoria]) || "Novedad",
    // `titulo` y `descripcion` son nullable en el schema: el clasificador
    // siempre los llena, pero una fila cargada a mano puede no tenerlos.
    titulo: n.titulo ?? "Novedad sin titulo",
    resumen: n.descripcion ?? n.contenido ?? "",
    severidad: severidadDe(categoria),
    // Deep link interno (el mismo que usa el buscador global), no la URL de
    // Instagram: el detalle en UTNHub muestra la novedad ya clasificada y con
    // sus fuentes, y no saca al alumno de la app.
    url: `/novedades?novedad=${n.id}`,
  };
}

async function obtenerNovedadesSeguro(): Promise<{
  novedades: NovedadAlerta[];
  error: string | null;
}> {
  try {
    const feed = await listarNovedades({ limite: NOVEDADES_EN_PANEL });
    return { novedades: feed.map(novedadToAlerta), error: null };
  } catch (err) {
    // Un feed caido no puede tumbar el panel entero: la card se muestra
    // vacia y el resto (progreso, agenda) sigue andando.
    if (err instanceof ApiError) {
      return { novedades: [], error: `Backend devolvio ${err.status}.` };
    }
    if (err instanceof Error) return { novedades: [], error: err.message };
    return { novedades: [], error: "Error desconocido." };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function obtenerGrafoSeguro(): Promise<{
  grafo: GrafoResponse | null;
  error: string | null;
}> {
  try {
    const grafo = await getGrafo({ tipo: "troncal" });
    return { grafo, error: null };
  } catch (err) {
    if (err instanceof ApiError) {
      return { grafo: null, error: `Backend devolvio ${err.status}.` };
    }
    if (err instanceof Error) return { grafo: null, error: err.message };
    return { grafo: null, error: "Error desconocido." };
  }
}

// 2do cuatrimestre arranca ~20 de julio.
function cuatriActual(): 1 | 2 {
  const hoy = new Date();
  const m = hoy.getMonth();
  const d = hoy.getDate();
  return m > 6 || (m === 6 && d >= 20) ? 2 : 1;
}

const DIAS_JS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const normDia = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function duracionMinHorario(ini: string | null, fin: string | null): number {
  if (!ini || !fin) return 0;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  let d = toMin(fin) - toMin(ini);
  if (d < 0) d += 24 * 60;
  return d;
}

/** Clases de hoy a partir de las comisiones que el alumno eligió en Horarios. */
function clasesDeHoy(actual: MateriaCursableOut[], todos: MateriaCursableOut[]): AgendaItem[] {
  // Resolver la comisión elegida por materia (cruzando ambos cuatris para las anuales).
  const selCom = new Map<string, number>();
  for (const m of todos) {
    if (m.cursada_seleccionada_id == null) continue;
    for (const com of m.comisiones) {
      if (com.cursada_id === m.cursada_seleccionada_id) selCom.set(m.materia_codigo, com.comision_id);
    }
  }
  const diaHoy = normDia(DIAS_JS[new Date().getDay()]);
  const items: AgendaItem[] = [];
  for (const m of actual) {
    const cid = selCom.get(m.materia_codigo);
    if (cid == null) continue;
    const com = m.comisiones.find((c) => c.comision_id === cid);
    if (!com) continue;
    com.horarios.forEach((h, idx) => {
      if (!h.dia || normDia(h.dia) !== diaHoy) return;
      items.push({
        id: `clase-${com.cursada_id}-${idx}`,
        titulo: m.materia_nombre,
        detalle: [com.comision_nombre, h.aula].filter(Boolean).join(" · ") || "Clase",
        hora: h.hora_inicio?.slice(0, 5) ?? "",
        duracionMin: duracionMinHorario(h.hora_inicio, h.hora_fin),
        icono: materiaIcon(m.materia_nombre),
      });
    });
  }
  items.sort((a, b) => a.hora.localeCompare(b.hora));
  return items;
}

async function obtenerDiaSeguro(): Promise<{
  agenda: AgendaItem[];
  finalesProximos: number | undefined;
  error: string | null;
}> {
  try {
    const cuatri = cuatriActual();
    const [hoy, proximos, c1, c2] = await Promise.all([
      getEventosHoyCalendario("ISI"),
      getProximosEventosCalendario(30, "ISI"),
      getComisionesCursables(2025, 1),
      getComisionesCursables(2025, 2),
    ]);
    const clases = clasesDeHoy(cuatri === 1 ? c1 : c2, [...c1, ...c2]);
    return {
      // Primero las clases de hoy (con hora real), luego los eventos del calendario.
      agenda: [...clases, ...hoy.map(eventoToAgendaItem)],
      finalesProximos: proximos.filter((e) => e.tipo === "mesa").length,
      error: null,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { agenda: [], finalesProximos: undefined, error: `Backend devolvio ${err.status}.` };
    }
    if (err instanceof Error) {
      return { agenda: [], finalesProximos: undefined, error: err.message };
    }
    return { agenda: [], finalesProximos: undefined, error: "Error desconocido." };
  }
}

function eventoToAgendaItem(evento: EventoCalendarioOut): AgendaItem {
  const inicio = new Date(evento.fecha_inicio);
  const fin = evento.fecha_fin ? new Date(evento.fecha_fin) : null;
  const duracionMin = fin
    ? Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60000))
    : 0;
  return {
    id: evento.id,
    titulo: evento.titulo,
    detalle: evento.descripcion ?? etiquetaTipo(evento.tipo),
    hora: inicio.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    duracionMin,
    icono: iconoTipo(evento.tipo),
  };
}

function etiquetaTipo(tipo: EventoCalendarioOut["tipo"]): string {
  const etiquetas: Record<EventoCalendarioOut["tipo"], string> = {
    examen: "Examen",
    mesa: "Mesa",
    trabajo_practico: "TP",
    feriado: "Feriado",
    evento: "Evento",
  };
  return etiquetas[tipo];
}

function iconoTipo(tipo: EventoCalendarioOut["tipo"]): string {
  const iconos: Record<EventoCalendarioOut["tipo"], string> = {
    examen: "event_upcoming",
    mesa: "groups",
    trabajo_practico: "assignment",
    feriado: "beach_access",
    evento: "calendar_month",
  };
  return iconos[tipo];
}

// ---------------------------------------------------------------------------
// Panel personal
// ---------------------------------------------------------------------------
//
// Vivia en `/` cuando la portada era el dashboard. Ahora `/` es la portada
// publica y esto es la parte personal, que se renderiza dentro de /perfil.

export async function PanelPersonal() {
  const [{ grafo, error }, dia, novedades, usuario] = await Promise.all([
    obtenerGrafoSeguro(),
    obtenerDiaSeguro(),
    obtenerNovedadesSeguro(),
    getUsuarioActual(),
  ]);
  const contadores = grafo?.contadores ?? CONTADORES_VACIOS;
  const enCursada = contadores.cursando;

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-sm text-error font-medium">
          No pude traer tu progreso del backend ({error}). Mostrando dashboard
          en modo degradado.
        </div>
      )}
      {dia.error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-sm text-error font-medium">
          No pude traer tu día del backend ({dia.error}).
        </div>
      )}
      {/* Sin este aviso, un feed caído se ve igual que "no hay novedades":
          la card cae al mismo empty state y el alumno concluye que no pasa
          nada en la facultad. */}
      {novedades.error && (
        <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-sm text-error font-medium">
          No pude traer las novedades del backend ({novedades.error}).
        </div>
      )}

      <ProgresoHero
        nombre={usuario?.nombre ?? usuario?.email ?? "Estudiante"}
        carrera={lineaCarrera(usuario?.anio_ingresado)}
        contadores={contadores}
        enCursada={enCursada}
        finalesProximos={dia.finalesProximos}
        esMock={!grafo}
      />

      {/* Bento grid: 12 columnas, asimetrico segun DESIGN.md */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8">
          <AgendaHoy items={dia.agenda} esMock={Boolean(dia.error)} />
        </div>
        <div className="md:col-span-4">
          <ChatSnippet
            ultimaPregunta={null}
            haceTexto={null}
            conversacionId={null}
          />
        </div>
        <div className="md:col-span-4">
          <AccionesRapidas />
        </div>
        <div className="md:col-span-8">
          <NovedadesAlertas novedades={novedades.novedades} />
        </div>
        <div className="md:col-span-12">
          <AtajosToolbox />
        </div>
      </div>
    </div>
  );
}
