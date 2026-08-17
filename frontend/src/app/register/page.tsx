/** Alta de cuenta. Al registrarse la sesion queda iniciada (ver RegisterForm). */
import type { Metadata } from "next";

import { AuthShell, EnlaceAuth } from "@/features/auth/AuthCard";
import { RegisterForm } from "@/features/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default function RegisterPage() {
  return (
    <AuthShell
      titulo="Creá tu cuenta"
      subtitulo="Con tu mail de la UTN o el que uses habitualmente."
      pie={
        <>
          ¿Ya tenés cuenta? <EnlaceAuth href="/login">Ingresá</EnlaceAuth>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
