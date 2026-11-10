# One container runs the web app and renders MP4s.
# Attach a persistent volume at /data in your host (Railway: service → Settings → Volumes).
FROM node:22-bookworm-slim

# Libraries for Remotion's headless Chrome (per Remotion's Docker docs), Debian Chromium as a fallback
# (set REMOTION_BROWSER=/usr/bin/chromium), and fonts incl. emoji
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
    libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    chromium fonts-noto-color-emoji fonts-liberation fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# Download the headless Chrome build Remotion is tested against
RUN node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('browser ready'))"
COPY . .
RUN npm run build && node scripts/bundle.mjs

ENV NODE_ENV=production \
    TADAA_DATA_DIR=/data \
    TADAA_RENDER_CONCURRENCY=1 \
    PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
