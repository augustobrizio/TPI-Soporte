/**
 * Arranque del login con Google.
 *
 * Genera el `state` y el par PKCE, los guarda en una cookie httpOnly junto con
 * el destino post-login, le pide al backend la URL de autorizacion y redirige.
 *
 * El `state` es la defensa contra el **CSRF de login**: sin el, un tercero
 * puede iniciar el flow con *su* cuenta de Google, hacerle abrir a la victima
 * el callback con ese `code`, y dejarla logueada dentro de la cuenta del
 * atacante sin que se de cuenta. Como la cookie es httpOnly y del mismo
 * origen, el atacante no puede fabricar un par (cookie, query) que coincida.
 */
import { NextResponse } from "next/server";

import {
  COOKIE_ESTADO,
  generarPKCE,
  opcionesCookieEstado,
  pedirUrlAutorizacion,
  redirigirConError,
  urlCallback,
} from "@/lib/googleOAuth";
import { destinoSeguro } from "@/features/auth/destino";

const VIDA_DEL_STATE = 600; // 10 minutos

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Se sanea aca y no en el callback: asi lo que queda guardado en la cookie
  // ya es una ruta interna, y el callback no tiene que volver a confiar en
  // nada que venga de la URL.
  const destino = destinoSeguro(params.get("next"));

  const state = crypto.randomUUID();
  const { verifier, challenge } = await generarPKCE();
  const redirectUri = urlCallback(request);

  let urlGoogle: string | null;
  try {
    urlGoogle = await pedirUrlAutorizacion(redirectUri, state, challenge);
  } catch {
    urlGoogle = null;
  }

  if (!urlGoogle) {
    // Backend caido o sin credenciales cargadas.
    return NextResponse.redirect(redirigirConError(request, "google_no_disponible"));
  }

  const respuesta = NextResponse.redirect(urlGoogle);
  respuesta.cookies.set(
    COOKIE_ESTADO,
    // El `verifier` va en la misma cookie httpOnly que el `state`: nunca lo ve
    // JavaScript, y viaja al backend recien en el canje del code.
    JSON.stringify({ state, next: destino, verifier }),
    opcionesCookieEstado(VIDA_DEL_STATE),
  );
  return respuesta;
}
