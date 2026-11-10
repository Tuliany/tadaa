# One container runs the web app and renders MP4s.
# Attach a persistent volume at /data in your host (Railway: service → Settings → Volumes).
FROM node:22-bookworm-slim

# Chromium + fonts for Remotion rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-noto-color-emoji fonts-liberation fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    TADAA_DATA_DIR=/data \
    REMOTION_BROWSER=/usr/bin/chromium \
    PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
