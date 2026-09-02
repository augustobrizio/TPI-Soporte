/**
 * Callback de Google. **Esta es la URL que va en Google Cloud Console**, en
 * "URIs de redireccionamiento autorizados":
 *
 *   dev:  http://localhost:3000/api/auth/google/callback
 *   prod: https://TU-DOMINIO/api/auth/google/callback
 *
 * Valida el `state` contra la cookie que dejo `/start`, le pasa el `code` al
 * backend y guarda el JWT que devuelve en la cookie de sesion. El token nunca
 * pasa por el browser: entra por el body de la respuesta del backend y sale
 * como cookie httpOnly, igual que en el login con email.
 */
import { NextResponse } from "next/server";

import {
  canjearCode,
  COOKIE_ESTADO,
  COOKIE_SESION,
  opcionesCookie,
  opcionesCookieEstado,
  redirigirConError,
  urlBase,
  urlCallback,
} from "@/lib/googleOAuth";
import { destinoSeguro } from "@/features/auth/destino";
import type { ErrorGoogle } from "@/lib/googleOAuth";

/** Traduce el status del backend al codigo que entiende `/login`. */
function errorSegunStatus(status: number): ErrorGoogle {
  if (status === 503) return "google_no_disponible";
  if (status === 403) return "google_email_no_verificado";
  return "google_fallo";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  /** Borra la cookie de `state` en cualquier salida: es de un solo uso. */
  const cerrar = (respuesta: NextResponse) => {
    respuesta.cookies.set(COOKIE_ESTADO, "", opcionesCookieEstado(0));
    return respuesta;
  };

  const fallar = (codigo: ErrorGoogle) =>
    cerrar(NextResponse.redirect(redirigirConError(request, codigo)));

  // Google avisa por `?error=` cuando el usuario cancela o no da permisos.
  if (params.get("error")) return fallar("google_cancelado");

  const code = params.get("code");
  const stateRecibido = params.get("state");
  if (!code || !stateRecibido) return fallar("google_fallo");

  // --- Validacion del state -------------------------------------------------
  // Se parsea a mano el header en vez de usar `cookies()` de next/headers
  // porque hace falta el valor crudo: lo escribimos como JSON url-encodeado.
  // El separador es ";" y el espacio es opcional segun el RFC 6265, asi que se
  // trimea cada parte en vez de asumir "; ".
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_ESTADO}=`))
    ?.slice(COOKIE_ESTADO.length + 1);

  if (!cookie) return fallar("google_estado");

  let guardado: { state?: string; next?: string; verifier?: string };
  try {
    guardado = JSON.parse(decodeURIComponent(cookie));
  } catch {
    return fallar("google_estado");
  }

  if (!guardado.state || guardado.state !== stateRecibido) {
    return fallar("google_estado");
  }
  if (!guardado.verifier) return fallar("google_estado");

  // --- Canje del code -------------------------------------------------------
  let resultado: Awaited<ReturnType<typeof canjearCode>>;
  try {
    resultado = await canjearCode(code, urlCallback(request), guardado.verifier);
  } catch {
    return fallar("google_no_disponible");
  }

  if ("status" in resultado) return fallar(errorSegunStatus(resultado.status));

  // --- Sesion iniciada ------------------------------------------------------
  // `destinoSeguro` de nuevo aunque `/start` ya filtro: la cookie es httpOnly,
  // pero validar de los dos lados sale gratis y evita que un cambio futuro en
  // `/start` abra un redirector.
  const destino = destinoSeguro(guardado.next);
  const respuesta = NextResponse.redirect(new URL(destino, urlBase(request)));
  respuesta.cookies.set(
    COOKIE_SESION,
    resultado.sesion.access_token,
    opcionesCookie(resultado.sesion.expires_in),
  );
  return cerrar(respuesta);
}
