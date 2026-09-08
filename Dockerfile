ARG NODE_IMAGE=node:24-bookworm-slim@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e

FROM ${NODE_IMAGE} AS base

RUN corepack enable

WORKDIR /app

FROM base AS builder

ENV HUSKY=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
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
ENV GIT_TAG=${GIT_TAG}
ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/public

WORKDIR /app

COPY --from=builder /deploy/ ./
COPY --from=builder /app/packages/frontend/dist ./public

LABEL org.opencontainers.image.title="scroblarr" \
  org.opencontainers.image.description="Media scrobbling service for Plex, Jellyfin, and Emby" \
  org.opencontainers.image.source="https://github.com/0xsysr3ll/scroblarr" \
  org.opencontainers.image.version="${GIT_TAG}"

EXPOSE 3000

CMD ["node", "dist/index.js"]
