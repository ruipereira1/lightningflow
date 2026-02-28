# LightningFlow — Dockerfile
# Build multi-stage para imagem final mais pequena

FROM node:22-alpine AS base
WORKDIR /app

# Instalar dependências
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build da app
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gerar cliente Prisma
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Imagem de produção
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Criar utilizador não-root para segurança
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar ficheiros necessários
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copiar Prisma CLI para poder correr migrações em runtime
COPY --from=deps /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

# Criar pasta para a base de dados
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Garantir que o executável Prisma tem permissões correctas
RUN chmod +x ./node_modules/.bin/prisma 2>/dev/null || true

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck — permite ao Docker/Umbrel saber que a app está pronta
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Executar migrações e iniciar a app
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node server.js"]
