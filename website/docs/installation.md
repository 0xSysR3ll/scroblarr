---
sidebar_position: 1
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

## Requirements

You'll need:

- **Node.js 18+** and **pnpm** if you're building from source (the repo pins versions in `.node-version` and `package.json` — match those if something won't install)
- **Docker** only if you want the container image (no local Node toolchain)
- **SQLite** by default (nothing to install) or **PostgreSQL** if you prefer it
- At least one of **Plex** or **Jellyfin** so webhooks exist
- **Trakt** and/or **TVTime** accounts when you're ready to sync out (you can link those after install)

## Choose your installation method

<Tabs>
<TabItem value="docker" label="Docker (Recommended)" default>

Docker is the low-friction path: pull the image, map a port, keep a volume for data.

### Quick start with Docker

Example: run on port **3000**, store app data in a named volume **`scroblarr-data`**:

```bash
docker run -d \
  --name scroblarr \
  -p 3000:3000 \
  -v scroblarr-data:/app/data \
  ghcr.io/0xsysr3ll/scroblarr:latest
```

Then open **`http://localhost:3000`** (or `http://192.168.1.50:3000` from another machine on your LAN).

### Using Docker Compose

Example `compose.yml` — Scroblarr on **3000**, SQLite in the volume, optional Postgres block commented out:

```yaml
services:
  scroblarr:
    image: ghcr.io/0xsysr3ll/scroblarr:latest
    container_name: scroblarr
    ports:
      - "3000:3000"
    volumes:
      - scroblarr-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      # Optional: Use PostgreSQL instead of SQLite
      # - POSTGRES_HOST=postgres
      # - POSTGRES_PORT=5432
      # - POSTGRES_USER=scroblarr
      # - POSTGRES_PASSWORD=your_password
      # - POSTGRES_DATABASE=scroblarr
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/auth/check-admin || exit 1",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # Optional: PostgreSQL for production
  # postgres:
  #   image: postgres:18-alpine
  #   container_name: scroblarr-postgres
  #   environment:
  #     - POSTGRES_USER=scroblarr
  #     - POSTGRES_PASSWORD=your_password
  #     - POSTGRES_DB=scroblarr
  #   volumes:
  #     - postgres-data:/var/lib/postgresql/data
  #   restart: unless-stopped

volumes:
  scroblarr-data:
  # postgres-data:
```

Bring it up:

```bash
docker compose up -d
```

### Docker volumes

The **`scroblarr-data`** volume is where SQLite (if you use it), logs, and app data live — think of it as “everything you'd cry about losing.” Backup = snapshot or copy that volume.

### Environment variables

Examples of what you might actually set:

| Variable               | Example                                                 | What it's for                                                                                                                           |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                 | `3000`                                                  | HTTP port inside the container                                                                                                          |
| `DATA_DIR`             | _(default `/app/data` in the image)_                    | Where SQLite + logs + app files go                                                                                                      |
| `DATABASE_PATH`        | `/app/data/custom.db`                                   | Full path to a specific SQLite file                                                                                                     |
| `POSTGRES_*`           | host `postgres`, user `scroblarr`, …                    | Switch to Postgres instead of SQLite                                                                                                    |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com,https://scroblarr.example.com` | Only needed when the **browser** loads the UI from a different scheme/host/port than the API (see [Configuration](/docs/configuration)) |
| `PUBLIC_DIR`           | `/app/public`                                           | The image already ships the built UI here; you'd only change this for a custom build layout                                             |

### Updating Docker image

```bash
docker pull ghcr.io/0xsysr3ll/scroblarr:latest
docker compose down
docker compose up -d
```

With plain `docker run`, same idea: stop, remove, pull, run again — your **`scroblarr-data`** volume keeps the database.

### Next steps

