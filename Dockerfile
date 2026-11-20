# syntax=docker/dockerfile:1
# ============================================================
# Imagen de produccion para sistema-control-horas (Next.js 16 standalone)
#
# Node 24 LTS:
#   - Es la misma version mayor que usa el entorno de desarrollo (24.22.2).
#   - Next 16.4.6 exige >=20.9.0; el resto de dependencias exige como maximo
#     >=20.18.1 (shadcn/undici), por lo que 24 cumple todo el arbol.
#   - node:24-alpine mantiene la imagen pequena y el lockfile ya incluye los
#     binarios musl (sharp y @tailwindcss/oxide) necesarios en Alpine.
# La misma version se usa en las tres etapas para evitar diferencias de build.
# ============================================================
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Build ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# El build NO debe conectarse a la base de datos. lib/db.ts solo crea el pool
# (no abre conexion) y las rutas no se ejecutan en tiempo de build. Aun asi se
# pasan valores ficticios por si Next evalua algun modulo que exija las
# variables en NODE_ENV=production. No son secretos y no llegan a la imagen
# final porque pertenecen solo a la capa de build.
RUN DB_HOST=127.0.0.1 \
    DB_PORT=3306 \
    DB_USER=build \
    DB_PASSWORD=build \
    DB_NAME=build \
    npm run build

# ---------- Runtime ----------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Usuario sin privilegios. El proceso no necesita root para escuchar en 3000.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# public y los estaticos no se incluyen en .next/standalone: se copian aparte.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# /api/salud consulta MySQL: es un readiness check. Si MySQL no responde, el
# contenedor queda "unhealthy" (Docker Compose no lo reinicia por eso).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
