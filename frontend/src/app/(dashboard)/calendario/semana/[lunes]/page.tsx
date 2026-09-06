import { permanentRedirect } from "next/navigation";

/**
 * La semana ahora se comparte como `/?semana=<lunes>`: la portada anclada en
 * esa semana, que es donde el panel vive de verdad.
 *
 * Esta ruta queda como redirect porque los links ya compartidos apuntan acá y
 * un link de WhatsApp no se puede corregir después de mandado. `permanentRedirect`
 * (308) para que los crawlers se queden con el destino y la preview se arme
 * contra la portada, que es la que declara las meta de la semana.
 */
export default async function SemanaRedirect({
  params,
}: {
  params: Promise<{ lunes: string }>;
}) {
  const { lunes } = await params;
  permanentRedirect(`/?semana=${encodeURIComponent(lunes)}`);
}
