/**
 * Semana de cursada para el panel de la portada.
 *
 * Existe aparte de `/api/backend/*` porque ese proxy corta con 401 sin sesion,
 * y la portada es publica: el visitante sin cuenta tiene que poder deslizar
 * entre semanas igual. Aca el token es opcional — si esta, el backend suma los
 * eventos propios del alumno; si no, devuelve solo los de la facultad.
 */
import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Solo `YYYY-MM-DD`: lo que llega por query no se reenvia sin mirar. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const lunes = new URL(request.url).searchParams.get("lunes");
  if (lunes && !FECHA.test(lunes)) {
    return NextResponse.json({ detail: "Fecha invalida." }, { status: 400 });
  }

  const token = await getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `${API_URL}/calendario/semana${lunes ? `?lunes=${lunes}` : ""}`,
      { headers, cache: "no-store" },
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo consultar el calendario." },
      { status: 502 },
    );
  }
}
