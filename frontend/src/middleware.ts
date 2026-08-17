/**
 * Ruteo segun sesion.
 *
 * La app es **publica por defecto**: novedades, profesores, horarios,
 * calendario y material se navegan sin cuenta. Las secciones que sí la
 * necesitan (materias, comisiones, perfil) no se rebotan desde aca — cada
 * pagina valida contra el backend y muestra el CTA de `RequiereCuenta`, asi
 * el visitante ve de que se trata en vez de comerse un formulario de login.
 *
 * **No es la frontera de seguridad.** Solo mira que la cookie exista; no
 * valida la firma ni la expiracion, porque el secreto de firma es del backend
 * y duplicarlo en el frontend seria multiplicar el lugar desde donde se puede
 * filtrar. Quien fabrique una cookie con cualquier contenido pasa por aca y
 * ve el cascaron de la pagina — y no obtiene nada, porque cada request de
 * datos igual va al backend con el token y ahi se valida de verdad (401).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { COOKIE_SESION } from "@/lib/auth";

/** Rutas de autenticacion: no tienen sentido con la sesion ya abierta. */
const AUTH = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tieneSesion = Boolean(request.cookies.get(COOKIE_SESION)?.value);

  const esAuth = AUTH.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );

  if (esAuth) {
    // Ya logueado entrando a /login: al dashboard, no a un form inutil.
    if (tieneSesion) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // `/` ya no redirige a ningun lado: es la portada publica. Lo personal
  // (progreso, agenda, contadores) se mudo a /perfil.
  return NextResponse.next();
}

export const config = {
  /**
   * Todo menos los assets y las rutas de API. `/api/auth/*` queda afuera
   * porque el login tiene que poder llamarse justamente sin sesion.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
