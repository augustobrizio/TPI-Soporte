/**
 * Adonde mandar al usuario despues de autenticarse.
 *
 * El `?next=` viene de la URL, o sea del atacante potencial. Si se usara tal
 * cual, `/login?next=https://utnhub-falso.com` convertiria al login en un
 * redirector abierto: el link arranca en el dominio real, el usuario se
 * loguea, y termina en un clon que le pide las credenciales de nuevo.
 * Por eso solo se aceptan rutas relativas de este mismo sitio.
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next) return "/";
  // "//evil.com" es protocol-relative: el browser lo resuelve como externo.
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  // "/\evil.com" es la misma trampa con backslash (algunos browsers la
  // normalizan a "//").
  if (next.startsWith("/\\")) return "/";
  return next;
}
