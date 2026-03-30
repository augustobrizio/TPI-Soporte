# UTNHub

## Descripción del proyecto

Los estudiantes de UTN FRRO frecuentemente necesitan buscar información que está dispersa en múltiples fuentes: el sitio web oficial (frro.utn.edu.ar), páginas departamentales,
cuentas de Instagram de centros de estudiantes, documentos PDF (resoluciones, planes de estudio) y canales informales. Encontrar respuestas precisas y actualizadas a menudo
requiere navegar múltiples sitios, interpretar lenguaje burocrático, o preguntar a compañeros que pueden tener información desactualizada.

UTNHub un asistente integral diseñado para centralizar y facilitar el acceso a toda esta información. Además de un chatbot conversacional con inteligencia artificial donde
los estudiantes pueden hacer preguntas en lenguaje natural sobre correlatividades, trámites administrativos o cualquier tema de la facultad, el sistema ofrece un panel de
novedades actualizado automáticamente, información de profesores y sus horarios de consulta, calendario universitario con fechas de exámenes e inscripciones, y horarios de
comisiones por materia y carrera.
El chatbot se apoya en una arquitectura agéntica que no solo consulta una base de conocimiento estática, sino que tiene acceso a herramientas para realizar consultas dinámicas
sobre toda esta información. A su vez, un pipeline de ingesta de datos en vivo scrapea periódicamente varias fuentes de información, manteniendo todo el sistema actualizado.
El resultado es un único punto de consulta que reemplaza la necesidad de navegar múltiples sitios, descifrar PDFs burocráticos o depender del boca a boca.


## Modelo de Dominio

Insertar el modelo de dominio aquí.

## Bosquejo de Arquitectura

Definir la arquitectura del sistema y como interactuan sus diferentes componentes. Utilizar el Paquete **Office** de Draw.io o similar. [Ejemplo Online]().

## Requerimientos

### Funcionales

RF-01: Autenticación
Login con mail y contraseña
Sesión persistente
Roles (admin, usuarios)

RF-02: Gestión de Materias
Ver cursando/aprobadas/disponibles
Sistema de correlatividades
Planear Inscripción (validando correlatividades)
Horas de electivas cursadas

RF-03: Calculadora de Promedio
Promedio actual
Porcentaje de Ingeniero

RF04:
El sistema debe proveer una interfaz de chat conversacional donde el usuario puede realizar preguntas en lenguaje natural sobre cualquier tema relacionado con la facultad (correlatividades, trámites, fechas, horarios, novedades).

RF05:
El chatbot debe mantener contexto conversacional dentro de una misma sesión, permitiendo preguntas de seguimiento sin necesidad de repetir información previa.

RF06:
Cada respuesta del chatbot debe incluir las fuentes de donde se obtuvo la información (URL, documento PDF, post de Instagram, etc.), permitiendo al usuario verificar la respuesta.

RF07:
Si el agente no encuentra información suficiente en sus herramientas para responder una consulta, debe indicar explícitamente que no tiene esa información disponible en lugar de generar una respuesta no fundamentada.

RF08 — El sistema debe ejecutar un pipeline de ingesta automática que scrapee periódicamente las fuentes de datos configuradas.

RF09: Novedades 
Actualización automática

RF-10: Calendario Académico
Vista mensual
Lista próximos eventos, mesas de examen, feriados
Filtros por tipo

RF-11 Perfil
Datos personales
Legajo, carrera, email
Historial académico

RF-12: Scrapers
Materias + correlatividades
Profesores
Instagram
Calendario
Ejecución periódica
Deduplicación

### No Funcionales

RNF-01: Usabilidad
Interfaz intuitiva
Responsive
Navegación clara

RNF-02: Seguridad
Contraseñas hasheadas
Sesiones seguras
Sin credenciales hardcodeadas

RNF-03: Escalabilidad
Múltiples usuarios concurrentes
BD optimizada (índices)
Cache en en usuario (Nextjs)

