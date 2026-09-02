"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonSubmit, Campo, ErrorGeneral } from "./AuthCard";
import { BotonGoogle, SeparadorO } from "./BotonGoogle";

// Espejo de las reglas del backend (`schemas/usuario.RegistroIn`). Se validan
// tambien aca solo para dar feedback inmediato: la fuente de verdad es el
// backend, que revalida todo (el cliente se puede saltear con curl).
const PASSWORD_MIN = 8;
const CARACTERES_DISTINTOS_MIN = 4;

function validarPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Necesita al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (new Set(password).size < CARACTERES_DISTINTOS_MIN) {
    return `Usá al menos ${CARACTERES_DISTINTOS_MIN} caracteres distintos.`;
  }
  return null;
}

export function RegisterForm({ google = false }: { google?: boolean }) {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verPassword, setVerPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorRepetir, setErrorRepetir] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fallaPassword = validarPassword(password);
    const fallaRepetir = password !== repetir ? "Las contraseñas no coinciden." : null;
    setErrorPassword(fallaPassword);
    setErrorRepetir(fallaRepetir);
    if (fallaPassword || fallaRepetir) return;

    setCargando(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          nombre: nombre || null,
          apellido: apellido || null,
        }),
      });
      const datos = await res.json().catch(() => null);

      if (!res.ok) {
        setError(datos?.detail ?? "No se pudo crear la cuenta.");
        return;
      }

      // El registro deja la sesion iniciada: se entra directo al dashboard.
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <ErrorGeneral mensaje={error} />}

      <div className="grid grid-cols-2 gap-3">
        <Campo
          id="nombre"
          etiqueta="Nombre"
          autoComplete="given-name"
          placeholder="Juan"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          disabled={cargando}
        />
        <Campo
          id="apellido"
          etiqueta="Apellido"
          autoComplete="family-name"
          placeholder="Pérez"
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          disabled={cargando}
        />
      </div>

      <Campo
        id="email"
        etiqueta="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="tunombre@frro.utn.edu.ar"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={cargando}
      />

      <Campo
        id="password"
        etiqueta="Contraseña"
        type={verPassword ? "text" : "password"}
        autoComplete="new-password"
        required
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (errorPassword) setErrorPassword(validarPassword(e.target.value));
        }}
        disabled={cargando}
        error={errorPassword}
        accion={
          <button
            type="button"
            onClick={() => setVerPassword((v) => !v)}
            aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <span className="material-symbols-outlined text-[18px]">
              {verPassword ? "visibility_off" : "visibility"}
            </span>
          </button>
        }
      />

      <Campo
        id="repetir"
        etiqueta="Repetir contraseña"
        type={verPassword ? "text" : "password"}
        autoComplete="new-password"
        required
        placeholder="••••••••"
        value={repetir}
        onChange={(e) => {
          setRepetir(e.target.value);
          if (errorRepetir) setErrorRepetir(null);
        }}
        disabled={cargando}
        error={errorRepetir}
      />

      <BotonSubmit cargando={cargando}>
        {cargando ? "Creando cuenta..." : "Crear cuenta"}
      </BotonSubmit>

      {google && (
        <>
          <SeparadorO />
          {/* Mismo boton que en login: si la cuenta no existe, Google la crea. */}
          <BotonGoogle />
        </>
      )}
    </form>
  );
}
