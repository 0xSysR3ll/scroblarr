---
sidebar_position: 1
---

# Architecture

Scroblarr is built as a monorepo using pnpm workspaces. This keeps everything organized and makes development easier.

## Package structure

### Backend (`packages/backend`)

The backend is an Express.js API server that handles:

- **Webhook endpoints**: Receives events from Plex and Jellyfin
- **Sync service**: Processes watch events and syncs to Trakt/TVTime
- **User management**: Handles authentication and user operations
- **Settings management**: Stores and retrieves configuration
- **Database**: Uses TypeORM for data persistence

**Tech stack:**

- Express.js for the API
- TypeORM for database management
- Pino for logging
- Puppeteer for TVTime authentication

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
4. **Integration clients** (Trakt/TVTime) sync the watch data
5. **Database** stores sync history
6. **Frontend** displays sync history and statistics

## API structure

The backend exposes a REST API at `/api/v1/`:

- `/api/v1/webhooks/*` - Webhook endpoints (public, secured with API key)
- `/api/v1/auth/*` - Authentication endpoints
- `/api/v1/users/*` - User management (admin only)
- `/api/v1/settings/*` - Settings management (admin only)
- `/api/v1/sync/*` - Sync history endpoints
- `/api/v1/trakt/*` - Trakt integration endpoints
- `/api/v1/tvtime/*` - TVTime integration endpoints

API documentation is available at `/api-docs` when running the server.

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
