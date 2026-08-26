/**
 * Sesion del lado del servidor.
 *
 * El JWT vive en una cookie **httpOnly**: no es accesible desde JavaScript,
 * asi que un XSS no puede robarlo. Por eso el browser nunca habla directo con
 * el backend — pasa por los route handlers de `app/api/*`, que corren en el
 * mismo origen y son los unicos que leen la cookie y ponen el header.
 */
import { cookies } from "next/headers";

import { COOKIE_SESION } from "./sessionCookie";

export { COOKIE_SESION, opcionesCookie } from "./sessionCookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface UsuarioSesion {
  id: number;
  email: string;
  nombre: string | null;
  apellido: string | null;
  legajo: string | null;
  rol: string | null;
  /** Foto de perfil de Google, si la cuenta entro por ahi. */
  avatar_url: string | null;
}

/** Token crudo de la cookie, o null. Solo para Server Components / handlers. */
export async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_SESION)?.value ?? null;
}

/**
 * Usuario de la sesion actual, validando el token contra el backend.
 *
 * Devuelve null si no hay cookie o si el backend la rechaza (token vencido,
 * firma invalida, usuario borrado). No cachea: la validez del token cambia
 * con el tiempo y una respuesta cacheada dejaria pasar sesiones muertas.
 */
export async function getUsuarioActual(): Promise<UsuarioSesion | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as UsuarioSesion;
  } catch {
    // Backend caido: se trata como sesion no verificable, no como valida.
    return null;
  }
}

/** Nombre para mostrar. Cae al email si la cuenta no cargo nombre. */
export function nombreVisible(usuario: UsuarioSesion): string {
  const completo = [usuario.nombre, usuario.apellido].filter(Boolean).join(" ");
  return completo || usuario.email;
}

/** Iniciales para el avatar (2 letras). */
export function iniciales(usuario: UsuarioSesion): string {
  const partes = [usuario.nombre, usuario.apellido].filter(Boolean) as string[];
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return usuario.email.slice(0, 2).toUpperCase();
}
