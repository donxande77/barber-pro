# Imagem única: a API Express serve o frontend já compilado (mesma origem → cookies e CSRF simples).
# Build:  docker build -t barber-pro .
# Run:    veja docker-compose.prod.yml e docs/07-implantacao-e-backup.md

FROM node:22-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.js ./
RUN npm ci --omit=dev --ignore-scripts && npm install --no-save prisma@7.10.1 && npx prisma generate
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY --from=web /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production \
    PORT=3333 \
    FRONTEND_DIST=/app/frontend/dist \
    UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3333/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica as migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
