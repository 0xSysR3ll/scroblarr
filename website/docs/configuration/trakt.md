---
sidebar_position: 3
---

# Trakt Configuration

Link your Trakt account to sync watch history. Each user on your media server needs to link their own Trakt account (one Scroblarr user = one Trakt API app).

## Create a Trakt application

Before linking your account, you need to create a Trakt application to get OAuth credentials:

1. Go to https://app.trakt.tv/settings/apps/api
2. Click **+** in the top right to create a new API application
3. Fill in the details:
   - **Name**: Scroblarr (or any name you prefer)
   - **Description**: Optional description
   - **Redirect URI**: Should be exactly `urn:ietf:wg:oauth:2.0:oob`
4. Save and copy your **Client ID** and **Client Secret**

:::note
Trakt currently limits free accounts to **one API application**. VIP accounts can create more. If you already have an app, edit that one instead of creating another.
:::

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the Trakt section, enter your Trakt Client ID and Client Secret
3. Click **Authorize**
4. A popup opens Trakt's activation page. Enter the PIN code shown in Scroblarr
5. Approve the app on Trakt — Scroblarr polls automatically and finishes linking when approval succeeds

Your Trakt account is now linked!

## Automatic token refresh

Scroblarr automatically refreshes your Trakt OAuth tokens, so you shouldn't need to reconnect. Your tokens will be refreshed in the background to keep your account linked.

## What gets synced

Scroblarr syncs the following to Trakt:

- **Movies**: When you finish watching a movie
- **TV Episodes**: When you finish watching an episode
- **Progress**: Playback progress (if supported)

Scroblarr does **not** sync:

- Ratings or reviews
- Watchlists
- Collections

## Unlinking your account

If you need to unlink your Trakt account:

1. Go to **Profile > Integrations**
2. Click **Unlink** in the Trakt section
3. Confirm the unlink

Your watch history will stop syncing to Trakt, but existing synced data remains on Trakt.
