---
sidebar_position: 2
---

# Configuration

Once Scroblarr is installed, you'll need to configure your media servers and link your destination accounts. This guide provides an overview and links to detailed setup instructions for each service.

## Quick overview

Scroblarr needs two types of configuration:

1. **Media servers** (sources) - Where your watch history comes from
   - [Plex](/docs/configuration/plex) - Configure Plex server and webhooks (or Tautulli if you don't have Plex Pass)
   - [Jellyfin](/docs/configuration/jellyfin) - Configure Jellyfin server and webhooks

2. **Destination services** - Where your watch history syncs to
   - [Trakt](/docs/configuration/trakt) - Link your Trakt account
   - [Simkl](/docs/configuration/simkl) - Link your Simkl account

## General settings

In **Settings > General**, you can configure:

- **API Key**: Used for programmatic API access via the `X-API-Key` header.
- **Webhook API Key**: Required for **webhook** authentication (Plex query string; Tautulli header, JSON field, or `?apiKey=` query string; Jellyfin header or JSON field). Generate or set a key before configuring Plex/Tautulli/Jellyfin webhooks, or deliveries will fail with **503** / **401**.
- **Sync History Limit**: How many sync history entries to keep (default: 1000)

:::warning
Keep your API keys secret! Don't share them publicly or commit them to version control.
:::

## User management

As an admin, you can manage users in the **Users** page:

- **Import users**: Automatically import all users from your configured media servers
- **Enable/disable users**: Control which users can sync
- **View linked accounts**: See which destination accounts each user has linked

Users can manage their own account linking in the **Profile** section, but admins can see everything.

## Testing your setup

After configuring everything, test it:

1. Watch something on Plex or Jellyfin
2. Check the **Dashboard** in Scroblarr - you should see the sync appear
3. Check your linked destination accounts - the watch should be synced there too

If something's not working, check the **Logs** page in Settings for error messages.

## Reverse proxy and separate UI origins

### CORS and `PUBLIC_DIR`

In **production**, if you open the Scroblarr UI from an origin that is **not** the same scheme/host/port as the API (for example static files on a CDN or a different subdomain), the browser will block API calls unless you set **`CORS_ALLOWED_ORIGINS`** to a comma-separated list of those exact origins (including `https://` and no trailing slash on the host unless your app actually uses one).

The backend also honors **`PUBLIC_DIR`** when you need to point at a non-default directory of built frontend files. See [Installation](/docs/installation) (environment variables) for both.

### Trust proxy (`TRUST_PROXY`) {#trust-proxy}

When Scroblarr sits **behind a reverse proxy** (Caddy, nginx, Traefik, Kubernetes ingress, Cloudflare Tunnel, etc.), the proxy usually adds **`X-Forwarded-For`** (and related headers). The API uses **express-rate-limit**, which expects Express's **`trust proxy`** setting to match reality: if those headers are present but trust proxy is off, you can see validation errors and incorrect client IPs for rate limiting.

**Default behavior**

- **`NODE_ENV=production`:** Express is configured to **`trust proxy` = `1`** (trust **one** hop — the proxy directly in front of Node). You usually do **not** need to set anything.
- **Development / non-production:** Trust proxy stays **off** unless you opt in (see below).

**Override with `TRUST_PROXY`**

| Value                   | Effect                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _(unset in production)_ | Trust **one** proxy hop (`trust proxy` = `1`).                                                                                                                                 |
| `true`, `1`, or `yes`   | Same as above, but also applies when **`NODE_ENV`** is not production (e.g. local dev behind a tunnel that sends `X-Forwarded-For`).                                           |
| `false`, `0`, or `no`   | Do **not** enable trust proxy, even in production. Use this only if Node listens on the public internet **without** a reverse proxy and you want the default Express behavior. |

If you chain **multiple** proxies (e.g. CDN → ingress → app), one hop may not be enough for accurate IPs everywhere; for typical homelab setups (single reverse proxy → Scroblarr), the default is appropriate.
