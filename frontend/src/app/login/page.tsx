/**
 * Inicio de sesion. Fuera del route group (dashboard), asi que no tiene
 * sidebar ni topbar. El middleware manda aca a quien no tenga sesion.
 */
import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthShell, EnlaceAuth } from "@/features/auth/AuthCard";
import { LoginForm } from "@/features/auth/LoginForm";
import { googleHabilitado } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default async function LoginPage() {
  // Se pregunta desde el server (no hay env de Google en el frontend): sin
  // credenciales cargadas en el backend, el boton directamente no se renderiza.
  const google = await googleHabilitado();

  return (
    <AuthShell
      titulo="UTNHub"
      subtitulo="Tu cursada, el calendario y las novedades en un solo lugar."
      pie={
        <>
          ¿No tenés cuenta? <EnlaceAuth href="/register">Creá una</EnlaceAuth>
        </>
      }
    >
      {/* `useSearchParams` (el ?next=) obliga a un boundary de Suspense. */}
      <Suspense fallback={<div className="h-[232px]" />}>
        <LoginForm google={google} />
      </Suspense>
    </AuthShell>
  );
}
