ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS base

RUN corepack enable

WORKDIR /app

FROM base AS builder

ENV HUSKY=0

ARG GIT_TAG=
ARG COMMIT_TAG=local
ENV GIT_TAG=${GIT_TAG}
ENV COMMIT_TAG=${COMMIT_TAG}

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
COPY website/package.json website/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/backend packages/backend/
COPY packages/frontend packages/frontend/
COPY packages/shared packages/shared/

RUN pnpm build

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter=@scroblarr/backend deploy --prod --legacy /deploy

FROM ${NODE_IMAGE} AS runner

ARG GIT_TAG=
ARG COMMIT_TAG=
ENV GIT_TAG=${GIT_TAG}
ENV COMMIT_TAG=${COMMIT_TAG}
ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/public
ENV DATA_DIR=/app/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /deploy/ ./
COPY --from=builder /app/packages/frontend/dist ./public

LABEL org.opencontainers.image.title="scroblarr" \
  org.opencontainers.image.description="Media scrobbling service for Plex, Jellyfin, and Emby" \
  org.opencontainers.image.source="https://github.com/0xsysr3ll/scroblarr" \
  org.opencontainers.image.version="${GIT_TAG}" \
  org.opencontainers.image.revision="${COMMIT_TAG}"

EXPOSE 3000

CMD ["node", "dist/index.js"]
