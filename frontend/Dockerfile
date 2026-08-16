# Multi-stage sobre el build standalone de Next (`output: "standalone"` en
# next.config.ts). La imagen final se queda solo con el server y las deps
# podadas: ni toolchain, ni devDependencies, ni el node_modules completo.

FROM node:22-alpine AS deps
WORKDIR /app
# Solo el manifiesto + lock: mientras no cambien, el layer del npm ci sale de
# cache aunque haya cambiado el codigo.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se inlinean en el bundle del browser en tiempo de BUILD,
# no de runtime: por eso entra como ARG y no alcanza con setearla como
# variable del servicio. Si el frontend en produccion termina pegandole a
# localhost:8000, es esto: hay que REBUILDEAR, reiniciar no cambia nada.
# Railway expone las variables del servicio a los ARG homonimos del Dockerfile.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Usuario sin privilegios: si alguien logra ejecutar algo dentro del container,
# que no sea root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# public/ y .next/static quedan AFUERA de standalone a proposito (Next asume
# que un CDN los sirve). Sin estos dos COPY la app responde el HTML pero sin
# CSS ni imagenes, que es el sintoma clasico de un standalone mal armado.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# HOSTNAME=0.0.0.0 es obligatorio: el server de standalone bindea a localhost
# por default y desde afuera del container no entraria nadie. PORT lo pisa
# Railway con el suyo (las env vars de la plataforma ganan sobre las del
# Dockerfile); el 3000 es el default para correrlo local.
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
