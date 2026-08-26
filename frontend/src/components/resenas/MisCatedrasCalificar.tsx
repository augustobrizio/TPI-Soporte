"use client";

/**
 * Sección del perfil: "Calificá a tus profesores". Lista las cátedras que el
 * alumno cursó o cursa (materias aprobadas/regulares/cursando) con sus
 * profesores, y ofrece el widget de calificación para cada uno. Es el punto de
 * entrada de más señal: sale del historial real del alumno.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { listarCatedrasParaCalificar } from "@/lib/api";
import { acentoProfesor, inicialesProfesor } from "@/lib/profesorAvatar";
import type { CatedraParaCalificar } from "@/lib/types";
import { CalificarCatedra } from "./CalificarCatedra";
import { MisResenasProvider } from "./MisResenasProvider";

export function MisCatedrasCalificar() {
  const [catedras, setCatedras] = useState<CatedraParaCalificar[] | null>(null);

  useEffect(() => {
    let vivo = true;
    listarCatedrasParaCalificar()
      .then((cs) => vivo && setCatedras(cs))
      .catch(() => vivo && setCatedras([]));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section className="bg-surface-container/50 border border-outline-variant/10 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-headline font-bold text-on-surface mb-1">
        <span className="material-symbols-outlined text-[20px] text-primary">reviews</span>
        Calificá a tus profesores
      </h2>
      <p className="text-xs text-on-surface-variant mb-4">
        Tu opinión suma al puntaje de cada cátedra, junto a las reseñas de UTNTAC.
      </p>

      {catedras === null ? (
        <p className="text-xs text-outline italic py-2">Cargando tus materias…</p>
      ) : catedras.length === 0 ? (
        <p className="text-xs text-outline py-2">
          Cargá tus materias en{" "}
          <Link href="/materias" className="text-primary hover:underline">
            Materias
          </Link>{" "}
          (aprobadas o en curso) para poder calificar a tus profesores.
        </p>
      ) : (
        <MisResenasProvider loggedIn>
          <ul className="space-y-3">
            {catedras.map((c) => (
              <li
                key={c.materia_codigo}
                className="rounded-xl bg-surface-container-low px-3.5 py-3"
              >
                <p className="text-sm font-semibold text-on-surface leading-snug mb-2">
                  {c.materia_nombre ?? c.materia_codigo}
                </p>
                <ul className="space-y-2.5">
                  {c.profesores.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1.5">
                      <Link
                        href={`/profesores/${p.id}`}
                        className="group inline-flex items-center gap-2 self-start"
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md border text-[9px] font-headline font-black ${acentoProfesor(p.id).wrapper}`}
                        >
                          {inicialesProfesor(p.nombre)}
                        </span>
                        <span className="text-xs text-on-surface-variant group-hover:text-on-surface">
                          {p.nombre ?? "Profesor"}
                        </span>
                      </Link>
                      <CalificarCatedra materiaCodigo={c.materia_codigo} profesorId={p.id} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </MisResenasProvider>
      )}
    </section>
  );
}
