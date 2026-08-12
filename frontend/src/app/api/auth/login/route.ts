/** Login: valida contra el backend y deja la sesion en una cookie httpOnly. */
import { proxyAuth } from "@/lib/authProxy";

export async function POST(request: Request) {
  return proxyAuth(request, "/auth/login", "No se pudo iniciar sesión.");
}
