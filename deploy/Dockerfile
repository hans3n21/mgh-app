# Multi-stage Dockerfile für MGH App
# Unterstützt ARM (QNAP) und x86_64
# Optimiert für Production

# ============================================
# Stage 1: Base Image (ARM & x86 kompatibel)
# ============================================
FROM node:18-alpine AS base

# Installiere notwendige System-Dependencies
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# ============================================
# Stage 2: Dependencies
# ============================================
FROM base AS deps

# Kopiere Package-Dateien
COPY package.json package-lock.json ./

# Installiere Dependencies
# Nutze npm ci wenn package-lock.json existiert, sonst npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --legacy-peer-deps; \
    else \
      npm install --omit=dev --legacy-peer-deps; \
    fi

# ============================================
# Stage 3: Builder (mit Dev-Dependencies)
# ============================================
FROM base AS builder

# Kopiere Package-Dateien
COPY package.json package-lock.json ./

# Installiere ALLE Dependencies (inkl. Dev) für Build
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps; \
    else \
      npm install --legacy-peer-deps; \
    fi

# Kopiere Prisma Schema
COPY prisma ./prisma

# Generiere Prisma Client
# (DATABASE_URL wird zur Build-Zeit nicht benötigt für generate)
RUN npx prisma generate

# Kopiere restlichen Code
COPY . .

# Setze Build-Umgebungsvariablen
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Baue die Next.js App
RUN npm run build

# ============================================
# Stage 4: Runner (Production)
# ============================================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Erstelle non-root User für Sicherheit
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Kopiere gebaute App (Standalone Output)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Kopiere Prisma Files
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Kopiere Production Dependencies
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Erstelle notwendige Verzeichnisse
RUN mkdir -p /app/uploads /app/logs && \
    chown -R nextjs:nodejs /app

# Wechsle zu non-root User
USER nextjs

# Exponiere Port
EXPOSE 3000

# Setze Port und Hostname
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))" || exit 1

# Starte die App
# Prisma Client ist bereits generiert, daher nur start
CMD ["node", "server.js"]

