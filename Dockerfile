# syntax=docker/dockerfile:1
# Lox Nexus. One image for amd64 and arm64 (no native modules):
#   docker buildx build --platform linux/amd64,linux/arm64 -t lox-nexus .
# Run it with compose.yaml, or: docker run -d --network host -v nexus-data:/data --init lox-nexus

ARG NODE_IMAGE=node:24-bookworm-slim

# 1. What doesn't depend on the target platform is built once, on the build machine (no emulation):
#    the web UI, the documentation site and the first-party plugin bundles.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS assets
WORKDIR /src
COPY . .
RUN npm ci --no-audit --no-fund
RUN npm run build -w @lox-nexus/web \
 && npm run docs:build \
 && npm run plugins:build
# the plugin repository the UI installs from: one folder per plugin with package.json, its bundle
# and its README (installed with it and shown under Read me)
RUN mkdir /plugin-repository \
 && for dir in plugins/*/; do \
      name="$(basename "$dir")"; \
      mkdir -p "/plugin-repository/$name" && cp "$dir/package.json" "/plugin-repository/$name/" && cp -r "$dir/dist" "/plugin-repository/$name/"; \
      if [ -f "$dir/README.md" ]; then cp "$dir/README.md" "/plugin-repository/$name/"; fi; \
    done

# 2. The server's production dependencies, on the target platform: tsx, which runs the server's
#    TypeScript, brings an esbuild binary per architecture.
FROM ${NODE_IMAGE} AS server
WORKDIR /app
COPY . .
RUN npm ci --omit=dev --no-audit --no-fund -w @lox-nexus/server \
 && rm -rf apps/web apps/docs plugins/*/src

# 3. The image: the server with its dependencies, and the built assets.
FROM ${NODE_IMAGE}
# git installs plugins from a git URL (Plugins → Install → Git)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXUS_DATA_DIR=/data \
    NEXUS_HTTP_HOST=0.0.0.0 \
    NEXUS_HTTP_PORT=8080 \
    NEXUS_WEB_DIR=/app/apps/web/dist \
    NEXUS_DOCS_DIR=/app/apps/docs/dist \
    NEXUS_PLUGIN_REPOSITORY=/app/plugin-repository
COPY --from=server /app /app
COPY --from=assets /src/apps/web/dist /app/apps/web/dist
COPY --from=assets /src/apps/docs/dist /app/apps/docs/dist
COPY --from=assets /plugin-repository /app/plugin-repository
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/server
VOLUME /data
# web UI; Loxone intercommunication (UDP, the port each Miniserver is configured with; 61263 by default)
EXPOSE 8080/tcp 61263/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.NEXUS_HTTP_PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--conditions=@lox-nexus/source", "--import", "tsx", "src/main.ts"]
