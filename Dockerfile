ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

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
