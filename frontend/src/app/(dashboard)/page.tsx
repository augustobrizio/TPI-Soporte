import {
  ApiError,
  getComisionesCursables,
  getEventosHoyCalendario,
  getGrafo,
  getProximosEventosCalendario,
} from "@/lib/api";
import type {
  ContadoresGrafo,
  EventoCalendarioOut,
  GrafoResponse,
  MateriaCursableOut,
} from "@/lib/types";
import { materiaIcon } from "@/lib/materiaIcon";

import { ProgresoHero } from "@/components/dashboard/ProgresoHero";
import { AgendaHoy, type AgendaItem } from "@/components/dashboard/AgendaHoy";
import { ChatSnippet } from "@/components/dashboard/ChatSnippet";
import { AccionesRapidas } from "@/components/dashboard/AccionesRapidas";
import {
  NovedadesAlertas,
  type NovedadAlerta,
} from "@/components/dashboard/NovedadesAlertas";
import { AtajosToolbox } from "@/components/dashboard/AtajosToolbox";

// Hardcoded mientras no hay auth — alineado con lo que ya hace materias/page.tsx.
// Cuando exista AuthProvider real, esto pasa a venir de la sesion.
const USUARIO_ID = 1;
const NOMBRE = "Julian";
const CARRERA = "Ingenieria en Sistemas - 3er Anio";

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
// Mocks — se reemplazan por endpoints cuando esten implementados.
// La forma del dato ya respeta el contrato que va a exponer el BE.
// ---------------------------------------------------------------------------

const NOVEDADES_MOCK: NovedadAlerta[] = [
  {
    id: "paro-adutn",
    categoria: "Paro academico",
    titulo: "Paro docente del 09/05",
    resumen:
      "ADUTN convoco a 24h de paro. Verifica el campus virtual antes de salir de tu casa: hay clases que pasan a virtual.",
    severidad: "critica",
  },
  {
    id: "insc-finales",
    categoria: "Administrativo",
    titulo: "Inscripcion a finales de mayo",
    resumen:
      "La ventana de inscripcion al turno de mayo cierra el viernes 16 a las 23:59. Recorda chequear correlativas para rendir.",
    severidad: "importante",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function obtenerGrafoSeguro(): Promise<{
  grafo: GrafoResponse | null;
  error: string | null;
}> {
  try {
    const grafo = await getGrafo({ tipo: "troncal", usuarioId: USUARIO_ID });
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
      getComisionesCursables(USUARIO_ID, 2025, 1),
      getComisionesCursables(USUARIO_ID, 2025, 2),
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
// Pagina principal del dashboard
// ---------------------------------------------------------------------------

export default async function DashboardHome() {
  const [{ grafo, error }, dia] = await Promise.all([
    obtenerGrafoSeguro(),
    obtenerDiaSeguro(),
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

      <ProgresoHero
        nombre={NOMBRE}
        carrera={CARRERA}
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
          <NovedadesAlertas novedades={NOVEDADES_MOCK} esMock />
        </div>
        <div className="md:col-span-12">
          <AtajosToolbox />
        </div>
      </div>
    </div>
  );
}
