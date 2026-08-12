import { redirect } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { SidebarProvider } from "@/components/SidebarContext";
import { DashboardMain } from "@/components/DashboardMain";
import { getUsuarioActual, iniciales, nombreVisible } from "@/lib/auth";

/**
 * Shell del dashboard: sidebar colapsable (256px / 64px), topbar fija de 64px,
 * contenido con offset dinámico + pt-16. El bg-blueprint es el dotted
 * radial-gradient que define el sistema "Kinetic Blueprint".
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El middleware ya rebota a quien no tenga cookie, pero solo mira que exista.
  // Aca se valida de verdad contra el backend: si el token vencio o la cuenta
  // se borro, se corta antes de renderizar nada del dashboard.
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <SidebarProvider>
      <TopNav />
      <Sidebar
        usuario={{
          nombre: nombreVisible(usuario),
          detalle: usuario.legajo ? `Leg. ${usuario.legajo}` : usuario.email,
          iniciales: iniciales(usuario),
        }}
      />
      <DashboardMain>{children}</DashboardMain>
    </SidebarProvider>
  );
}
