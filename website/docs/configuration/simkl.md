---
sidebar_position: 5
---

# Simkl Configuration

Link your Simkl account to sync watch history. Each user on your media server needs to link their own Simkl account.

Scroblarr ships with an official Simkl application Client ID, so you do **not** need to create your own Simkl developer app or paste a Client ID. Scroblarr uses Simkl PIN authorization (no client secret or OAuth callback URL).

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the Simkl section, click **Authorize**
3. A popup will open the Simkl PIN page (with the code pre-filled when possible), and Scroblarr will display a PIN code
4. Approve access on Simkl
5. Scroblarr will detect the approval automatically, or you can click **Check approval now**

Your Simkl account is now linked!

## Reconnect (legacy links)

If you linked Simkl before Scroblarr shipped its official Client ID (or you are still on an older AUTH V1 token), Profile → Simkl may show a dismissible **Reconnect recommended** note. Your existing link keeps working until you reconnect.

Click **Reconnect** and complete the PIN flow once to move onto Scroblarr's official Simkl app. Dismiss hides the note for this browser; sync continues either way.

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

- Generate a fresh PIN if the previous PIN expired
- Allow popups so Scroblarr can open the Simkl PIN page
- If you previously used a personal Client ID, reconnect once with **Reconnect** (your old link still works until then)
- Refresh metadata in Plex or Jellyfin if items fail to match
- Check the sync history and Settings → Logs for Simkl-specific errors
