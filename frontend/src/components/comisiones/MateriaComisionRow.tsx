import Link from "next/link";
import type { CursadaConProfesor } from "@/lib/types";
import { acentoProfesor, inicialesProfesor } from "@/lib/profesorAvatar";
import { rangoHorario } from "@/lib/horario";
import { CalificarCatedra } from "@/components/resenas/CalificarCatedra";
import { NotaCatedra } from "./Score";

/**
 * Una materia dentro de una comisión: nombre + horario + profesor.
 * El profesor se muestra vinculado (link a su detalle) si el cruce lo resolvió;
 * si no, cae al ``docente`` (apellido crudo).
 */
export function MateriaComisionRow({ cursada }: { cursada: CursadaConProfesor }) {
  const materia = cursada.materia_nombre ?? cursada.materia_codigo;

  return (
    <li className="rounded-xl bg-surface-container-low px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
        <p className="text-sm text-on-surface leading-snug">{materia}</p>
        {cursada.horarios.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {cursada.horarios.map((h, i) => (
              <span key={i} className="text-[11px] text-outline inline-flex items-center gap-1">
                <span className="text-on-surface-variant">{h.dia ?? "—"}</span>
                <span className="font-mono text-primary">
                  {rangoHorario(h.hora_inicio, h.hora_fin)}
                </span>
                {h.aula && <span>· {h.aula}</span>}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-outline italic mt-1">sin horario</p>
        )}
        {cursada.nota != null && (
          <NotaCatedra
            nota={cursada.nota}
            clasificacion={cursada.clasificacion}
            cantidad={cursada.cantidad_respuestas}
          />
        )}
        </div>

        <ProfesorTag cursada={cursada} />
      </div>
      {cursada.profesor && (
        <div className="mt-2 border-t border-outline-variant/10 pt-2">
          <CalificarCatedra
            materiaCodigo={cursada.materia_codigo}
            profesorId={cursada.profesor.id}
          />
        </div>
      )}
    </li>
  );
}

function ProfesorTag({ cursada }: { cursada: CursadaConProfesor }) {
  if (cursada.profesor) {
    const p = cursada.profesor;
    const acento = acentoProfesor(p.id);
    return (
      <Link
        href={`/profesores/${p.id}`}
        className="flex items-center gap-2 shrink-0 rounded-lg px-1.5 py-1 hover:bg-surface-container-high transition-colors group"
        title="Ver detalle del profesor"
      >
        <span
          className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-headline font-black ${acento.wrapper}`}
        >
          {inicialesProfesor(p.nombre)}
        </span>
        <span className="text-xs text-on-surface-variant group-hover:text-on-surface max-w-[140px] truncate">
          {p.nombre ?? "Profesor"}
        </span>
      </Link>
    );
  }

  // Sin vínculo resuelto → fallback al apellido crudo.
  return (
    <span
      className="flex items-center gap-1.5 shrink-0 text-xs text-outline italic px-1.5 py-1"
      title="Docente sin vincular al padrón de profesores"
    >
      <span className="material-symbols-outlined text-[16px]">person</span>
      {cursada.docente ?? "sin docente"}
    </span>
  );
}
