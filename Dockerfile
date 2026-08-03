# Jitsi MCP join sidecar — HTTP/SSE entrypoint for MattermostBot Loomy.
# Base on the official Puppeteer image: it already bundles Chrome + all system
# libraries for the pinned puppeteer version, so we avoid a heavy apt layer
# (which got OOM-killed on the Coolify build server) and guarantee a Chrome
# that matches puppeteer 23.11.1 exactly.
FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root
WORKDIR /app

# Chrome already lives in the image's puppeteer cache — don't re-download it.
# NB: NODE_ENV is set AFTER the build — setting it to production here would make
# `npm ci` skip devDependencies (@types/*, typescript) and break `tsc`.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
    PORT=3000 \
    HOST=0.0.0.0 \
    HEADLESS=true \
    RECORDINGS_DIR=/app/recordings

# Install deps incl. devDeps (Chrome download skipped) then build TypeScript -> dist/.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

ENV NODE_ENV=production

# Recordings dir + hand ownership back to the sandbox user.
RUN mkdir -p /app/recordings && chown -R pptruser:pptruser /app
USER pptruser

EXPOSE 3000

# Serves /sse (MCP) + /health — what JITSI_MCP_URL points at.
CMD ["node", "dist/http-server.js"]
