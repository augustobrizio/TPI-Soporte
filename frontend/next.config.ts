import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Empaqueta el server y solo las deps que realmente se importan en
  // .next/standalone. Sin esto la imagen de produccion tendria que cargar
  // node_modules entero (cientos de MB) para levantar `next start`.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // El proxy de /api/backend/* ya no es un rewrite: ahora es un route handler
  // (`app/api/backend/[...path]/route.ts`) porque tiene que leer la cookie de
  // sesion (httpOnly) y mandar el `Authorization` al backend, cosa que un
  // rewrite no puede hacer.
};

export default nextConfig;
