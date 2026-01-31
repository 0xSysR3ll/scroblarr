---
sidebar_position: 1
slug: /
---

# Welcome to Scroblarr

Scroblarr automatically syncs your watch history from Plex and Jellyfin to Trakt and TVTime. No manual logging required—just watch and sync.

## Quick Start

1. **[Install Scroblarr](/docs/installation)** - Choose Docker or manual installation
2. **[Configure your setup](/docs/configuration)** - Connect your media servers and link accounts
3. **Start watching** - Scroblarr handles the rest automatically

## What is Scroblarr?

Scroblarr is a self-hosted service that bridges the gap between your media servers and tracking services. When you watch content on Plex or Jellyfin, Scroblarr receives webhook notifications and automatically syncs that watch data to your Trakt and TVTime accounts.

## Key Features

- **🔄 Automatic syncing** - Real-time webhook-based syncing, no manual intervention
- **👥 Multi-user support** - Each user syncs independently to their own accounts
- **🔒 Self-hosted** - Your data stays on your server
- **🌐 Web interface** - Easy configuration and monitoring
- **📊 Sync history** - Track all syncs with detailed statistics
- **🔌 REST API** - Automate and integrate with other tools

## How It Works

Scroblarr sits between your media servers and tracking services:

```
Plex/Jellyfin -> Webhook -> Scroblarr -> Trakt/TVTime
```

1. You watch content on Plex or Jellyfin
2. Your media server sends a webhook to Scroblarr
3. Scroblarr processes the event and syncs to your linked accounts
4. Your watch history is updated everywhere

Learn more in the [How it works](/docs/how-it-works) guide.

## Documentation

- **[Installation](/docs/installation)** - Get Scroblarr up and running
- **[Configuration](/docs/configuration)** - Set up media servers and link accounts
- **[How it works](/docs/how-it-works)** - Understand the sync process
- **[Architecture](/docs/architecture)** - Technical details and development
- **[Troubleshooting](/docs/troubleshooting)** - Common issues and solutions

## Need Help?

- Check the [Troubleshooting](/docs/troubleshooting) guide
- Open an issue on [GitHub](https://github.com/0xsysr3ll/scroblarr)
