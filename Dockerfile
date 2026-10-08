FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --include=dev --no-audit --no-fund
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM node:20-slim AS backend-builder
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --include=dev --no-audit --no-fund
COPY backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
RUN cd backend && npx tsc

FROM node:20-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/backend/public ./public
COPY backend/package.json ./package.json
COPY backend/prisma ./prisma
CMD ["node", "dist/index.js"]
