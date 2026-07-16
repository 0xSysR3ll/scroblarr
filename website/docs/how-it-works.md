---
sidebar_position: 1
---

# How it works

Scroblarr sits between your media servers and tracking services, automatically syncing watch history in real-time.

## The flow

1. **You watch something** on Plex or Jellyfin
2. **Your media server sends a webhook** to Scroblarr when a **scrobble** (completed watch) event is emitted
3. **Scroblarr processes the event** and matches it to the correct user
4. **Scroblarr syncs to your linked accounts** (Trakt, Simkl) automatically
5. **Your watch history is updated** on all platforms

All of this happens in the background—no manual logging or button clicking required.

## Supported sources

### Plex

Scroblarr listens for Plex webhook events. When you watch a movie or episode, Plex sends a notification to Scroblarr with details about what you watched, when, and which user account.

### Jellyfin

Similar to Plex, Jellyfin sends webhook events when content is played. Scroblarr parses these events and extracts the watch information.

Both sources can be configured simultaneously. If you have both Plex and Jellyfin, Scroblarr will sync watch history from both.

## Supported destinations

### Trakt

Scroblarr uses Trakt's API to mark content as watched. It supports:

- Movies
- TV show episodes
- Automatic progress tracking

Trakt uses OAuth for authentication, and Scroblarr automatically refreshes tokens so you don't need to reconnect.

### Simkl

Scroblarr uses Simkl's history sync API to mark movies and TV episodes as watched. Simkl uses PIN authorization, so users approve Scroblarr from Simkl's PIN page without entering a password in Scroblarr.

## Multi-user support

One of Scroblarr's key features is multi-user support. Here's how it works:

- **Each user on your media server** can link their own Trakt and/or Simkl accounts
- **Watch history syncs independently** - your Plex user syncs to your Trakt, someone else's Plex user syncs to their Trakt
- **Admins can manage everything** from the web interface
- **Users can manage their own accounts** from their profile page

This makes Scroblarr perfect for families or shared media servers where everyone wants their own tracking accounts.

## What gets synced

Scroblarr turns **scrobble** events into watched state for **movies** and **TV episodes**, using the metadata your media server sends (titles, IDs, season/episode, etc.). Destination-specific behavior is documented under **[Trakt](/docs/configuration/trakt#what-gets-synced)** and **[Simkl](/docs/configuration/simkl#what-gets-synced)**.

Scroblarr does **not** sync in-progress plays, ratings, watchlists, or collections—only completed-style webhook events.

## Real-time vs batch

Scroblarr processes webhooks in real-time. When your media server sends a webhook, Scroblarr immediately processes it and syncs to your destination services. There's no delay or batch processing—your watch history stays up to date.

If a sync fails (network issue, API error, etc.), Scroblarr logs the error and you can see it in the sync history. The webhook was still received, so you won't lose the watch event.
