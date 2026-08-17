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
  // Se valida contra el backend, no alcanza con que exista la cookie: un token
  // vencido o de una cuenta borrada tiene que contar como visitante anonimo.
  // `null` no corta el render — el shell se muestra igual y cada seccion
  // decide si necesita cuenta.
  const usuario = await getUsuarioActual();

  return (
    <SidebarProvider>
      <TopNav autenticado={Boolean(usuario)} />
      <Sidebar
        usuario={
          usuario
            ? {
                nombre: nombreVisible(usuario),
                detalle: usuario.legajo
                  ? `Leg. ${usuario.legajo}`
                  : usuario.email,
                iniciales: iniciales(usuario),
              }
            : null
        }
      />
      <DashboardMain>{children}</DashboardMain>
    </SidebarProvider>
  );
}
