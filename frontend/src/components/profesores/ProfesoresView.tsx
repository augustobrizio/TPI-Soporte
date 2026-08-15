"use client";

/**
 * Vista principal del directorio de profesores (isla cliente).
 * Recibe la lista completa desde el Server Component y filtra en memoria por
 * nombre/email (el padron es de cientos, no hace falta buscar server-side).
 */

import { useEffect, useMemo, useState } from "react";
import type { ProfesorListItem } from "@/lib/types";
import { ProfesorCard } from "./ProfesorCard";
// NOTA: la sincronización (SincronizarMenu) se movió al futuro panel de admin;
// intencionalmente no se muestra en esta pantalla de directorio.

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Cantidad de tarjetas por página (paginación de render, client-side). */
const PAGE_SIZE = 24;

export function ProfesoresView({ profesores }: { profesores: ProfesorListItem[] }) {
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return profesores;
    return profesores.filter((p) => {
      const nombre = norm(p.nombre ?? "");
      const email = norm(p.email ?? "");
      return nombre.includes(q) || email.includes(q);
    });
  }, [profesores, query]);

  const directorioVacio = profesores.length === 0;
  const sinResultados = !directorioVacio && filtrados.length === 0;

  // Paginación de render: al cambiar la búsqueda, volvemos a la primera página.
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    setPagina(1);
  }, [query]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * PAGE_SIZE;
  const visibles = filtrados.slice(desde, desde + PAGE_SIZE);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="glow-band glow-secondary bg-surface-container border border-outline-variant/10 rounded-3xl p-6 md:p-7 mb-8 space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
          Profesores
        </h1>
        <p className="text-on-surface-variant text-sm">
          {directorioVacio
            ? "Directorio de docentes de ISI"
            : `${profesores.length} profesores · materias que dictan y horarios de consulta`}
        </p>
      </header>

      {!directorioVacio && (
        <div className="relative mb-6 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar profesores"
            className="w-full rounded-xl bg-surface-container/60 border border-outline-variant/15 focus:border-primary/40 pl-10 pr-9 py-2.5 text-sm text-on-surface placeholder:text-outline/60 outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      )}

      {directorioVacio ? (
        <EstadoVacio
          icono="badge"
          titulo="Todavía no hay profesores"
          detalle="El directorio aún no tiene profesores cargados."
        />
      ) : sinResultados ? (
        <EstadoVacio
          icono="search_off"
          titulo="Sin resultados"
          detalle={`No hay profesores que coincidan con "${query}".`}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibles.map((p) => (
              <ProfesorCard key={p.id} profesor={p} />
            ))}
          </div>
          <Paginacion
            pagina={paginaSegura}
            totalPaginas={totalPaginas}
            desde={desde + 1}
            hasta={desde + visibles.length}
            total={filtrados.length}
            onCambiar={setPagina}
          />
        </>
      )}
    </div>
  );
}

function Paginacion({
  pagina,
  totalPaginas,
  desde,
  hasta,
  total,
  onCambiar,
}: {
  pagina: number;
  totalPaginas: number;
  desde: number;
  hasta: number;
  total: number;
  onCambiar: (p: number) => void;
}) {
  return (
    <nav
      className="mt-8 flex flex-col-reverse sm:flex-row items-center justify-between gap-3"
      aria-label="Paginación de profesores"
    >
      <p className="text-xs text-outline">
        Mostrando <span className="text-on-surface-variant font-semibold">{desde}–{hasta}</span> de{" "}
        <span className="text-on-surface-variant font-semibold">{total}</span>
      </p>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <BotonPagina
            icono="chevron_left"
            etiqueta="Anterior"
            disabled={pagina === 1}
            onClick={() => onCambiar(pagina - 1)}
          />
          <span className="text-xs text-on-surface-variant px-1 tabular-nums">
            Página <span className="font-semibold text-on-surface">{pagina}</span> de {totalPaginas}
          </span>
          <BotonPagina
            icono="chevron_right"
            etiqueta="Siguiente"
            disabled={pagina === totalPaginas}
            onClick={() => onCambiar(pagina + 1)}
          />
        </div>
      )}
    </nav>
  );
}

function BotonPagina({
  icono,
  etiqueta,
  disabled,
  onClick,
}: {
  icono: string;
  etiqueta: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-surface-container/60 border border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-container/60 transition-colors"
    >
      <span className="material-symbols-outlined text-[20px]">{icono}</span>
    </button>
  );
}

function EstadoVacio({
  icono,
  titulo,
  detalle,
}: {
  icono: string;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="card-3d glow-card glow-secondary bg-surface-container/40 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[320px]">
      <div className="icon-chip chip-secondary w-16 h-16 rounded-2xl text-secondary flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-3xl">{icono}</span>
      </div>
      <h2 className="text-xl font-headline font-bold text-on-surface mb-2">{titulo}</h2>
      <p className="text-sm text-on-surface-variant max-w-md">{detalle}</p>
    </div>
  );
}