1. Open the UI (e.g. **`http://localhost:3000`**)
2. Create the first admin user
3. Set an **API key** under **Settings → General** (webhooks won't work until this exists)
4. Add Plex/Jellyfin under **Settings → Media Server** — [Configuration](/docs/configuration) walks through it
5. Paste webhook URLs into Plex/Jellyfin and link Trakt/TVTime when you're ready

</TabItem>
<TabItem value="source" label="Build from source">

From a git checkout you can either **hack locally** (`pnpm dev`) or **run a built release** (`pnpm build` then `pnpm start`). Same codebase; pick the path that matches what you're doing today.

### 1. Clone and install

```bash
git clone https://github.com/0xsysr3ll/scroblarr.git
cd scroblarr
pnpm install
```

### 2. Database

**SQLite (default):** no extra services. On first run you'll get something like **`your-clone/data/db/scroblarr.db`** — that's normal.

**PostgreSQL:** set the usual suspects, for example:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DATABASE=scroblarr
POSTGRES_SSL=false
```

:::tip
If the DB doesn't exist yet, Scroblarr can create it on startup **if** the Postgres user can create databases (`CREATEDB`). Otherwise create `scroblarr` yourself once and you're good.
:::

### 3. Development (`pnpm dev`)

```bash
pnpm dev
```

That runs the API on **3000** and the Vite UI on **5173**. For day-to-day UI work, use **`http://localhost:5173`** — API calls like **`/api/v1/...`** get proxied to **`http://localhost:3000`**.

Split processes if you want:

```bash
pnpm dev:backend   # API on 3000
pnpm dev:frontend  # UI on 5173 (expects the API on 3000)
```

### 4. Built app (`pnpm build` + `pnpm start`)

Shippable build:

```bash
pnpm build
```

You'll end up with compiled backend under **`packages/backend/dist/`** and the static site under **`packages/frontend/dist/`**.

**Env example** (root `.env` or your process manager) — mix and match; comment out what you don't need:

```bash
NODE_ENV=production
PORT=3000

# Optional: move all data off the repo tree
# DATA_DIR=/var/lib/scroblarr

# Optional: Postgres instead of SQLite
# POSTGRES_HOST=localhost
# POSTGRES_USER=scroblarr
# POSTGRES_PASSWORD=supersecret
# POSTGRES_DATABASE=scroblarr

# Example: UI is https://app.example.com but API is https://api.example.com
# CORS_ALLOWED_ORIGINS=https://app.example.com
```

If you **do** set `DATA_DIR` to something like **`/var/lib/scroblarr`**, create it first:

```bash
sudo mkdir -p /var/lib/scroblarr/{db,logs}
sudo chown -R "$USER:$USER" /var/lib/scroblarr
```

Start from the **repo root** after a successful build:

```bash
pnpm start
```

That's the same idea as production: one Node process on **`PORT`** (default **3000**) serves **both** the API and the built UI. If you skipped `pnpm build` or the frontend dist is missing, you'll still get the API — you just won't have the web UI until the build exists.

### 5. Reverse proxy and CORS

Typical home-lab setup: Caddy/nginx terminates **`https://scroblarr.example.com`** and reverse-proxies to **`http://127.0.0.1:3000`**.

CORS only bites when the **address in the browser's address bar** doesn't match where the API lives. Example: UI at **`https://scroblarr.example.com`** but you mistakenly pointed API calls at **`http://localhost:3000`** — set **`CORS_ALLOWED_ORIGINS`** to the real UI origin(s). Details: [Configuration](/docs/configuration).

### Next steps

1. Open the UI — **`http://localhost:5173`** if you're on **`pnpm dev`** (Vite + proxied API), or **`http://localhost:3000`** after **`pnpm start`** (built UI + API on one port)
2. Create the first admin user
3. Set an **API key** under **Settings → General** (webhooks won't work until this exists)
4. Add Plex/Jellyfin under **Settings → Media Server** — [Configuration](/docs/configuration) walks through it
5. Paste webhook URLs into Plex/Jellyfin and link Trakt/TVTime when you're ready

### Updates, logs, backups

#### Updates

**From source** (run these in your clone, same folder as `package.json`):

```bash
git pull
pnpm install
pnpm build
```

Then restart however you run the app in production — for example stop **`pnpm start`** and run it again, or `systemctl restart scroblarr` if you wrapped it in systemd. If you use Docker instead, pull and recreate the container so it picks up the new image (same flow as [Updating Docker image](#updating-docker-image) above).

#### Logs

Scroblarr writes rotating log files under **`<data-dir>/logs`**, where **`<data-dir>`** is:

- **`DATA_DIR`** if you set that env var, otherwise
- **`./data`** next to the repo root when you run from a checkout (so a typical path is **`/home/you/scroblarr/data/logs/`**).

Inside the default Docker layout, that's **`/app/data/logs`** on the volume you mounted.

You can also open **Settings → Logs** in the web UI to read the same files through the API.

#### Backups

**SQLite — default checkout**

Database file: **`<data-dir>/db/scroblarr.db`**. With no `DATA_DIR` / `DATABASE_PATH`, that's usually:

```text
/path/to/your/scroblarr-clone/data/db/scroblarr.db
```

Copy it while Scroblarr is stopped (or accept a tiny risk of a partial copy if it's idle):

```bash
cp /path/to/your/scroblarr-clone/data/db/scroblarr.db \
  ~/backups/scroblarr-$(date +%F).db
```

If you set **`DATABASE_PATH`**, back up that exact file instead.

**SQLite — Docker**

Your DB lives in the named volume (e.g. under **`/app/data/db/scroblarr.db`** inside the container). Easiest options: back up the whole Docker volume your stack uses, or `docker cp` the file out, e.g.:

```bash
docker cp scroblarr:/app/data/db/scroblarr.db ./scroblarr-$(date +%F).db
```

**PostgreSQL**

Dump the database you configured (adjust host, user, and DB name to match your env):

```bash
pg_dump -h localhost -p 5432 -U scroblarr -d scroblarr -F c \
  -f ~/backups/scroblarr-$(date +%F).dump
```

Restore is the matching **`pg_restore`** (or plain SQL if you used `-F p`).

---

Listen port defaults to **3000** unless you set **`PORT`**.

</TabItem>
</Tabs>
