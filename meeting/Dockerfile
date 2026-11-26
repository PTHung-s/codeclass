# syntax=docker/dockerfile:1

# --- Client: KHÔNG build trong container (VPS 1GB RAM bị OOM).
# dist/ được build trên máy dev rồi copy vào client/dist trước khi deploy.
FROM node:20-alpine AS build-client
WORKDIR /client
COPY client/dist ./dist

# --- Build Stage: Server ---
FROM node:20-alpine AS build-server
WORKDIR /server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# --- Final Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build-server /server/dist ./dist
COPY --from=build-server /server/node_modules ./node_modules
COPY --from=build-server /server/package*.json ./
COPY --from=build-server /server/public ./public

# Server chạy từ /app/dist/index.js → path.join(__dirname, '../../client/dist') = /client/dist
COPY --from=build-client /client/dist /client/dist

EXPOSE 5000
CMD ["npm", "start"]
