# mediasoup worker phải build native (meson/ninja) → cần đầy đủ toolchain
FROM node:22-bookworm AS builder

WORKDIR /app

# Toolchain build mediasoup-worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-setuptools python3-wheel \
    build-essential meson ninja-build pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Prebuild mediasoup worker binary (tải + compile một lần ở layer này)
RUN npm rebuild mediasoup || true

# ---- Runtime image ----
FROM node:22-bookworm-slim

WORKDIR /app

# mediasoup-worker binary cần gcc runtime + python không cần ở runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy worker binary đã build từ stage builder
COPY --from=builder /app/node_modules/mediasoup/worker/out/Release/mediasoup-worker \
     /app/node_modules/mediasoup/worker/out/Release/mediasoup-worker

COPY dist ./dist

# Tạo user không phải root (bảo mật)
USER node

EXPOSE 4443 40000-40100/udp 40000-40100/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4443)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
