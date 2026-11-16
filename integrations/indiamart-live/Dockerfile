FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb x11vnc novnc websockify fonts-liberation tini && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1001 appuser && mkdir /state /app && chown appuser:appuser /state /app
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
ENV DISPLAY=:99 NODE_ENV=production
USER appuser
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.mjs"]
