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

## Webhook configuration

After configuring the server, you need to set up webhooks so Plex sends watch events to Scroblarr.

:::warning Plex Pass required
Plex webhooks are only available to users with an active **Plex Pass** subscription. If you don't have Plex Pass, you won't see the Webhooks option in your Plex Media Server settings. You'll need to subscribe to Plex Pass to use webhook-based syncing with Scroblarr.
:::

:::tip API key (optional)
Adding an API key to your webhook URL provides additional security. If you don't include an API key, the webhook will still work, but it's recommended to use one for production deployments.
:::

1. Open your Plex Media Server settings
2. Go to **Settings > Webhooks**
3. Click **Add Webhook**
4. Enter your Scroblarr webhook URL:

   **With API key (recommended):**

   ```
   http://your-scroblarr-url/api/v1/webhooks/plex?apiKey=sk_your_api_key_here
   ```

   **Without API key:**

   ```
   http://your-scroblarr-url/api/v1/webhooks/plex
   ```

   Replace:
   - `your-scroblarr-url` with your actual Scroblarr URL:
     - If running locally: `http://localhost:3000` or `http://192.168.1.100:3000`
     - If using Docker on the same machine: `http://host.docker.internal:3000` (from Plex container) or your host IP
     - If using a reverse proxy: `https://scroblarr.example.com`
   - `sk_your_api_key_here` with your actual API key from Scroblarr (Settings > General)

5. Save

:::tip Docker users
If Plex is also running in Docker, you might need to use your host machine's IP address or set up Docker networking so containers can communicate. If Plex is on a different machine, use that machine's IP address or domain name.
:::

## Verification

Once configured, Plex will send watch events to Scroblarr automatically. You can verify it's working by:

1. Watching something on Plex
2. Checking the Scroblarr Dashboard - you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
