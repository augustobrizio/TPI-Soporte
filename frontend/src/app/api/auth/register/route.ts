/** Registro: crea la cuenta en el backend y deja la sesion iniciada. */
import { proxyAuth } from "@/lib/authProxy";

export async function POST(request: Request) {
  return proxyAuth(request, "/auth/register", "No se pudo crear la cuenta.");
}
