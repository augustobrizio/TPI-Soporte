# Compartir y previews de link (Open Graph / WhatsApp)

Cómo se comparte una novedad y qué hace falta para que el mensaje salga con
tarjeta de preview. Casi todo lo de acá son **restricciones de Meta**, no
decisiones nuestras: si se rompen, la preview no falla con un error, sale
pelada.

Fuente: [Link Previews](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews)
(Meta for Developers → WhatsApp).

## Cómo funciona

1. El usuario toca **WhatsApp** en una novedad
   (`features/novedades/CompartirNovedad.tsx`).
2. Se abre `https://wa.me/?text=<título>%0A%0A<url>` — el formato oficial de
   *click to chat* sin destinatario: WhatsApp abre el selector de contacto con
   el mensaje ya escrito.
3. Antes de mandarlo, **el teléfono del que comparte** pide la URL con
   `User-Agent: WhatsApp/2.x.x.x [A|I|N]` y arma la preview con las meta de
   Open Graph del HTML. La preview se genera en el emisor, no en el receptor.
4. Esa URL es `/novedades/<id>`
   (`app/(dashboard)/novedades/[id]/page.tsx`), que tiene `generateMetadata`
   con el título, el resumen y el flyer de esa novedad.

El deep link viejo `/novedades?novedad=<id>` sigue existiendo para el buscador
y la campana, donde el modal es lo correcto porque no te saca del feed. Pero
**no sirve para compartir**: el crawler no ejecuta JavaScript ni abre modales,
y la portada solo puede declarar las meta genéricas del sitio.

## Las reglas de Meta

| Regla | Dónde se cumple |
|---|---|
| `og:title`, `og:description`, `og:url` y `og:image`, ninguna vacía | `generateMetadata` de `novedades/[id]` |
| El `<head>` dentro de los primeros **300 KB** del HTML | Next lo resuelve solo, ver abajo |
| Imagen de menos de **600 KB** | `lib/ogImagen.ts` |
| Imagen de **300 px** de ancho o más, relación ≤ 4:1 | flyers de S3 y placeholders de `public/` cumplen |
| `og:url` canónica, sin parámetros de sesión ni tracking | `lib/site.ts` (`urlNovedad`) |

Los formatos que WhatsApp rasteriza son JPEG, PNG y WebP. **SVG y GIF no.**

### El límite de 600 KB falla en silencio

WhatsApp no muestra una imagen rota ni avisa: arma la tarjeta sin imagen. Un
flyer pesado subido por cualquier cuenta alcanzaría para que la preview salga
pelada sin que nos enteremos.

Por eso `lib/ogImagen.ts` verifica **antes** de prometer la imagen: los
archivos nuestros de `public/` los mide en disco, y los del bucket S3 con un
`HEAD` (content-type y content-length, timeout de 3 s). Si algo no cierra,
cae a la tarjeta de marca de `app/opengraph-image.tsx` (35 KB, siempre
disponible). El fallback de una imagen dudosa es una preview con marca, no una
preview sin imagen.

Medido sobre datos reales: los flyers en
`utnhub-novedades-media.s3.us-east-1.amazonaws.com` pesan 80–125 KB y son
`image/jpeg`, o sea que el chequeo no filtra lo que hoy hay en producción; está
para el día que aparezca uno de 2 MB.

### Nada de generar la tarjeta con `ImageResponse`

Sería lo vistoso —una tarjeta por novedad, como la de la home— pero
`ImageResponse` **solo emite PNG**, y un PNG de 1200x630 con una foto adentro
pasa el mega. Justo lo que WhatsApp descarta. El flyer original ya viene en
JPEG comprimido y por debajo del límite, y encima es lo que la gente quiere
ver cuando le comparten una novedad.

### La imagen hay que declararla explícitamente

Parece que alcanzaría con no declarar imagen en la ruta y dejar que herede la
de `app/opengraph-image.tsx`. **No**: en cuanto una ruta declara su propio
bloque `openGraph`, Next deja de heredar la imagen del layout de arriba y el
HTML sale sin `og:image`. Verificado sobre el HTML renderizado.

### El `<head>` y el streaming de metadata

Next 15 (desde 15.2) puede mandar la metadata **fuera del `<head>`**, al final
del body, para no bloquear el streaming. En este proyecto, con un request
normal, las meta `og:*` aparecen recién en el byte ~63.000 — después de
`</head>`.

No es un problema porque Next mantiene una lista de crawlers "HTML limited"
(`WhatsApp`, `facebookexternalhit`, `Twitterbot`, `Slackbot`, `Discordbot`,
etc.): cuando el `User-Agent` matchea, no streamea y escribe la metadata en el
`<head>`. Verificado con `curl -A "WhatsApp/2.24.1.78 A"`: las meta quedan en
el byte ~1.700, holgadamente dentro de los 300 KB.

**Si algún día se toca el streaming de metadata o se sube de versión mayor de
Next, esto es lo primero a re-verificar**, porque el síntoma es una preview sin
imagen en WhatsApp y nada raro en el navegador.

## Cómo probarlo

Sin Docker ni Neon, con un backend de mentira:

```bash
# 1. levantar un stub que conteste GET /novedades/<id>
# 2. frontend/.env.local -> NEXT_PUBLIC_API_URL + APP_URL
npm run dev --prefix frontend
```

Y después mirar el HTML como lo ve el crawler, no el navegador:

```bash
curl -s -A "WhatsApp/2.24.1.78 A" http://localhost:3000/novedades/1 | grep -o '<meta property="og:[^>]*>'
```

Con el sitio ya desplegado, el
[Sharing Debugger de Meta](https://developers.facebook.com/tools/debug/) fuerza
un re-scrape y muestra qué leyó — sirve también para WhatsApp, que comparte el
crawler con Facebook.

## Archivos

- `frontend/src/lib/site.ts` — origen público (`APP_URL`) y URL canónica de una novedad.
- `frontend/src/lib/ogImagen.ts` — elección y verificación de la `og:image`.
- `frontend/src/app/(dashboard)/novedades/[id]/page.tsx` — la página que se comparte y su `generateMetadata`.
- `frontend/src/features/novedades/CompartirNovedad.tsx` — botones de WhatsApp y copiar link.
- `frontend/src/app/opengraph-image.tsx` — tarjeta de marca, fallback de la preview.
