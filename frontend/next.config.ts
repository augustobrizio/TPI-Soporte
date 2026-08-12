import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