RNF04 — Autenticación mediante Google OAuth 2.0
El sistema debe permitir que los usuarios inicien sesión utilizando su cuenta de Google a través del protocolo OAuth 2.0. 
El acceso debe estar restringido a cuentas pertenecientes al dominio institucional @frro.utn.edu.ar, rechazando cualquier cuenta externa.

RNF05 — Gestión de sesión
Una vez autenticado, el sistema debe mantener la sesión del usuario activa mediante un token seguro.
La sesión debe expirar tras un período de inactividad configurable y el usuario debe poder cerrarla manualmente.

RNF06 — Control de acceso por rol
El sistema debe asignar un rol al usuario en el momento del login (usuario, administrador) en función de atributos provistos por el proveedor de identidad o de una tabla de roles interna.
Las funcionalidades disponibles deben ajustarse según el rol asignado.

RNF07 — La frecuencia de ingesta debe ser configurable por fuente (ej: sitio web cada 24hs, Instagram cada 6-12hs, calendario semanalmente).

RNF08 — Cada ejecución de ingesta debe registrarse en un log de auditoría con: fuente procesada, timestamp de inicio y fin, cantidad de chunks creados/actualizados, y errores encontrados.

RF09 — El contenido ingestado debe pasar por un pipeline de procesamiento: extracción de texto crudo, limpieza y normalización, división en chunks con solapamiento configurable, 
generación de embeddings, e insertado en la base vectorial con metadata asociada (fuente, fecha, categoría, hash).

RF10 — El agente debe seguir una arquitectura agéntica con acceso a herramientas (tools). Ante cada consulta, el agente decide qué herramienta(s) utilizar para construir la respuesta.0
RNF11 — El sistema debe imponer un límite configurable de tokens por consulta y por sesión para controlar costos de API del LLM.

RNF12 — Las respuestas del chatbot deben generarse exclusivamente a partir de información recuperada de las fuentes indexadas. El system prompt debe instruir al modelo a no inventar información y a citar sus fuentes.

RN13 — Los embeddings deben generarse con un modelo que soporte contenido en español. Se debe evaluar la calidad de recuperación con un set de test de consultas reales en español argentino antes de elegir el modelo definitivo.

****


## Stack Tecnológico

| Tecnología | Descripción | Capa |
|---|---|---|
| Python | Uso obligatorio en la asignatura. Amplio ecosistema de librerías para desarrollo web e inteligencia artificial. | Datos/Negocio |
| FastAPI | Alto rendimiento, facilidad para crear APIs modernas y generación automática de documentación. | Presentación |
| PostgreSQL | Elegido por ser una base de datos robusta, escalable, de código abierto y con gran soporte para aplicaciones complejas. | Datos |
| SQLAlchemy | Se eligió para facilitar la interacción entre el backend y la base de datos mediante el uso de objetos en lugar de consultas SQL directas. | Datos |
| pgvector | Se eligió para poder almacenar y consultar embeddings, permitiendo realizar búsquedas semánticas necesarias para el chatbot. | Negocio |
| LangChain / LangGraph | Se eligieron para integrar modelos de lenguaje con bases de datos y gestionar la lógica del chatbot y los flujos conversacionales. | Negocio |
| React | Elegido para el desarrollo del frontend por su enfoque basado en componentes, creación de interfaces dinámicas, reutilizables y escalables. | Presentación |
| Tailwind CSS | Elegido para el diseño de la interfaz por su enfoque de clases utilitarias, consistentes y mantenibles. | Presentación |
| Beautiful Soup | Biblioteca de Python diseñada para realizar web scraping de forma rápida, permitiendo extraer datos estructurados de archivos HTML. | Datos |
| Pandas | Elegida para manejar los datos traídos desde la web. | Datos |

### Capa de Datos

Definir que base de datos, ORM y tecnologías se utilizaron y por qué.

### Capa de Negocio

Definir que librerías e integraciones con terceros se utilizaron y por qué. En caso de consumir APIs, definir cúales se usaron.

### Capa de Presentación

Definir que framework se utilizó y por qué.
