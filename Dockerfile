# Stage 1: Build the application
FROM node:22-alpine3.20 AS builder

WORKDIR /app

# Copy package files and prisma schema (needed for postinstall prisma generate)
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Install all dependencies (including dev for build)
RUN npm ci

# Regenerate Prisma client for Linux
RUN npx prisma generate --schema=prisma/schema.prisma && \
    npx prisma generate --schema=prisma/db_external.prisma

# Copy source code
COPY . .

RUN npm run build

# Stage 2: Production runner for app
FROM node:22-alpine3.20 AS runner

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./

# Install all dependencies (workers need tsx)
RUN npm ci

# Regenerate Prisma client for Linux in runner stage
RUN npx prisma generate --schema=prisma/schema.prisma && \
    npx prisma generate --schema=prisma/db_external.prisma

# Copy build output
COPY --from=builder /app/build ./build

# Copy source for workers (they run TypeScript directly)
COPY --from=builder /app/app ./app

# Copy generated prisma clients from builder (with Linux binaries) to build directory
RUN cp -r /app/prisma/generated /app/build/server/generated

EXPOSE ${PORT:-3005}

CMD sh -c "\
  until nc -z db 5432; do echo 'Waiting for database...'; sleep 2; done && \
  npx prisma migrate deploy && \
  npm run start"
