/**
 * Nombre y opciones de la cookie de sesion.
 *
 * Va en su propio modulo, sin importar `next/headers`, para que lo puedan
 * usar el middleware (runtime edge) y `lib/api.ts` (que se bundlea tambien
 * para el browser) sin arrastrar APIs que solo existen en el servidor.
 */
export const COOKIE_SESION = "utnhub_session";

export function opcionesCookie(maxAge: number) {
  return {
    httpOnly: true,
    // En dev el server es http://localhost, donde una cookie `secure` no viaja.
    secure: process.env.NODE_ENV === "production",
    // `lax` deja que la cookie viaje al navegar de vuelta al sitio, pero no en
    // requests cross-site: es la defensa de base contra CSRF.
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
