import Link from "next/link";
import type {
  HorarioConsultaOut,
  MateriaProfesorOut,
  ProfesorDetalleOut,
} from "@/lib/types";
import { acentoProfesor, inicialesProfesor } from "@/lib/profesorAvatar";
import { formatHora } from "@/lib/horario";
import { MisResenasProvider } from "@/components/resenas/MisResenasProvider";
import { CalificarCatedra } from "@/components/resenas/CalificarCatedra";

const ANIO_ORD: Record<number, string> = { 1: "1ro", 2: "2do", 3: "3er", 4: "4to", 5: "5to" };

/**
 * Detalle de un profesor: datos de contacto, materias que dicta (con opción de
 * calificar la cátedra) y horarios de consulta.
 */
export function ProfesorDetalle({
  detalle,
  loggedIn = false,
}: {
  detalle: ProfesorDetalleOut;
  loggedIn?: boolean;
}) {
  const acento = acentoProfesor(detalle.id);
  const nombre = detalle.nombre ?? "Sin nombre";

  return (
    <MisResenasProvider loggedIn={loggedIn}>
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        href="/profesores"
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Volver a profesores
      </Link>

      {/* Header */}
      <header className="flex items-start gap-4 mb-8">
        <div
          className={`w-16 h-16 rounded-2xl border flex items-center justify-center shrink-0 font-headline font-black text-xl ${acento.wrapper}`}
        >
          {inicialesProfesor(detalle.nombre)}
        </div>
        <div className="min-w-0 pt-1">
          <h1 className="text-3xl font-headline font-extrabold text-on-surface leading-tight">
            {nombre}
          </h1>
          {detalle.email ? (
            <a
              href={`mailto:${detalle.email}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">mail</span>
              {detalle.email}
            </a>
          ) : (
            <p className="text-sm text-outline/70 italic mt-1.5">Sin email de contacto</p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Materias que dicta */}
        <Seccion titulo="Materias que dicta" icono="menu_book" cantidad={detalle.materias.length}>
          {detalle.materias.length === 0 ? (
            <Vacio texto="No hay materias asociadas a este profesor." />
          ) : (
            <ul className="space-y-2">
              {detalle.materias.map((m) => (
                <MateriaItem
                  key={`${m.materia_codigo}-${m.cargo ?? ""}-${m.anio ?? ""}`}
                  materia={m}
                  profesorId={detalle.id}
                />
              ))}
            </ul>
          )}
        </Seccion>

        {/* Horarios de consulta */}
        <Seccion
          titulo="Horarios de consulta"
          icono="schedule"
          cantidad={detalle.horarios_consulta.length}
        >
          {detalle.horarios_consulta.length === 0 ? (
            <Vacio texto="Este profesor no tiene horarios de consulta cargados." />
          ) : (
            <ul className="space-y-2">
              {detalle.horarios_consulta.map((h) => (
                <HorarioItem key={h.id} horario={h} />
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </div>
    </MisResenasProvider>
  );
}

function Seccion({
  titulo,
  icono,
  cantidad,
  children,
}: {
  titulo: string;
  icono: string;
  cantidad: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container/50 border border-outline-variant/10 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-headline font-bold text-on-surface mb-4">
        <span className="material-symbols-outlined text-[20px] text-primary">{icono}</span>
        {titulo}
        <span className="ml-auto text-xs text-outline font-body font-normal">{cantidad}</span>
      </h2>
      {children}
    </section>
  );
}

function MateriaItem({
  materia,
  profesorId,
}: {
  materia: MateriaProfesorOut;
  profesorId: number;
}) {
  const nombre = materia.materia_nombre ?? materia.materia_codigo;
  const anioLabel =
    materia.anio != null ? (ANIO_ORD[materia.anio] ?? `${materia.anio}°`) + " año" : null;
  return (
    <li className="rounded-xl bg-surface-container-low px-3.5 py-2.5">
      <p className="text-sm text-on-surface leading-snug">{nombre}</p>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-outline">
        {materia.cargo ? (
          <span className="uppercase tracking-wide font-semibold text-on-surface-variant">
            {materia.cargo}
          </span>
        ) : (
          <span className="italic">sin cargo</span>
        )}
        {anioLabel && <span>· {anioLabel}</span>}
        <span className="ml-auto font-mono text-outline/70">{materia.materia_codigo}</span>
      </div>
      <div className="mt-2 border-t border-outline-variant/10 pt-2">
        <CalificarCatedra materiaCodigo={materia.materia_codigo} profesorId={profesorId} />
      </div>
    </li>
  );
}

function HorarioItem({ horario }: { horario: HorarioConsultaOut }) {
  const inicio = formatHora(horario.hora_inicio);
  const fin = formatHora(horario.hora_fin);
  const rango = inicio && fin ? `${inicio}–${fin}` : inicio ?? fin ?? "sin horario";
  return (
    <li className="rounded-xl bg-surface-container-low px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-on-surface">{horario.dia ?? "Sin día"}</span>
        <span className="text-sm text-primary font-mono">{rango}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-outline">
        {horario.modalidad && (
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">videocam</span>
            {horario.modalidad}
          </span>
        )}
        {horario.aula && (
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">meeting_room</span>
            {horario.aula}
          </span>
        )}
        {!horario.modalidad && !horario.aula && <span className="italic">sin modalidad ni aula</span>}
      </div>
    </li>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-xs text-outline italic py-2">{texto}</p>;
}
