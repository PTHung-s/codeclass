# Production Dockerfile for CodeClass
# Single container: Express API (:3001) + React build served by Express.

FROM node:20-alpine

# Python + C++ compiler required by the code judge.
RUN apk add --no-cache python3 g++

WORKDIR /app
RUN mkdir -p /app/testcases

# Install and build frontend.
COPY client/package*.json ./client/
RUN cd /app/client && npm ci
COPY client/ ./client/
RUN cd /app/client && npm run build
RUN rm -rf /app/client/node_modules

# Install and build backend.
COPY server/package*.json ./server/
RUN cd /app/server && npm ci
COPY server/ ./server/
# --schema pinned explicitly: prisma otherwise prefers a ./schema.prisma in cwd
# over prisma/schema.prisma, and a stray copy once silently hijacked the build.
RUN cd /app/server && npx prisma generate --schema prisma/schema.prisma
RUN cd /app/server && npx tsc
RUN cd /app/server && npm prune --omit=dev

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3001

# Start script: sync schema.prisma into volume, apply only non-destructive schema additions,
# regenerate Prisma client, then start the API. A destructive schema change stops deployment
# instead of risking production data.
RUN cp -r /app/server/prisma /app/server-prisma-snapshot
CMD ["sh", "-c", "cp /app/server-prisma-snapshot/schema.prisma /app/server/prisma/schema.prisma && npx prisma db push --skip-generate --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma && node dist/index.js"]
