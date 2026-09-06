import { CloudOff, SearchX } from "lucide-react";
import type { Metadata } from "next";

import { EstadoVacio } from "@/features/novedades/EstadoVacio";
import { recortar } from "@/features/novedades/formato";
import {
  NovedadArticulo,
  VolverANovedades,
} from "@/features/novedades/NovedadArticulo";
import { ApiError, getNovedad } from "@/lib/api";
import { imagenParaPreview } from "@/lib/ogImagen";
import { urlNovedad } from "@/lib/site";
import type { NovedadOut } from "@/lib/types";

/**
 * Página propia de una novedad: la URL que se comparte.
 *
 * La portada ya sabía abrir una novedad puntual con `?novedad=<id>`, pero eso
 * es un modal sobre el feed y no alcanza para compartir. Un link que se manda
 * por WhatsApp lo pide primero un crawler (`WhatsApp/2.x`), que no ejecuta
 * JavaScript ni abre modales: lee el HTML y busca las meta de Open Graph. Esas
 * meta tienen que describir *esta* novedad, y para eso la novedad necesita una
 * ruta propia con su `generateMetadata`.
 *
 * El deep link `?novedad=<id>` sigue existiendo para el buscador y la campana,
 * donde el modal es lo correcto: no te saca del feed que estabas mirando.
 */

/** Lo que se muestra cuando la novedad no está para ser vista. */
type Falla = "no_encontrada" | "backend_caido";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Trae la novedad, o la razón por la que no se puede mostrar.
 *
 * Se llama dos veces por request (una desde `generateMetadata`, otra desde el
 * componente) y eso no duplica el pedido: `lib/api` va por `fetch` y Next
 * deduplica los `fetch` idénticos dentro del mismo render.
 *
 * Solo se sirven las **publicadas**. Esta ruta es la cara pública de una
 * novedad —cualquiera con el link entra— y una `pendiente` o `descartada` es
 * justamente algo que la moderación todavía no dejó salir.
 */
async function cargar(idCrudo: string): Promise<NovedadOut | Falla> {
  const id = Number(idCrudo);
  if (!Number.isInteger(id) || id <= 0) return "no_encontrada";
  try {
    const novedad = await getNovedad(id);
    return novedad.estado === "publicada" ? novedad : "no_encontrada";
  } catch (err) {
    // Un link viejo (404) y el backend caído dicen cosas distintas al que
    // entra: uno se arregla volviendo a la portada, el otro reintentando. En
    // los dos casos la página se muestra entera, sin tirar un error.
    return err instanceof ApiError && err.status === 404
      ? "no_encontrada"
      : "backend_caido";
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const novedad = await cargar(id);

  if (typeof novedad === "string") {
    return { title: "Novedad no encontrada", robots: { index: false } };
  }

  const titulo = novedad.titulo ?? "Novedad";
  const descripcion = recortar(
    novedad.descripcion ??
      novedad.contenido ??
      "Novedades de la UTN FRRO, reunidas y ordenadas en UTNHub.",
    200,
  );
  const url = urlNovedad(novedad.id);
  // Nunca es null: sin flyer propio (o con uno que no sirve para la preview)
  // devuelve la tarjeta de marca, así la novedad siempre se comparte con algo.
  const imagen = await imagenParaPreview(novedad.imagen_url);

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: titulo,
      description: descripcion,
      // Meta pide la URL canónica, sin parámetros de sesión ni de tracking.
      url,
      siteName: "UTNHub",
      locale: "es_AR",
      publishedTime: novedad.fecha_publicacion ?? undefined,
      images: [{ url: imagen, alt: titulo }],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [imagen],
    },
  };
}

export default async function NovedadPage({ params }: PageProps) {
  const { id } = await params;
  const novedad = await cargar(id);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[var(--shell-canvas)]">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
        <div className="mb-6">
          <VolverANovedades />
        </div>

        {novedad === "no_encontrada" ? (
          <EstadoVacio
            icono={SearchX}
            titulo="Esta novedad ya no está"
            detalle="El link puede estar mal copiado, o la novedad se dio de baja. Mirá las últimas en la portada."
          />
        ) : novedad === "backend_caido" ? (
          <EstadoVacio
            icono={CloudOff}
            titulo="No pudimos cargar la novedad"
            detalle="El servidor no respondio. Proba de nuevo en un momento."
          />
        ) : (
          <NovedadArticulo novedad={novedad} />
        )}
      </div>
    </div>
  );
}
