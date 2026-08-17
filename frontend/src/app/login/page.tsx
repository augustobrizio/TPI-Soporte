/**
 * Inicio de sesion. Fuera del route group (dashboard), asi que no tiene
 * sidebar ni topbar. El middleware manda aca a quien no tenga sesion.
 */
import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthShell, EnlaceAuth } from "@/features/auth/AuthCard";
import { LoginForm } from "@/features/auth/LoginForm";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  return (
    <AuthShell
      titulo="Ingresá a UTNHub"
      subtitulo="Tu cursada, el calendario y las novedades en un solo lugar."
      pie={
        <>
          ¿No tenés cuenta? <EnlaceAuth href="/register">Creá una</EnlaceAuth>
        </>
      }
    >
      {/* `useSearchParams` (el ?next=) obliga a un boundary de Suspense. */}
      <Suspense fallback={<div className="h-[232px]" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
