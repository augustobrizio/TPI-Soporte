"use client";

/**
 * Sección del perfil: "Calificá a tus profesores".
 *
 * Sale del historial real del alumno (materias aprobadas / regulares / en
 * curso) con sus profesores, así que es el punto de entrada de más señal para
 * las reseñas. También es el que más crece: con la carrera cargada entera son
 * varias decenas de materias por varios profesores cada una — en el perfil de
 * prueba, 250 filas y 17.000px de alto, contra 19.000px de página. La sección
 * secundaria se comía la pantalla entera.
 *
 * Por eso acá no se lista todo de una:
 *
 * - Arranca **plegada**, mostrando sólo el avance ("14 de 62 calificadas").
 * - Abierta, se filtra por sin calificar / calificadas, que es la pregunta
 *   real ("¿qué me falta?") y parte la lista en dos.
 * - Se muestran de a tandas, con "ver más".
 * - Cada cátedra es **una fila** —profesor, materia y la acción— en vez del
 *   bloque de tres líneas que tenía antes.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { listarCatedrasParaCalificar } from "@/lib/api";
import { acentoProfesor, inicialesProfesor } from "@/lib/profesorAvatar";
import type { CatedraParaCalificar, ProfesorMini, ResenaAlumno } from "@/lib/types";
import { CalificarCatedra } from "./CalificarCatedra";
import { MisResenasProvider, useMisResenas } from "./MisResenasProvider";

/** Cuántas filas se agregan por cada "ver más". */
const TANDA = 8;

type Filtro = "pendientes" | "calificadas";

interface Fila {
  clave: string;
  materiaCodigo: string;
  materiaNombre: string;
  profesor: ProfesorMini;
  resena: ResenaAlumno | undefined;
}

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

  // El provider envuelve la sección entera —y no sólo la lista, como antes—
  // porque ahora el encabezado también necesita saber qué está calificado
  // para poder mostrar el avance con la sección plegada.
  return (
    <MisResenasProvider loggedIn>
      <Panel catedras={catedras} />
    </MisResenasProvider>
  );
}

function Panel({ catedras }: { catedras: CatedraParaCalificar[] | null }) {
  const { getResena } = useMisResenas();
  const [abierta, setAbierta] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [visibles, setVisibles] = useState(TANDA);

  // Una fila por cátedra (materia × profesor). Aplanar acá deja el filtro y
  // el conteo en términos de lo que se califica de verdad: la materia sola no
  // se puntúa, se puntúa quién la da.
  const filas: Fila[] = useMemo(() => {
    if (!catedras) return [];
    return catedras.flatMap((c) =>
      c.profesores.map((p) => ({
        clave: `${c.materia_codigo}|${p.id}`,
        materiaCodigo: c.materia_codigo,
        materiaNombre: c.materia_nombre ?? c.materia_codigo,
        profesor: p,
        resena: getResena(c.materia_codigo, p.id),
      })),
    );
  }, [catedras, getResena]);

  const pendientes = filas.filter((f) => !f.resena);
  const calificadas = filas.filter((f) => f.resena);
  const lista = filtro === "pendientes" ? pendientes : calificadas;
  const enPantalla = lista.slice(0, visibles);
  const restantes = lista.length - enPantalla.length;

  // Cambiar de filtro reinicia la tanda: si venías de "ver más" tres veces en
  // pendientes, la otra pestaña no tiene por qué abrir con 32 filas.
  function cambiarFiltro(f: Filtro) {
    setFiltro(f);
    setVisibles(TANDA);
  }

  const cargando = catedras === null;
  const sinMaterias = !cargando && filas.length === 0;
  const porcentaje = filas.length
    ? Math.round((calificadas.length / filas.length) * 100)
    : 0;

  return (
    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container/50">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        disabled={sinMaterias}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 p-5 text-left disabled:cursor-default"
      >
        <span className="icon-chip chip-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">
          <span className="material-symbols-outlined text-[19px]">reviews</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-headline text-sm font-bold text-on-surface">
            Calificá a tus profesores
          </span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">
            {cargando
              ? "Cargando tus materias…"
              : sinMaterias
                ? "Cargá tus materias para poder calificar a tus profesores."
                : `${calificadas.length} de ${filas.length} cátedras calificadas · tu voto suma al puntaje junto a las reseñas de UTNTAC`}
          </span>
        </span>

        {!cargando && !sinMaterias && (
          <>
            {/* Barra de avance: con la sección plegada es lo único que se ve,
                así que tiene que contestar sola "¿me falta mucho?". */}
            <span className="hidden w-24 shrink-0 sm:block">
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/20">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${porcentaje}%` }}
                />
              </span>
            </span>
            <span className="material-symbols-outlined shrink-0 text-[20px] text-outline">
              {abierta ? "expand_less" : "expand_more"}
            </span>
          </>
        )}
      </button>

      {sinMaterias && (
        <p className="px-5 pb-5 text-xs text-outline">
          Cargá tus materias en{" "}
          <Link href="/materias" className="text-primary hover:underline">
            Materias
          </Link>{" "}
          (aprobadas o en curso) y acá vas a poder calificar a cada cátedra.
        </p>
      )}

      {abierta && !cargando && !sinMaterias && (
        <div className="border-t border-outline-variant/10 px-5 py-4">
          <div className="mb-1 flex flex-wrap gap-2">
            <ChipFiltro
              activo={filtro === "pendientes"}
              onClick={() => cambiarFiltro("pendientes")}
            >
              Sin calificar ({pendientes.length})
            </ChipFiltro>
            <ChipFiltro
              activo={filtro === "calificadas"}
              onClick={() => cambiarFiltro("calificadas")}
            >
              Calificadas ({calificadas.length})
            </ChipFiltro>
          </div>

          {lista.length === 0 ? (
            <p className="py-6 text-center text-xs text-outline">
              {filtro === "pendientes"
                ? "Ya calificaste todas tus cátedras."
                : "Todavía no calificaste ninguna."}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-outline-variant/10">
                {enPantalla.map((fila) => (
                  <FilaCatedra key={fila.clave} fila={fila} />
                ))}
              </ul>

              {restantes > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibles((v) => v + TANDA)}
                  className="mt-3 w-full rounded-lg border border-outline-variant/15 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Ver {Math.min(TANDA, restantes)} más · quedan {restantes}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FilaCatedra({ fila }: { fila: Fila }) {
  // Colapsado, el widget es un botón chico que va a la derecha de la fila;
  // abierto, un panel que necesita el ancho completo. Con `flex-wrap`, darle
  // `w-full` lo manda solo a su propio renglón.
  const [expandida, setExpandida] = useState(false);
  const { profesor } = fila;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-headline text-[10px] font-black ${acentoProfesor(profesor.id).wrapper}`}
      >
        {inicialesProfesor(profesor.nombre)}
      </span>

      <span className="min-w-0 flex-1">
        <Link
          href={`/profesores/${profesor.id}`}
          className="block truncate text-[13px] font-semibold text-on-surface hover:text-primary"
        >
          {profesor.nombre ?? "Profesor"}
        </Link>
        <span className="mt-0.5 block truncate text-[11px] text-outline">
          {fila.materiaNombre}
        </span>
      </span>

      <span className={expandida ? "w-full" : "shrink-0"}>
        <CalificarCatedra
          materiaCodigo={fila.materiaCodigo}
          profesorId={profesor.id}
          onAbiertoChange={setExpandida}
        />
      </span>
    </li>
  );
}

function ChipFiltro({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
        activo
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40"
      }`}
    >
      {children}
    </button>
  );
}
