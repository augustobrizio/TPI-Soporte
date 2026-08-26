/**
 * Proxy **público** hacia `GET /buscar` del backend.
 *
 * No pasa por `/api/backend/*` a propósito: ese proxy corta con 401 cuando no
 * hay cookie de sesión, y el buscador de la barra superior también existe
 * para el visitante sin cuenta — materias, profesores, comisiones y novedades
 * se navegan sin registrarse. Enrutarlo por ahí habría dejado el control
 * decorativo justo para quien más lo necesita.
 *
 * Sigue siendo un route handler (y no un fetch directo del browser al
 * backend) por la misma razón que el resto: el origen del backend no queda
 * expuesto y no hay que abrir CORS para el buscador.
 */
import { NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  // Se reconstruye el querystring en vez de reenviarlo entero: así lo único
  // que llega al backend es lo que este endpoint declara aceptar.
  const destino = new URL(`${API_URL}/buscar`);
  destino.searchParams.set("q", q);
  const limite = searchParams.get("limite");
  if (limite) destino.searchParams.set("limite", limite);

  try {
    const res = await fetch(destino, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const texto = await res.text();
    return new NextResponse(texto, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo contactar al servidor." },
      { status: 503 },
    );
  }
}
