# Jitsi MCP join sidecar (Puppeteer + Chromium) — HTTP/SSE entrypoint for MattermostBot Loomy.
# Single stage on purpose: Puppeteer downloads Chrome into PUPPETEER_CACHE_DIR during `npm ci`,
# and a multi-stage copy would drop that browser cache unless explicitly carried over.
FROM node:22-bookworm-slim

# Chromium runtime libraries required by Puppeteer's bundled Chrome (headless).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation curl \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
      libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 \
      libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
      libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Store Puppeteer's Chrome inside the image so it survives to runtime.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Install deps (postinstall pulls Chrome-for-Testing into PUPPETEER_CACHE_DIR).
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript -> dist/
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Runtime defaults (override in Coolify env as needed).
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HEADLESS=true \
    RECORDINGS_DIR=/app/recordings

EXPOSE 3000

# HTTP server exposes /sse (MCP) + /health — this is what JITSI_MCP_URL points at.
CMD ["node", "dist/http-server.js"]
