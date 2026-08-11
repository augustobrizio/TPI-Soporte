import type { NextConfig } from "next";

// URL del backend. En local es el docker-compose; en produccion, la del
// servicio de App Runner (se setea como variable de entorno en Amplify).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Proxy para mutaciones client-side: evita CORS en dev y simplifica prod.
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
