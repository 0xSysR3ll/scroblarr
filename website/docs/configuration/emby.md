---
sidebar_position: 3
---

# Emby Configuration

Configure Emby as a source for Scroblarr. This involves setting up the Emby server connection and configuring webhooks.

## Server setup

1. Go to **Settings > Media Server** in the Scroblarr web interface
2. Enter your Emby server details:
   - **Host**: Your Emby server address (e.g., `192.168.1.100` or `emby.example.com`)
   - **Port**: Usually `8096` for HTTP or `8920` for HTTPS
   - **Use SSL**: Check if your Emby server uses HTTPS
   - **URL Base**: Leave empty unless you have a custom path
   - **API Key**: Get this from Emby Dashboard → **Advanced → Security** (or log in during setup to generate one)
3. Click **Save**

## Webhook configuration

After configuring the server, you need to set up webhooks so Emby sends watch events to Scroblarr.

:::info Prerequisite
Emby webhooks require an **Emby Premiere** subscription. Without Premiere, Emby cannot send watch events to Scroblarr.
:::

:::warning
Emby webhooks are configured under **your user notification preferences** (Notifications), not a server-level Webhooks page like Plex.
:::

:::warning API key required
Scroblarr **rejects** Emby webhooks unless a **webhook API key** is set under **Settings → General** and the same value is passed in the webhook URL query string. Emby often cannot send custom headers, so the key must appear as `?apiKey=...` (see below). This is separate from the admin API key.
:::

### 1. Set the Scroblarr webhook API key

In Scroblarr, open **Settings → General**, generate or set a **Webhook API key**, and save.

### 2. Add a Webhook notification in Emby

1. Open **Settings → Media Server → Emby → Webhooks** in Scroblarr and copy the webhook URL
2. In Emby, open **your user → notification preferences**
3. Add a **Webhook** notification and paste the URL (it includes `?apiKey=`):

   ```text
   YOUR_SCROBLARR_ORIGIN/api/v1/webhooks/emby?apiKey=sk_your_webhook_api_key_here
   ```

   Replace placeholders the same way as [Plex](/docs/configuration/plex).

4. Enable playback **start** / **stop** for **movies** and **episodes**
5. Optionally set **Limit user events to** the Emby accounts that should scrobble
6. Save

:::tip Docker users
Same considerations as Plex — make sure Emby can reach your Scroblarr container. Use host IP addresses or Docker networking as needed.
:::

## What Scroblarr does with events

| Emby event                                                 | Result in Scroblarr             |
| ---------------------------------------------------------- | ------------------------------- |
| `playback.start`                                           | Mark as playing                 |
| `playback.stop` + completed (≥90% or `PlayedToCompletion`) | Scrobble to linked destinations |
| `playback.stop` + not completed                            | Stopped (no scrobble)           |
| Other types / non-movie-or-episode                         | Ignored (`Event not supported`) |

Users are matched by Emby **user id** (`User.Id` in the payload) to the linked Scroblarr account.

## Verification

Once configured, Emby will send watch events to Scroblarr automatically. You can verify it's working by:

1. Watching something on Emby (start and finish, or stop past ~90%)
2. Checking the Scroblarr Dashboard — you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
