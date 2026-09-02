/**
 * Piezas compartidas por los route handlers de `/api/auth/google/*`.
 *
 * El frontend es un relay: no conoce el client id, el secret ni los scopes de
 * Google. Le pide la URL de autorizacion al backend, recibe el `code` en su
 * propio callback y se lo reenvia al backend para que lo canjee. Lo unico que
 * es asunto suyo —y por eso vive aca— es la **cookie**: tanto la de sesion
 * como la de `state`, porque corre en el mismo origen que el browser.
 */
import { COOKIE_SESION, opcionesCookie } from "@/lib/sessionCookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Cookie de un solo uso que ata el callback al inicio del flow. */
export const COOKIE_ESTADO = "utnhub_oauth_state";

/**
 * Codigos de error que el callback puede devolverle a `/login`.
 *
 * Se pasa un codigo y no el mensaje: el `?error=` de la URL lo controla
 * cualquiera, y renderizar texto arbitrario deja armar un pantallazo de
 * phishing convincente ("tu sesion vencio, llama al 0800-...") alojado en
 * nuestro propio dominio. El texto sale de la tabla de `LoginForm`.
 */
export type ErrorGoogle =
  | "google_cancelado"
  | "google_estado"
  | "google_no_disponible"
  | "google_email_no_verificado"
  | "google_fallo";

/**
 * Origen publico de la app.
 *
 * `APP_URL` gana cuando esta seteada porque el `redirect_uri` tiene que
 * coincidir **byte a byte** con el que se registro en Google Cloud Console, y
 * detras de un proxy (Cloud Run, Amplify) el host que ve Next puede no ser el
 * que puso el usuario en la barra. En dev alcanza con derivarlo del request.
 */
export function urlBase(request: Request): string {
  const configurada = process.env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/** El `redirect_uri` que hay que registrar en Google Cloud Console. */
export function urlCallback(request: Request): string {
  return `${urlBase(request)}/api/auth/google/callback`;
}

export function opcionesCookieEstado(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `lax` y no `strict`: Google vuelve con un GET de navegacion top-level y
    // `strict` no mandaria la cookie en ese salto, rompiendo el flow entero.
    sameSite: "lax" as const,
    // Acotada a las rutas del flow: no viaja en el resto de la navegacion.
    path: "/api/auth/google",
    // 10 minutos: lo que puede tardar alguien en elegir cuenta y aceptar.
    maxAge,
  };
}

export { COOKIE_SESION, opcionesCookie };

/** Redirige a `/login?error=<codigo>`. */
export function redirigirConError(request: Request, codigo: ErrorGoogle): URL {
  const destino = new URL("/login", urlBase(request));
  destino.searchParams.set("error", codigo);
  return destino;
}

/** ¿El backend tiene cargadas las credenciales de Google? */
export async function googleHabilitado(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/google/config`, {
      // Sin cache a proposito. Es un GET de 20 bytes contra el mismo backend y
      // /login no es una ruta caliente, asi que lo que se ahorraria cacheando
      // es despreciable al lado del costo de equivocarse: con un TTL, despues
      // de cargar las credenciales el boton tarda en aparecer (o peor, sigue
      // apareciendo despues de sacarlas) y el sintoma no se parece en nada a
      // la causa. Asi el estado del boton siempre refleja el del backend.
      cache: "no-store",
    });
    if (!res.ok) return false;
    const datos = (await res.json()) as { habilitado?: boolean };
    return Boolean(datos.habilitado);
  } catch {
    // Backend caido: mejor no mostrar un boton que va a fallar.
    return false;
  }
}

/** base64url (sin padding), el encoding que pide PKCE. */
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Par PKCE (RFC 7636): el `verifier` se guarda y el `challenge` viaja a Google.
 *
 * 32 bytes aleatorios dan 43 caracteres base64url, el minimo que fija el RFC.
 * El `challenge` es su SHA-256, asi que quien vea la URL de autorizacion no
 * puede deducir el verifier — y sin el verifier, un `code` interceptado en el
 * redirect no se puede canjear.
 */
export async function generarPKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** URL de Google a la que hay que mandar al usuario. La arma el backend. */
export async function pedirUrlAutorizacion(
  redirectUri: string,
  state: string,
  codeChallenge: string,
): Promise<string | null> {
  const url = new URL(`${API_URL}/auth/google/autorizar`);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const datos = (await res.json()) as { url?: string };
  return datos.url ?? null;
}

export interface SesionGoogle {
  access_token: string;
  expires_in: number;
  usuario: unknown;
}

/** Canjea el `code` en el backend. Devuelve el status HTTP si falla. */
export async function canjearCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ sesion: SesionGoogle } | { status: number }> {
  const res = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  if (!res.ok) return { status: res.status };
  return { sesion: (await res.json()) as SesionGoogle };
}
