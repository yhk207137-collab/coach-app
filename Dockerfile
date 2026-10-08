FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM node:20-slim AS backend-builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./backend/
RUN cd backend && npm install
COPY backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY --from=frontend-builder /app/backend/public ./backend/public
RUN cd backend && npx tsc

FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app/backend
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/public ./public
COPY backend/prisma ./prisma
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
