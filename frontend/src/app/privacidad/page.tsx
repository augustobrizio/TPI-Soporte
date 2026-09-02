import type { Metadata } from "next";
import Link from "next/link";

/**
 * Politica de privacidad publica.
 *
 * Existe sobre todo porque Google la exige para pasar la pantalla de
 * consentimiento OAuth a produccion (login con Google abierto a cualquier
 * cuenta). El texto es honesto y minimo: UTNHub es un TPI academico, el unico
 * dato de terceros que toca es el perfil basico de Google al iniciar sesion.
 */

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo UTNHub trata los datos de las personas usuarias: qué se recolecta, para qué y con quién se comparte.",
};

const ACTUALIZADO = "1 de septiembre de 2026";
const CONTACTO = "brunovitali33@gmail.com";

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface">
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen bg-surface px-6 py-16 text-on-surface font-body">
      <article className="mx-auto max-w-2xl">
        <p className="font-label text-sm uppercase tracking-[0.14em] text-outline">
          UTNHub · ISI · UTN FRRO
        </p>
        <h1 className="mt-3 font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">
          Política de Privacidad
        </h1>
        <p className="mt-3 text-sm text-outline">
          Última actualización: {ACTUALIZADO}
        </p>

        <p className="mt-8 text-on-surface-variant leading-relaxed">
          UTNHub es un proyecto académico desarrollado por estudiantes de
          Ingeniería en Sistemas de Información de la UTN Facultad Regional
          Rosario. Reúne en un solo lugar información de la facultad (materias,
          profesores, comisiones, calendario y novedades). Esta política
          explica qué datos tratamos y para qué.
        </p>

        <Seccion titulo="Qué datos recolectamos">
          <p>
            Cuando iniciás sesión con Google, recibimos de tu cuenta únicamente
            tu <strong>nombre</strong>, tu <strong>dirección de correo</strong>{" "}
            y tu <strong>foto de perfil</strong>. No accedemos a tu correo, tu
            agenda, tus contactos ni a ningún otro dato de tu cuenta de Google.
          </p>
          <p>
            Además, guardamos la información académica que vos cargás dentro de
            la app (por ejemplo, el estado de tus materias, tu horario y tus
            tareas), para poder mostrártela cuando volvés a entrar.
          </p>
        </Seccion>

        <Seccion titulo="Para qué usamos tus datos">
          <p>
            Usamos estos datos solo para que la aplicación funcione:
            identificarte al iniciar sesión, mantener tu sesión activa y
            personalizar lo que ves según tu cursada. No los usamos con fines
            publicitarios.
          </p>
        </Seccion>

        <Seccion titulo="Con quién los compartimos">
          <p>
            No vendemos ni cedemos tus datos a terceros. La información se aloja
            en la infraestructura que usa el proyecto (base de datos y hosting)
            exclusivamente para prestar el servicio.
          </p>
        </Seccion>

        <Seccion titulo="Conservación y baja">
          <p>
            Conservamos tus datos mientras tu cuenta exista. Si querés que
            eliminemos tu cuenta y la información asociada, escribinos a{" "}
            <a
              className="text-primary underline underline-offset-2"
              href={`mailto:${CONTACTO}`}
            >
              {CONTACTO}
            </a>{" "}
            y lo hacemos.
          </p>
        </Seccion>

        <Seccion titulo="Contacto">
          <p>
            Ante cualquier duda sobre esta política o sobre tus datos, podés
            escribir a{" "}
            <a
              className="text-primary underline underline-offset-2"
              href={`mailto:${CONTACTO}`}
            >
              {CONTACTO}
            </a>
            .
          </p>
        </Seccion>

        <div className="mt-14 border-t border-outline-variant pt-6">
          <Link
            href="/"
            className="text-sm text-outline transition-colors hover:text-on-surface"
          >
            ← Volver a UTNHub
          </Link>
        </div>
      </article>
    </main>
  );
}
