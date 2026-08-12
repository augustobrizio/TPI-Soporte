/**
 * Logout manual (RNF-05): borra la cookie de sesion.
 *
 * Es POST y no GET a proposito: un GET puede dispararse desde un `<img>` de
 * otro sitio y desloguear al usuario sin que lo pida.
 */
import { NextResponse } from "next/server";

import { COOKIE_SESION, opcionesCookie } from "@/lib/auth";

export async function POST() {
  const respuesta = NextResponse.json({ ok: true });
  // maxAge 0 = expira ya. Las demas opciones deben coincidir con las del
  // login: si difiere el path, el browser borra otra cookie (ninguna).
  respuesta.cookies.set(COOKIE_SESION, "", opcionesCookie(0));
  return respuesta;
}
