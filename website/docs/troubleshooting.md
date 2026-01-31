---
sidebar_position: 6
---

# Troubleshooting

Having issues? Here are some common problems and how to fix them.

## Webhooks not working

### Plex webhooks not received

- **Check the webhook URL**: Make sure it's correct in Plex settings. It should be `http://your-url/api/v1/webhooks/plex` (optionally with `?apiKey=your_key` for security)
- **Check your API key** (if using one): If you included an API key in the webhook URL, it must match the one in Scroblarr Settings → General
- **Check Plex Pass**: Webhooks require an active Plex Pass subscription
- **Check network access**: Can Plex reach your Scroblarr server? Try accessing the webhook URL from a browser (you should get an error, but it confirms the endpoint exists)
- **Check Plex logs**: Plex logs will show if webhook delivery failed
- **Check Scroblarr logs**: Go to Settings → Logs and look for webhook-related errors

### Jellyfin webhooks not received

- **Install the Webhooks plugin**: Jellyfin requires a plugin for webhooks. Install it from the Plugins section
- **Check the webhook URL**: Should be `http://your-url/api/v1/webhooks/jellyfin`
- **Check API key** (if using one): If you configured an API key, make sure the `X-API-Key` header or JSON payload field matches the one in Scroblarr Settings → General
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
- **Check API keys**: For Trakt, make sure your Client ID and Client Secret are correct

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
