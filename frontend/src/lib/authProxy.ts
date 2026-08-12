/**
 * Proxy compartido por los route handlers de `/api/auth/*`.
 *
 * Reenvia el body al endpoint del backend y, si sale bien, guarda el JWT en la
 * cookie httpOnly. El token nunca vuelve al browser en el body.
 */
import { NextResponse } from "next/server";

import { COOKIE_SESION, opcionesCookie } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** FastAPI manda `detail` como string, o como lista en errores de validacion. */
function extraerDetalle(datos: unknown): string | null {
  if (!datos || typeof datos !== "object") return null;
  const detail = (datos as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const primero = detail[0] as { msg?: unknown } | undefined;
    if (primero && typeof primero.msg === "string") return primero.msg;
  }
  return null;
}

export async function proxyAuth(
  request: Request,
  rutaBackend: "/auth/login" | "/auth/register",
  errorGenerico: string,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Request inválido." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${rutaBackend}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo contactar al servidor. Intentá de nuevo." },
      { status: 503 },
    );
  }

  const datos = await res.json().catch(() => null);

  if (!res.ok) {
    // El mensaje del backend se reenvia tal cual: ya esta redactado para no
    // revelar si el email existe (ver `core/exceptions.CredencialesInvalidas`).
    return NextResponse.json(
      { detail: extraerDetalle(datos) ?? errorGenerico },
      { status: res.status },
    );
  }

  const respuesta = NextResponse.json({ usuario: datos.usuario });
  respuesta.cookies.set(
    COOKIE_SESION,
    datos.access_token,
    opcionesCookie(datos.expires_in),
  );
  return respuesta;
}
