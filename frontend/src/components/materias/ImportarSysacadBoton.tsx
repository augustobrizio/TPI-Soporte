"use client";

/**
 * Boton "Importar desde SYSACAD" con modal integrado.
 *
 * Se renderiza como isla cliente dentro de la pagina de materias (server component).
 * Cuando la importacion termina, recarga la pagina para que el grafo refleje los
 * nuevos estados.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportarSysacadModal } from "./ImportarSysacadModal";

export function ImportarSysacadBoton() {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  const handleImportado = () => {
    // Dar un momento antes de cerrar el modal y refrescar
    setTimeout(() => {
      setAbierto(false);
      router.refresh(); // invalida el cache del server component del grafo
    }, 1800);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="
          inline-flex items-center gap-2 rounded-xl
          bg-surface-container-high hover:bg-surface-container-highest
          border border-outline-variant/20 hover:border-outline-variant/40
          px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface
          transition-all duration-200
        "
        title="Importar historial de materias desde una captura de SYSACAD"
      >
        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        Importar desde SYSACAD
      </button>

      {abierto && (
        <ImportarSysacadModal
          onClose={() => setAbierto(false)}
          onImportado={handleImportado}
        />
      )}
    </>
  );
}
