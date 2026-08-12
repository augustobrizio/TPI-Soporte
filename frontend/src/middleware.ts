/**
 * Guard de rutas: manda a /login a quien no tenga sesion.
 *
 * **No es la frontera de seguridad.** Solo mira que la cookie exista; no
 * valida la firma ni la expiracion, porque el secreto de firma es del backend
 * y duplicarlo en el frontend seria multiplicar el lugar desde donde se puede
 * filtrar. Quien fabrique una cookie con cualquier contenido pasa por aca y
 * ve el cascaron de la pagina — y no obtiene nada, porque cada request de
 * datos igual va al backend con el token y ahi se valida de verdad (401).
 * Esto es UX: evitar que un usuario deslogueado vea pantallas vacias.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { COOKIE_SESION } from "@/lib/auth";

/** Rutas accesibles sin sesion. */
const PUBLICAS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const tieneSesion = Boolean(request.cookies.get(COOKIE_SESION)?.value);
  const esPublica = PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );

  if (esPublica) {
    // Ya logueado entrando a /login: al dashboard, no a un form inutil.
    if (tieneSesion) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!tieneSesion) {
    const url = new URL("/login", request.url);
    // Se recuerda a donde iba para volver ahi despues de loguearse. Solo el
    // path relativo: aceptar una URL completa permitiria usar el login como
    // redirector abierto hacia un sitio de phishing.
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Todo menos los assets y las rutas de API. `/api/auth/*` queda afuera
   * porque el login tiene que poder llamarse justamente sin sesion.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
