---
sidebar_position: 1
---

# Plex Configuration

Configure Plex as a source for Scroblarr. This involves setting up the Plex server connection and configuring webhooks.

## Server setup

1. Go to **Settings > Media Server** in the Scroblarr web interface
2. Click **Authenticate with Plex**
3. A popup will open asking you to sign in to Plex. After signing in, Scroblarr will fetch your available servers
4. Select the Plex server you want to use from the dropdown
5. Click **Save**

When you save, Scroblarr stores your chosen server's **machine identifier** (Plex's `machineIdentifier` / webhook `Server.uuid`) when Plex provides it.

### Connection list behavior

Scroblarr merges Plex-discovered HTTP and HTTPS connections, then keeps a compact, prioritized list to avoid showing too many duplicate URLs.

- Local connections are prioritized for self-hosted and Docker setups.
- Each connection now shows a **Reachable** or **Unreachable** badge based on a quick connection check.
- If discovery does not produce a usable URL for your network, you can set a **Manual Connection URL** (for example `http://192.168.x.x:32400`) and save it.

### Server identity and webhooks

If a machine identifier is stored, Scroblarr **rejects** Plex webhooks whose payload `Server.uuid` does not match that value (**401** / `Invalid server identity`). That prevents another Plex server from posting to your webhook URL if your API key were ever exposed.

**What you should do:**

- Always **Save** after picking the server you actually watch from (so the stored identifier matches that server).
- If you **move** watch activity to a different Plex server, open **Settings → Media Server**, select the new server, and **Save** again.
- If webhooks suddenly return 401 and logs mention server identity, confirm Plex is the same server you configured—not a friend's or a test instance hitting the same URL.

## Webhook configuration

After configuring the server, you need to set up webhooks so Plex sends watch events to Scroblarr.

:::warning Plex Pass required
Plex webhooks are only available to users with an active **Plex Pass** subscription. If you don't have Plex Pass, you won't see the Webhooks option in your Plex Media Server settings. You'll need to subscribe to Plex Pass to use webhook-based syncing with Scroblarr.
:::

:::warning API key required
Scroblarr **rejects** Plex webhooks unless an API key is set under **Settings → General** and the same value is passed in the webhook URL query string. Plex cannot send custom headers, so the key must appear as `?apiKey=...` (see below).
:::

1. In Scroblarr, open **Settings → General**, generate or set an **API key**, and save.
2. Open your Plex Media Server settings
3. Go to **Settings > Webhooks**
4. Click **Add Webhook**
5. Enter your Scroblarr webhook URL (replace placeholders):

   ```
   http://your-scroblarr-url/api/v1/webhooks/plex?apiKey=sk_your_api_key_here
   ```

   Replace:
   - `your-scroblarr-url` with your actual Scroblarr URL:
     - If running locally: `http://localhost:3000` or `http://192.168.1.100:3000`
     - If using Docker on the same machine: `http://host.docker.internal:3000` (from Plex container) or your host IP
     - If using a reverse proxy: `https://scroblarr.example.com`
   - `sk_your_api_key_here` with the **exact** API key from **Settings → General** (URL-encode if your key contains special characters)

6. Save

:::tip Docker users
If Plex is also running in Docker, you might need to use your host machine's IP address or set up Docker networking so containers can communicate. If Plex is on a different machine, use that machine's IP address or domain name.
:::

## Verification

Once configured, Plex will send watch events to Scroblarr automatically. You can verify it's working by:

1. Watching something on Plex
2. Checking the Scroblarr Dashboard - you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
