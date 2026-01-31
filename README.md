<p align="center">
  <img src="website/static/img/logo.svg" alt="Scroblarr" width="200" />
</p>


# Scroblarr

[![License](https://img.shields.io/github/license/0xsysr3ll/scroblarr)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-8%2B-orange)](https://pnpm.io)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://ghcr.io/0xsysr3ll/scroblarr)
[![Docs](https://img.shields.io/badge/docs-available-blue)](https://0xsysr3ll.github.io/scroblarr/docs)
[![CI](https://github.com/0xsysr3ll/scroblarr/actions/workflows/ci.yml/badge.svg)](https://github.com/0xsysr3ll/scroblarr/actions)
[![Test docs](https://github.com/0xsysr3ll/scroblarr/actions/workflows/test-docs.yml/badge.svg)](https://github.com/0xsysr3ll/scroblarr/actions)
[![Release](https://img.shields.io/github/v/release/0xsysr3ll/scroblarr)](https://github.com/0xsysr3ll/scroblarr/releases)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Scroblarr automatically syncs your watch history from Plex and Jellyfin to Trakt and TVTime. No manual logging—just watch and sync.

## Features

- **Automatic syncing** — Real-time webhook-based sync; no manual steps
- **Multi-user** — Each user links their own Trakt/TVTime accounts
- **Self-hosted** — Your data stays on your server
- **Web UI** — Configure media servers, link accounts, and view sync history
- **Sync history & stats** — Dashboard with activity, failures, and trends
- **REST API** — Integrate with other tools; Swagger at `/api-docs`

## Quick start

1. **Install** — [Docker](https://github.com/0xsysr3ll/scroblarr#docker) (recommended) or [manual](https://github.com/0xsysr3ll/scroblarr#from-source)
2. **Configure** — Set up Plex/Jellyfin and webhooks (see [docs](https://0xsysr3ll.github.io/scroblarr/docs))
3. **Link accounts** — In Profile, link Trakt and/or TVTime
4. **Watch** — Scroblarr syncs in the background

## Installation

### Docker

**Standalone (SQLite):**

```bash
docker run -d \
  --name scroblarr \
  -p 3000:3000 \
  -v scroblarr-data:/app/data \
  ghcr.io/0xsysr3ll/scroblarr:latest
```

**Docker Compose:**

- **SQLite:** `compose.yml` — `docker compose up -d` (Scroblarr only, data in a volume).
- **PostgreSQL:** `compose.postgres.yml` — `docker compose -f compose.postgres.yml up -d` (Scroblarr + Postgres). Optionally set `POSTGRES_PASSWORD` in a `.env` file.

Web UI: **http://localhost:3000**

See the [installation guide](https://0xsysr3ll.github.io/scroblarr/docs/installation) for details and production deployment.

### From source

**Requirements:** Node.js 18+, pnpm 8+

```bash
git clone https://github.com/0xsysr3ll/scroblarr.git
cd scroblarr
pnpm install
pnpm dev
```

Backend runs on port **3000**, frontend dev server on **5173** (or use the backend only; it serves the built frontend in production).

First run: create an admin account in the web UI, then configure media servers and webhooks in **Settings**.

## Documentation

Full docs (installation, configuration, troubleshooting):

**https://0xsysr3ll.github.io/scroblarr/docs**

- [Installation](https://0xsysr3ll.github.io/scroblarr/docs/installation) — Docker, manual, production
- [Configuration](https://0xsysr3ll.github.io/scroblarr/docs/configuration) — Plex, Jellyfin, webhooks, Trakt, TVTime
- [How it works](https://0xsysr3ll.github.io/scroblarr/docs/how-it-works) — Flow and multi-user
- [Architecture](https://0xsysr3ll.github.io/scroblarr/docs/architecture) — Monorepo and dev setup
- [Troubleshooting](https://0xsysr3ll.github.io/scroblarr/docs/troubleshooting) — Common issues

## Development

```bash
pnpm install
pnpm dev          # Backend + frontend
pnpm dev:backend  # Backend only (port 3000)
pnpm dev:frontend # Frontend only (port 5173)
pnpm dev:docs     # Docusaurus docs (port 3001)
```

**Checks before committing:**

```bash
pnpm check        # Lint + format check + type-check
pnpm format       # Format code with Prettier
pnpm lint:fix     # Auto-fix lint issues
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Tech stack

- **Backend:** Express, TypeORM, SQLite/PostgreSQL, Pino, Puppeteer (TVTime)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, i18next
- **Monorepo:** pnpm workspaces (`packages/backend`, `packages/frontend`, `packages/shared`, `website`)

## Links

- **Documentation:** https://0xsysr3ll.github.io/scroblarr/docs
- **Issues:** https://github.com/0xsysr3ll/scroblarr/issues
- **Docker image:** `ghcr.io/0xsysr3ll/scroblarr`

## License

See [LICENSE](LICENSE) in this repository.
