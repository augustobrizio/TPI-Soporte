"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Cierre de sesion manual (RNF-05).
 *
 * Va por POST: un GET puede dispararlo un `<img src>` de otro sitio y
 * desloguear al usuario sin que lo pida.
 *
 * Es un hook y no un componente porque hay dos lugares que cierran sesion con
 * pintas distintas —el item de la barra lateral y el del menu de cuenta de la
 * barra superior— y lo unico que comparten es esta logica. Un solo componente
 * con dos variantes de estilo terminaba siendo un `if` de clases por cada
 * lugar nuevo.
 */
export function useCerrarSesion() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Si la request falla igual se manda a /login: el middleware va a
      // rebotarlo de vuelta si la cookie sigue viva, y el usuario reintenta.
    }
    router.push("/login");
    router.refresh();
  }

  return { salir, saliendo };
}
