---
sidebar_position: 5
---

# Simkl Configuration

Link your Simkl account to sync watch history. Each user on your media server needs to link their own Simkl account.

## Create a Simkl application

Before linking your account, create a Simkl application to get a Client ID:

1. Go to https://simkl.com/settings/developer/new/
2. Create a new application for Scroblarr
3. If Simkl asks for a **Redirect URI** or **Redirect URL**, enter `urn:ietf:wg:oauth:2.0:oob`
4. Copy the **Client ID** from the application settings

Scroblarr uses Simkl PIN authorization, so it does not receive an OAuth callback and does not require a client secret.

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the Simkl section, enter your Simkl Client ID
3. Click **Authorize**
4. A popup will open the Simkl PIN page, and Scroblarr will display a PIN code
5. Enter the PIN code on Simkl and approve access
6. Scroblarr will detect the approval automatically, or you can click **Check approval now**

Your Simkl account is now linked!

## Metadata requirements

Simkl matches watched items using the identifiers and metadata sent by Plex or Jellyfin:

- **Movies**: IMDb, TMDB, TVDB, title, and year can be used for matching. Matches are most reliable when at least one external ID is present.
- **TV Episodes**: TVDB episode IDs are preferred when available. If no TVDB episode ID is present, Scroblarr falls back to show title plus season and episode number.

If Simkl cannot match a media item, the sync history entry will show a Simkl error for that destination.

## What gets synced

Scroblarr syncs the following to Simkl:

- **Movies**: When you finish watching a movie
- **TV Episodes**: When you finish watching an episode
- **Watched time**: The webhook scrobble timestamp is sent as the watched time

Scroblarr does **not** sync:

- Ratings or reviews
- Watchlists
- Collections
- In-progress playback

## Unlinking your account

If you need to unlink your Simkl account:

1. Go to **Profile > Integrations**
2. Click **Unlink** in the Simkl section
3. Confirm the unlink

Your watch history will stop syncing to Simkl, but existing synced data remains on Simkl.

## Troubleshooting

If you're having trouble linking or syncing:

- Confirm the Client ID matches your Simkl developer application
- Generate a fresh PIN if the previous PIN expired
- Refresh metadata in Plex or Jellyfin if items fail to match
- Check the sync history and Settings → Logs for Simkl-specific errors
