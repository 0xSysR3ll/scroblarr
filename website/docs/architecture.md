---
sidebar_position: 1
---

# Architecture

Scroblarr is built as a monorepo using pnpm workspaces. This keeps everything organized and makes development easier.

## Package structure

### Backend (`packages/backend`)

The backend is an Express.js API server that handles:

- **Webhook endpoints**: Receives events from Plex and Jellyfin
- **Sync service**: Processes watch events and syncs to Trakt and Simkl
- **User management**: Handles authentication and user operations
- **Settings management**: Stores and retrieves configuration
- **Database**: TypeORM with SQLite or PostgreSQL; migrations run automatically on startup
- **Sessions**: Multiple sessions per user (you can stay logged in on several devices at once)

**Tech stack:**

- Express.js for the API
- TypeORM for database management
- Pino for logging

**Database support:**

- SQLite (default, for development)
- PostgreSQL (for production)

### Frontend (`packages/frontend`)

A React-based web interface built with:

- **React + TypeScript**: Modern UI framework
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **React Router**: Client-side routing
- **i18next**: Internationalization support

The frontend communicates with the backend via REST API calls.

### Shared (`packages/shared`)

Common code used by both frontend and backend:

- **Types**: Shared TypeScript interfaces and types
- **Utilities**: Helper functions used across packages

This ensures type safety between frontend and backend.

## Data flow

1. **Media server** (Plex/Jellyfin) sends webhook to **Backend webhook endpoint**
2. **Webhook parser** extracts watch event data
3. **Sync service** matches event to user and destination accounts
4. **Integration clients** (Trakt/Simkl) sync the watch data
5. **Database** stores sync history
6. **Frontend** displays sync history and statistics

## API structure

The backend exposes a REST API at `/api/v1/`:

- `/api/v1/webhooks/*` - Plex and Jellyfin webhooks (no session; **require** the webhook API key from Settings → General, per [Configuration](/docs/configuration))
- `/api/v1/auth/*` - Sign-in, registration, OAuth callbacks, session checks
- `/api/v1/logout` - End the current session
- `/api/v1/users/*` - User management (admin)
- `/api/v1/settings/*` - Application settings (admin)
- `/api/v1/sync/*` - Sync history (authenticated users)
- `/api/v1/trakt/*` - Trakt OAuth and linking
- `/api/v1/simkl/*` - Simkl PIN linking and profile helpers
- `/api/v1/logs/*` - Structured application logs (**admin**)
- `/api/v1/avatars/*` - User avatar proxy/fetch helpers
- `/api/v1/meta/*` - Build/version metadata (e.g. `/version` for health and diagnostics)

**Interactive use:** the web UI relies on **cookie-based sessions** after login. **Automation:** use the OpenAPI description at **`/api-docs`** (and the served **`openapi.json`**) for exact paths, request bodies, and which operations accept session cookies vs other auth. A `Bearer` token is accepted only if it is a Scroblarr session token, not a Plex or Jellyfin access token. Do not expose your webhook API key in client-side code.

## API documentation

- **On a running instance:** Swagger UI is at **`/api-docs`** (same origin as the app in the usual single-host layout). Use it for live “try it” calls against your server.

- **On this documentation site:** the [REST API](/docs/api/scroblarr-api) section is generated from **`packages/backend/openapi.yaml`** when the site is built (`pnpm gen-api-docs` in `website/`). It mirrors the spec with examples and grouped operations.

## Development

To work on Scroblarr:

```bash
# Install dependencies
pnpm install

# Run everything in dev mode
pnpm dev

# Or run packages separately
pnpm dev:backend   # Backend only
pnpm dev:frontend  # Frontend only
```

The backend runs on port 3000, frontend on port 5173 (in dev mode). In production, the frontend is built and served by the backend.
