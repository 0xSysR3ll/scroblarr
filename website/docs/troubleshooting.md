---
sidebar_position: 6
---

# Troubleshooting

Having issues? Here are some common problems and how to fix them.

## Webhooks not working

### Plex webhooks not received

- **Set a webhook API key in Scroblarr first**: Under **Settings → General**, without a stored webhook API key, webhooks return **503** (`Webhook authentication not ready`).
- **Check the webhook URL**: It must include your webhook key as a query parameter, e.g. `http://your-url/api/v1/webhooks/plex?apiKey=your_webhook_key` (Plex cannot send `X-API-Key` headers).
- **Check the key matches**: The `apiKey` query value must exactly match **Settings → General → Webhook API Key** (copy-paste; watch for trailing spaces or URL encoding issues).
- **Check Plex Pass**: Native Plex webhooks require an active Plex Pass subscription. Without Plex Pass, use [Tautulli](/docs/configuration/plex#tautulli-no-plex-pass) instead.
- **Check network access**: Plex must be able to reach your Scroblarr URL (firewall, Docker networking, HTTPS vs HTTP). Webhooks are **POST** requests with a body; opening the URL in a browser (GET) is not a reliable test of delivery—use Plex webhook logs and Scroblarr logs instead.
- **Check Plex logs**: Plex logs will show if webhook delivery failed
- **Check Scroblarr logs**: Go to Settings → Logs and look for webhook-related errors

### Plex webhooks return 401 "Invalid server identity"

Scroblarr compares the webhook JSON `Server.uuid` to the machine identifier saved when you last saved your Plex server in **Settings → Media Server**.

- **Re-save your Plex server**: Pick the correct server from the list and click **Save** so the stored identifier matches the server that sends webhooks.
- **One server per Scroblarr URL**: Webhooks must come from that same Plex Media Server instance, not a different server using the same Scroblarr URL and key.

### Tautulli notifications not received

- **Use Tautulli if you don't have Plex Pass**: Native Plex webhooks need Plex Pass. Tautulli is the free alternative — see [Plex configuration](/docs/configuration/plex#tautulli-no-plex-pass).
- **Set a webhook API key in Scroblarr first**: Under **Settings → General**, without a stored webhook API key, webhooks return **503** (`Webhook authentication not ready`).
- **Check the webhook URL**: Should be `http://your-url/api/v1/webhooks/tautulli` on a Tautulli **Webhook** notification agent, method **POST**.
- **Enable the Watched trigger**: Scroblarr only syncs Tautulli's `watched` action. Playback Start/Stop are optional.
- **JSON headers**: Paste `Content-Type: application/json` and `X-API-Key` (your webhook API key) into Tautulli's **JSON Headers**. Missing or wrong keys return **401**.
- **JSON data**: Paste the template from [Plex configuration](/docs/configuration/plex#tautulli-no-plex-pass) into **JSON Data** for each enabled trigger. Quote every value so blank Tautulli parameters stay valid JSON.
- **User matching**: `{username}` (preferred) or `{user}` must match the Plex username of a Scroblarr user.
- **Server identity**: If a Plex machine identifier is saved, `{server_machine_id}` must match or Scroblarr returns **401** (`Invalid server identity`).
- **Check Tautulli logs**: Notification Agents → the webhook agent → test/logs will show delivery failures.
- **Check Scroblarr logs**: Settings → Logs — look for rejected auth or unsupported events.

### Jellyfin webhooks not received

- **Install the Webhooks plugin**: Jellyfin requires a plugin for webhooks. Install it from the Plugins section, then restart Jellyfin
- **Set a webhook API key in Scroblarr first**: Under **Settings → General**, without a stored webhook API key, webhooks return **503** (`Webhook authentication not ready`).
- **Check the webhook URL**: Should be `http://your-url/api/v1/webhooks/jellyfin` on a **Generic** destination
- **Checkboxes**: Enable **Playback Start** and **Playback Stop** only; enable **Movies** and **Episodes** item types; leave **Send All Properties** unchecked
- **Template + Content-Type**: Paste the Handlebars template from [Jellyfin Configuration](/docs/configuration/jellyfin). Prefer a `Content-Type: application/json` request header (the plugin defaults to `text/plain`; Scroblarr still accepts JSON in that case)
- **Send the webhook API key on every request**: Use the `X-API-Key` header or include `"apiKey": "..."` in the JSON body; it must exactly match **Settings → General → Webhook API Key**. Missing or wrong keys return **401**.
- **Check Jellyfin logs**: Look for webhook delivery errors; enable `Jellyfin.Plugin.Webhook` debug logging if needed
- **Check Scroblarr logs**: Settings → Logs — look for rejected auth or empty/invalid payload errors

## Syncs not appearing

### Watch history not syncing to Trakt or Simkl

- **Check account linking**: Go to Profile → Integrations and verify your accounts are linked
- **Check user matching**: Make sure the Plex/Jellyfin username matches the user in Scroblarr
- **Check sync history**: Go to Dashboard and see if syncs are appearing there (even if they failed)
- **Check error messages**: Failed syncs will show error messages in the sync history
- **Check logs**: Settings → Logs will have detailed error information

### Syncs failing with authentication errors

- **Trakt**: Your OAuth token might have expired. Try unlinking and re-linking your Trakt account
- **Simkl**: Your access token or Client ID might be invalid. Try unlinking and re-linking your Simkl account with the Client ID from your Simkl developer app.
- **Trakt OAuth app**: Confirm your **Trakt Client ID** and **Client Secret** (from [app.trakt.tv/settings/apps/api](https://app.trakt.tv/settings/apps/api)) match what you entered in Scroblarr—these are not the same as the Scroblarr **Settings → General** webhook API key.

### Simkl sync fails with "could not match" or missing metadata

Simkl matches items using external IDs and titles from Plex or Jellyfin. If sync history says Simkl could not match a media item:

- **Refresh metadata** for the movie or show in Plex or Jellyfin.
- **Episodes**: Prefer metadata that includes a TVDB episode ID. Without one, Scroblarr falls back to show title plus season and episode number.
- **Movies**: Confirm the item has IMDb, TMDB, TVDB, or accurate title/year metadata.

See [Simkl configuration](/docs/configuration/simkl#metadata-requirements) for details.

## User import issues

### Users not showing up after import

- **Check media server connection**: Make sure Plex/Jellyfin is properly configured in Settings
- **Check authentication**: For Plex, make sure you've authenticated and selected a server
- **Check reachability badge**: In **Settings -> Media Server**, prefer a Plex connection marked **Reachable**. Connections marked **Unreachable** are visible but may timeout from your current network/container.
- **Use manual Plex URL if needed**: If all discovered endpoints are unreachable, set **Manual Connection URL** to a LAN-reachable address (for example `http://192.168.x.x:32400`) and save.
- **Check API access**: Scroblarr needs API access to fetch users. Verify your API keys are correct
- **Try manual import**: You can manually add users if automatic import isn't working

## Database issues

### SQLite database locked

This usually happens if multiple instances are running or if the database file has incorrect permissions.

- **Stop all Scroblarr instances**: Make sure only one is running
- **Check file permissions**: The database file should be writable
- **Check disk space**: Make sure you have enough disk space

### Migration errors

- **Check database connection**: Verify your database settings are correct
- **Check logs**: Migration errors will be in the startup logs
- **Manual migration**: You can run migrations manually with `pnpm --filter @scroblarr/backend migration:run`

## Performance issues

### Slow syncs

- **Check network**: Slow internet can cause delays
- **Check API rate limits**: Trakt and Simkl have rate limits. If you're syncing a lot at once, it might be slow
- **Check server resources**: Make sure your server has enough CPU and memory

### High memory usage

- **Check sync history limit**: Lower the sync history limit in Settings → General
- **Check logs**: Large log files can use memory. Rotate logs if needed

## Still stuck?

If you're still having issues:

1. **Check the logs**: Settings → Logs has detailed information about what's happening
2. **Check sync history**: The Dashboard shows all sync attempts and their status
3. **Ask on Discord**: [Join the community](https://discord.gg/pS6rRyxctw) for help from other users.
4. **Open an issue**: If it's a bug, open an issue on GitHub with:
   - What you're trying to do
   - What error messages you're seeing
   - Relevant log entries (remove any sensitive information)
   - Your setup (which media servers, which destinations, etc.)

:::tip
Most issues are configuration-related, so double-check your webhook URLs, API keys, and account linking.
:::
