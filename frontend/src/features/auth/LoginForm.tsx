"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BotonSubmit, Campo, ErrorGeneral } from "./AuthCard";
import { destinoSeguro } from "./destino";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const datos = await res.json().catch(() => null);

      if (!res.ok) {
        setError(datos?.detail ?? "No se pudo iniciar sesión.");
        return;
      }

      const destino = destinoSeguro(params.get("next"));
      // `refresh()` ademas de `push()`: los Server Components tienen cacheado
      // el render de deslogueado y sin esto se veria la pagina vieja.
      router.push(destino);
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

      <Campo
        id="email"
        etiqueta="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
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
        autoComplete="current-password"
        required
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={cargando}
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

      <BotonSubmit cargando={cargando}>
        {cargando ? "Ingresando..." : "Ingresar"}
      </BotonSubmit>
    </form>
  );
}
