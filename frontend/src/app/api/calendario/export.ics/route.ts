/**
 * Descarga del calendario en `.ics` — **sesión opcional**.
 *
 * No pasa por `/api/backend/*` por la misma razón que el buscador: ese proxy
 * corta con 401 sin cookie, y el calendario académico se navega sin cuenta.
 * Enrutarlo por ahí dejaba el botón de descarga roto exactamente para el
 * visitante al que el modal se lo ofrece.
 *
 * Pero a diferencia del buscador, acá el token **sí sirve cuando está**: con
 * sesión el backend agrega los eventos personales del alumno al archivo. Así
 * que se adjunta si existe y se sigue de largo si no — que es justo el
 * contrato de `UsuarioOpcional` del lado del backend.
 *
 * También se reenvía el `Content-Disposition`: sin él el navegador abre el
 * `.ics` como texto en una pestaña en vez de bajarlo.
 */
import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const destino = new URL(`${API_URL}/calendario/export.ics`);
  const carrera = searchParams.get("carrera");
  if (carrera) destino.searchParams.set("carrera", carrera);

  const headers: Record<string, string> = { Accept: "text/calendar" };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(destino, { headers, cache: "no-store" });
    const texto = await res.text();
    return new NextResponse(texto, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") ?? "text/calendar; charset=utf-8",
        "Content-Disposition":
          res.headers.get("content-disposition") ??
          'attachment; filename="utnhub.ics"',
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo contactar al servidor." },
      { status: 503 },
    );
  }
}
