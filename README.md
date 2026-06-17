<p align="center">
  <img src="website/static/img/logo.svg" alt="Scroblarr" width="200" />
</p>

# Scroblarr

[![CI](https://img.shields.io/github/actions/workflow/status/0xsysr3ll/scroblarr/ci.yml?branch=develop&label=ci&logo=githubactions&logoColor=white&style=flat-square)](https://github.com/0xsysr3ll/scroblarr/actions)
[![codecov](https://codecov.io/github/0xSysR3ll/scroblarr/graph/badge.svg?token=33KWA8F92B&style=flat-square)](https://codecov.io/github/0xSysR3ll/scroblarr)
[![Release](https://img.shields.io/github/v/release/0xsysr3ll/scroblarr?label=release&logo=github&logoColor=white&style=flat-square)](https://github.com/0xsysr3ll/scroblarr/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2F0xsysr3ll%2Fscroblarr-2496ED?logo=docker&logoColor=white&style=flat-square)](https://github.com/0xSysR3ll/scroblarr/pkgs/container/scroblarr)
[![License](https://img.shields.io/github/license/0xsysr3ll/scroblarr?style=flat-square)](LICENSE)

**Scroblarr** automatically syncs your watch history from [Plex](https://plex.tv) and [Jellyfin](https://jellyfin.org) to [Trakt](https://trakt.tv), [TVTime](https://www.tvtime.com), and [Simkl](https://simkl.com). \
No manual logging — just watch and sync.

## Features

- **Automatic syncing** — Real-time webhook-based sync; no manual steps
- **Multi-user** — Each user links their own Trakt, TVTime, and Simkl accounts
- **Self-hosted** — Your data stays on your server
- **Web UI** — Configure media servers, link accounts, and view sync history
- **Sync history & stats** — Dashboard with activity, failures, and trends
- **REST API** — Integrate with other tools; Swagger at `/api-docs`

## Getting Started

Check out the documentation for installation (Docker or build from source), configuration, and troubleshooting:

**https://0xsysr3ll.github.io/scroblarr/docs**

- [Installation](https://0xsysr3ll.github.io/scroblarr/docs/installation)
- [Configuration](https://0xsysr3ll.github.io/scroblarr/docs/configuration)
- [How it works](https://0xsysr3ll.github.io/scroblarr/docs/how-it-works)
- [Architecture](https://0xsysr3ll.github.io/scroblarr/docs/architecture)
- [Troubleshooting](https://0xsysr3ll.github.io/scroblarr/docs/troubleshooting)

## Support

- Check the [documentation](https://0xsysr3ll.github.io/scroblarr/docs) first — your question might already be covered.
- [GitHub Issues](https://github.com/0xsysr3ll/scroblarr/issues) — bugs and feature requests.

## Testing

- Run all baseline tests from the repository root: `pnpm test`
- Run backend tests only: `pnpm --filter '@scroblarr/backend' test`
- Run frontend tests only: `pnpm --filter '@scroblarr/frontend' test`
- Place tests next to source files using `*.test.ts` / `*.test.tsx`
- For core-path changes (auth/session checks, API cache/state logic), add or update at least one focused test

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Trademarks

**Plex**, **Jellyfin**, **Trakt**, **TVTime**, **Simkl**, and other product names or logos used in this project are trademarks of their respective owners. Scroblarr is an independent open-source project and is not sponsored, endorsed, or affiliated with those services.

## License

See [LICENSE](LICENSE) in this repository.
