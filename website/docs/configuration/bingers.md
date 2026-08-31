---
sidebar_position: 6
---

# Bingers Configuration

Link your Bingers account to sync watch history. Each user on your media server needs to link their own Bingers account.

## Sign in with Bingers

Bingers uses email magic-link sign-in (no developer API app or Client ID). Linking opens Bingers in a popup; you paste the magic-link URL from your email back into Scroblarr.

:::note
Magic links are one-shot and expire in about **15 minutes**. If the link expires, request a new one from Bingers and paste the fresh URL.
:::

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the Bingers section, click **Open Bingers sign-in**
3. On [bingers.app/mobile-signin](https://bingers.app/mobile-signin), enter your email and complete the bot check
4. Open the email, copy the full magic-link URL (`https://bingers.app/m?token=…`)
5. Paste it into Scroblarr and click **Complete link**

Your Bingers account is now linked!

## Session

Bingers uses session cookies instead of OAuth refresh tokens. If the session expires or is revoked, Scroblarr will show **Re-authorize** in the Bingers section. You can stay signed in on the Bingers app and Scroblarr at the same time.

## Metadata requirements

Bingers matches watched items using the identifiers and metadata sent by Plex or Jellyfin:

- **Movies**: IMDb, TMDB, TVDB, title, and year can be used for matching. Matches are most reliable when at least one external ID is present.
- **TV Episodes**: TMDB series ID plus season and episode number are preferred. Title and year are used as a fallback when IDs are missing.

If Bingers cannot match a media item, the sync history entry will show a Bingers error for that destination.

## What gets synced

Scroblarr syncs the following to Bingers:

- **Movies**: When you finish watching a movie
- **TV Episodes**: When you finish watching an episode
- **Rewatches** (opt-in): When enabled in Profile → Integrations, watching the same title again increments the play count (shown in the Bingers app as “Watched x2”, etc.)

Scroblarr does **not** sync:

- Ratings or reviews
- Watchlists
- Collections
- In-progress playback
- Unwatch / remove from history

## Unlinking your account

If you need to unlink your Bingers account:

1. Go to **Profile > Integrations**
2. Click **Unlink** in the Bingers section
3. Confirm the unlink

Your watch history will stop syncing to Bingers, but existing synced data remains on Bingers. Unlinking does not log you out of the Bingers app.

## Troubleshooting

If you're having trouble linking or syncing:

- Request a fresh magic link if the previous one expired or was already used
- Paste the full URL from the email, including the `token` query parameter
- Re-authorize if Scroblarr shows the session as expired
- Refresh metadata in Plex or Jellyfin if items fail to match
- Check the sync history and Settings → Logs for Bingers-specific errors
