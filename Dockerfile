ARG PNPM_VERSION=10.24.0

FROM node:20-bookworm-slim AS builder

ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
# sqlite3 often installs a prebuilt .node linked against newer glibc than
# Debian bookworm (2.36); loading then fails and TypeORM reports "not installed".
ENV npm_config_build_from_source=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/backend packages/backend/
COPY packages/frontend packages/frontend/
COPY packages/shared packages/shared/

RUN pnpm build

FROM node:20-bookworm-slim AS runner

ARG PNPM_VERSION
ARG GIT_TAG=
ENV GIT_TAG=${GIT_TAG}

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  ca-certificates \
  gnupg \
  wget \
  && wget -q -O /tmp/google-chrome.asc https://dl.google.com/linux/linux_signing_key.pub \
  && gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg /tmp/google-chrome.asc \
  && rm -f /tmp/google-chrome.asc \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/backend/package.json /app/packages/backend/
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/backend/node_modules /app/packages/backend/node_modules
COPY --from=builder /app/packages/backend/openapi.yaml /app/packages/backend/openapi.yaml
COPY --from=builder /app/packages/backend/dist /app/packages/backend/dist
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist

COPY --from=builder /app/packages/frontend/dist /app/public

ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/public

LABEL org.opencontainers.image.title="scroblarr" \
  org.opencontainers.image.description="Media scrobbling service for Plex, Jellyfin, and Emby" \
  org.opencontainers.image.source="https://github.com/0xsysr3ll/scroblarr" \
  org.opencontainers.image.version="${GIT_TAG}"

EXPOSE 3000

WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
