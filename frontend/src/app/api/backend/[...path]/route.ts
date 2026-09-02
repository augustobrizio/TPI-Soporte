/**
 * Proxy autenticado hacia el backend, para las mutaciones client-side.
 *
 * Reemplaza al rewrite que habia en `next.config.ts`. Un rewrite no puede
 * leer la cookie ni agregar headers, y como la sesion vive en una cookie
 * httpOnly (invisible para el JS del browser), la unica forma de que el
 * backend reciba el `Authorization` es que lo ponga codigo del servidor.
 *
 * Efecto lateral util: el token nunca toca el browser, ni siquiera en memoria.
 */
import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const { search } = new URL(request.url);
  const destino = `${API_URL}/${path.join("/")}${search}`;

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ detail: "No autenticado." }, { status: 401 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // GET y HEAD no llevan body; pasarlo hace fallar el fetch.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  let res: Response;
  try {
    res = await fetch(destino, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo contactar al servidor." },
      { status: 503 },
    );
  }

  // 204 y 304 no pueden llevar body: construir uno tira TypeError.
  if (res.status === 204 || res.status === 304) {
    return new NextResponse(null, { status: res.status });
  }

  // Respuestas en streaming (SSE): pasamos el cuerpo tal cual, sin bufferear.
  // Si acá hiciéramos `await res.text()` esperaríamos a que el backend termine
  // y perderíamos todo el efecto de "aparece de a poco".
  const tipo = res.headers.get("content-type") ?? "";
  if (tipo.includes("text/event-stream")) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "Content-Type": tipo,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const texto = await res.text();
  return new NextResponse(texto, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
