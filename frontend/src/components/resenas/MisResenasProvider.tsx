"use client";

/**
 * Contexto de "mis reseñas": trae una vez las reseñas del alumno logueado y las
 * comparte con todos los widgets de calificación de la pantalla, para prellenar
 * ("ya calificaste ★N") y reflejar altas/bajas sin refetch.
 *
 * `loggedIn` viene del server component (getUsuarioActual): si es false, el
 * widget muestra el CTA de iniciar sesión en vez del formulario.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { listarMisResenas } from "@/lib/api";
import type { ResenaAlumno } from "@/lib/types";

const clave = (materia: string, profesor: number) => `${materia}|${profesor}`;

type Ctx = {
  loggedIn: boolean;
  getResena: (materia: string, profesor: number) => ResenaAlumno | undefined;
  aplicar: (r: ResenaAlumno) => void;
  quitar: (materia: string, profesor: number) => void;
};

const NOOP: Ctx = {
  loggedIn: false,
  getResena: () => undefined,
  aplicar: () => {},
  quitar: () => {},
};

const MisResenasContext = createContext<Ctx | null>(null);

export function MisResenasProvider({
  loggedIn,
  children,
}: {
  loggedIn: boolean;
  children: ReactNode;
}) {
  const [map, setMap] = useState<Map<string, ResenaAlumno>>(new Map());

  useEffect(() => {
    if (!loggedIn) {
      setMap(new Map());
      return;
    }
    let vivo = true;
    listarMisResenas()
      .then((rs) => {
        if (!vivo) return;
        setMap(new Map(rs.map((r) => [clave(r.materia_codigo, r.profesor_id), r])));
      })
      .catch(() => {
        /* si falla, el widget arranca sin prefill; no rompe la pantalla */
      });
    return () => {
      vivo = false;
    };
  }, [loggedIn]);

  const getResena = useCallback(
    (materia: string, profesor: number) => map.get(clave(materia, profesor)),
    [map],
  );
  const aplicar = useCallback(
    (r: ResenaAlumno) =>
      setMap((prev) => new Map(prev).set(clave(r.materia_codigo, r.profesor_id), r)),
    [],
  );
  const quitar = useCallback(
    (materia: string, profesor: number) =>
      setMap((prev) => {
        const n = new Map(prev);
        n.delete(clave(materia, profesor));
        return n;
      }),
    [],
  );

  return (
    <MisResenasContext.Provider value={{ loggedIn, getResena, aplicar, quitar }}>
      {children}
    </MisResenasContext.Provider>
  );
}

/** Devuelve un contexto no-op si no hay provider (el widget degrada a logged-out). */
export function useMisResenas(): Ctx {
  return useContext(MisResenasContext) ?? NOOP;
}
