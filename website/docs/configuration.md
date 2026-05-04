---
sidebar_position: 2
---

# Configuration

Once Scroblarr is installed, you'll need to configure your media servers and link your destination accounts. This guide provides an overview and links to detailed setup instructions for each service.

## Quick overview

Scroblarr needs two types of configuration:

1. **Media servers** (sources) - Where your watch history comes from
   - [Plex](/docs/configuration/plex) - Configure Plex server and webhooks
   - [Jellyfin](/docs/configuration/jellyfin) - Configure Jellyfin server and webhooks

2. **Destination services** - Where your watch history syncs to
   - [Trakt](/docs/configuration/trakt) - Link your Trakt account
   - [TVTime](/docs/configuration/tvtime) - Link your TVTime account

## General settings

In **Settings > General**, you can configure:

- **API Key**: Required for **webhook** authentication (Plex query string; Jellyfin header or JSON field). Also used where the app expects an API key for programmatic access. Generate or set a key before configuring Plex/Jellyfin webhooks, or deliveries will fail with **503** / **401**.
- **Sync History Limit**: How many sync history entries to keep (default: 1000)

:::warning
Keep your API key secret! Anyone with the key can call webhook endpoints as if they were your media servers. Don't share it publicly or commit it to version control.
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
3. Check your Trakt/TVTime account - the watch should be synced there too

If something's not working, check the **Logs** page in Settings for error messages.

## Reverse proxy and separate UI origins

In **production**, if you open the Scroblarr UI from an origin that is **not** the same scheme/host/port as the API (for example static files on a CDN or a different subdomain), the browser will block API calls unless you set **`CORS_ALLOWED_ORIGINS`** to a comma-separated list of those exact origins (including `https://` and no trailing slash on the host unless your app actually uses one).

The backend also honors **`PUBLIC_DIR`** when you need to point at a non-default directory of built frontend files. See [Installation](/docs/installation) (environment variables) for both.
