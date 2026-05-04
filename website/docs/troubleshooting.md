---
sidebar_position: 6
---

# Troubleshooting

Having issues? Here are some common problems and how to fix them.

## Webhooks not working

### Plex webhooks not received

- **Set an API key in Scroblarr first**: Under **Settings → General**, without a stored API key, webhooks return **503** (`Webhook authentication not ready`).
- **Check the webhook URL**: It must include your key as a query parameter, e.g. `http://your-url/api/v1/webhooks/plex?apiKey=your_key` (Plex cannot send `X-API-Key` headers).
- **Check the key matches**: The `apiKey` query value must exactly match **Settings → General** (copy-paste; watch for trailing spaces or URL encoding issues).
- **Check Plex Pass**: Webhooks require an active Plex Pass subscription
- **Check network access**: Plex must be able to reach your Scroblarr URL (firewall, Docker networking, HTTPS vs HTTP). Webhooks are **POST** requests with a body; opening the URL in a browser (GET) is not a reliable test of delivery—use Plex webhook logs and Scroblarr logs instead.
- **Check Plex logs**: Plex logs will show if webhook delivery failed
- **Check Scroblarr logs**: Go to Settings → Logs and look for webhook-related errors

### Plex webhooks return 401 "Invalid server identity"

Scroblarr compares the webhook JSON `Server.uuid` to the machine identifier saved when you last saved your Plex server in **Settings → Media Server**.

- **Re-save your Plex server**: Pick the correct server from the list and click **Save** so the stored identifier matches the server that sends webhooks.
- **One server per Scroblarr URL**: Webhooks must come from that same Plex Media Server instance, not a different server using the same Scroblarr URL and key.

### Jellyfin webhooks not received

- **Install the Webhooks plugin**: Jellyfin requires a plugin for webhooks. Install it from the Plugins section
- **Set an API key in Scroblarr first**: Under **Settings → General**, without a stored API key, webhooks return **503** (`Webhook authentication not ready`).
- **Check the webhook URL**: Should be `http://your-url/api/v1/webhooks/jellyfin`
- **Send the API key on every request**: Use the `X-API-Key` header or include `"apiKey": "..."` in the JSON body; it must exactly match **Settings → General**. Missing or wrong keys return **401**.
- **Check Jellyfin logs**: Look for webhook delivery errors

## Syncs not appearing

### Watch history not syncing to Trakt/TVTime

- **Check account linking**: Go to Profile → Integrations and verify your accounts are linked
- **Check user matching**: Make sure the Plex/Jellyfin username matches the user in Scroblarr
- **Check sync history**: Go to Dashboard and see if syncs are appearing there (even if they failed)
- **Check error messages**: Failed syncs will show error messages in the sync history
- **Check logs**: Settings → Logs will have detailed error information

### Syncs failing with authentication errors

- **Trakt**: Your OAuth token might have expired. Try unlinking and re-linking your Trakt account
- **TVTime**: Your credentials might be wrong. Try unlinking and re-linking with correct email/password
- **Trakt OAuth app**: Confirm your **Trakt Client ID** and **Client Secret** (from [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications)) match what you entered in Scroblarr—these are not the same as the Scroblarr **Settings → General** API key used for webhooks.

### TVTime sync fails with "TVDB episode ID" or missing metadata

TVTime episode scrobbling requires a **TVDB episode ID** in the watch event. If logs or sync history mention TVDB:

- **Refresh metadata** for the show in Plex or Jellyfin and ensure your library uses a metadata agent that supplies **TheTVDB** (or equivalent) GUIDs.
- **Movies**: If movies fail to match, confirm the item has correct external IDs (TVDB or IMDb) in the media server.

See [TVTime configuration](/docs/configuration/tvtime#metadata-requirements-tvdb) for a short overview.

### TVTime shows "502" or "profile temporarily unavailable"

If the Profile → Integrations page shows a message like "Profile details could not be loaded (TVTime service temporarily unavailable)" but your TVTime account is linked and shows your email, **you are still connected**. Syncing to TVTime will work. The 502 comes from TVTime's API when loading profile/avatar; you can ignore the message or refresh the page later.

## User import issues

### Users not showing up after import

- **Check media server connection**: Make sure Plex/Jellyfin is properly configured in Settings
- **Check authentication**: For Plex, make sure you've authenticated and selected a server
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
- **Check API rate limits**: Trakt and TVTime have rate limits. If you're syncing a lot at once, it might be slow
- **Check server resources**: Make sure your server has enough CPU and memory

### High memory usage

- **Check sync history limit**: Lower the sync history limit in Settings → General
- **Check logs**: Large log files can use memory. Rotate logs if needed

## Still stuck?

If you're still having issues:

1. **Check the logs**: Settings → Logs has detailed information about what's happening
2. **Check sync history**: The Dashboard shows all sync attempts and their status
3. **Open an issue**: If it's a bug, open an issue on GitHub with:
   - What you're trying to do
   - What error messages you're seeing
   - Relevant log entries (remove any sensitive information)
   - Your setup (which media servers, which destinations, etc.)

:::tip
Most issues are configuration-related, so double-check your webhook URLs, API keys, and account linking.
:::
