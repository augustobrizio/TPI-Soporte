import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

/**
 * Manrope (titulares — geometrico, "high-tech identity") e
 * Inter (UI/data — funcional). Cargados via next/font con CSS variables
 * para enchufarlos en `tailwind.config.ts`.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "600", "700", "800"],
  display: "swap", 
});

/**
 * Metadata del sitio — es lo que se ve al compartir el link, no solo en la
 * pestaña.
 *
 * La anterior decia "Student Dashboard" (en ingles, y el dashboard ya no vive
 * en la portada sino en /perfil) y prometia un chatbot que todavia es un
 * placeholder. Ahora dice lo mismo que la portada, que ademas es lo que la
 * app realmente hace hoy.
 */
const TITULO = "UTNHub — Todo lo de la facultad, en un solo lugar";
const DESCRIPCION =
  "Novedades, profesores, comisiones, calendario y material de la UTN FRRO, reunidos y ordenados en un solo lugar.";

export const metadata: Metadata = {
  // Base para resolver las URLs relativas de Open Graph. Sin esto Next avisa
  // por consola y las previews quedan con rutas rotas.
  metadataBase: new URL("https://utnhub.up.railway.app"),
  title: {
    default: TITULO,
    // Las paginas ponen solo su nombre y el sufijo lo agrega el template.
    template: "%s | UTNHub",
  },
  description: DESCRIPCION,
  applicationName: "UTNHub",
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    siteName: "UTNHub",
    locale: "es_AR",
    type: "website",
    url: "/",
  },
  twitter: {
    // `summary` y no `summary_large_image`: todavia no hay imagen de preview,
    // y pedir la tarjeta grande sin imagen la deja vacia.
    card: "summary",
    title: TITULO,
    description: DESCRIPCION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Material Symbols Outlined — los iconos del Stitch. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-surface text-on-surface font-body selection:bg-primary/30 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
