---
sidebar_position: 1
slug: /
---

# Welcome to Scroblarr

**Scroblarr** is a self-hosted service that syncs watch history from **Plex** and **Jellyfin** to **Trakt**, **TVTime**, and **Simkl** using webhooks—no manual logging. For badges, releases, and repo-wide info, see the [README on GitHub](https://github.com/0xsysr3ll/scroblarr/blob/main/README.md).

## Quick start

1. **[Install](/docs/installation)** — Docker or build from source
2. **[Configure](/docs/configuration)** — Media servers, API key, webhooks, linked accounts
3. **Watch something** — Scroblarr processes scrobble events and updates your destinations

```
Plex/Jellyfin → Webhook → Scroblarr → Trakt/TVTime/Simkl
```

## Documentation

- **[Installation](/docs/installation)** — Docker or build from source
- **[Configuration](/docs/configuration)** — Media servers, API key, Trakt, TVTime, Simkl
- **[How it works](/docs/how-it-works)** — Flow, multi-user, what gets synced
- **[Architecture](/docs/architecture)** — Monorepo layout and API overview
- **[API Reference](/docs/api/scroblarr-api)** — OpenAPI-generated endpoint reference grouped by area (try requests from the live app at `/api-docs`)
- **[Troubleshooting](/docs/troubleshooting)** — Webhooks, syncs, database

## Need help?

Use [Troubleshooting](/docs/troubleshooting) first, then [GitHub Issues](https://github.com/0xsysr3ll/scroblarr/issues) for bugs or features.
