---
sidebar_position: 2
---

# Jellyfin Configuration

Configure Jellyfin as a source for Scroblarr. This involves setting up the Jellyfin server connection and configuring webhooks.

## Server setup

1. Go to **Settings > Media Server** in the Scroblarr web interface
2. Enter your Jellyfin server details:
   - **Host**: Your Jellyfin server address (e.g., `192.168.1.100` or `jellyfin.example.com`)
   - **Port**: Usually `8096` for HTTP or `8920` for HTTPS
   - **Use SSL**: Check if your Jellyfin server uses HTTPS
   - **URL Base**: Leave empty unless you have a custom path (like `/jellyfin`)
   - **API Key**: Get this from Jellyfin Dashboard > **Advanced > API Keys**
3. Click **Save**

## Webhook configuration

After configuring the server, you need to set up webhooks so Jellyfin sends watch events to Scroblarr.

:::warning
Jellyfin requires the [Webhooks plugin](https://github.com/jellyfin/jellyfin-plugin-webhook) to be installed. If you don't see the Webhooks option in Plugins, you'll need to install it first from the Plugins catalog.
:::

:::warning API key required
Scroblarr **rejects** Jellyfin webhooks unless an API key is set under **Settings → General** and each request sends that same key via the **`X-API-Key`** header or an **`apiKey`** field in the JSON body (the server strips `apiKey` from the payload before parsing the event).
:::

1. In Scroblarr, open **Settings → General**, generate or set an **API key**, and save.
2. Open your Jellyfin Dashboard
3. Go to **Plugins > Webhooks** (install the plugin if needed)
4. Add a new webhook with the URL:

   ```
   http://your-scroblarr-url/api/v1/webhooks/jellyfin
   ```

   Replace `your-scroblarr-url` with your actual Scroblarr URL (same format as Plex)

5. **Authenticate the webhook** using one of these methods:

   **Option 1: Header (recommended)**
   - Add a custom header (for example **Add Request Header** in the plugin UI):
     - Header name: `X-API-Key`
     - Header value: your API key from **Settings → General**

   **Option 2: JSON payload**
   - In the webhook template or custom fields, include a top-level field: `"apiKey": "your_key_here"` so the raw JSON body contains the same key as in Scroblarr.

6. Enable the webhook

:::tip Docker users
Same considerations as Plex - make sure Jellyfin can reach your Scroblarr container. Use host IP addresses or Docker networking as needed.
:::

## Verification

Once configured, Jellyfin will send watch events to Scroblarr automatically. You can verify it's working by:

1. Watching something on Jellyfin
2. Checking the Scroblarr Dashboard - you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
