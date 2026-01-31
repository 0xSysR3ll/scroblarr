---
sidebar_position: 4
---

# TVTime Configuration

Link your TVTime account to sync watch history. Each user on your media server needs to link their own TVTime account.

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the TVTime section, enter your TVTime email and password
3. Click **Link Account**
4. Scroblarr will handle the authentication process (this might take a moment)

Your TVTime account is now linked!

## Rewatch settings

You can configure whether to mark content as "rewatched" when syncing to TVTime:

- **Mark movies as rewatched**: If enabled, movies you've watched before will be marked as rewatched on TVTime
- **Mark episodes as rewatched**: If enabled, episodes you've watched before will be marked as rewatched on TVTime

These settings are per-user and can be changed at any time in **Profile > Integrations**.

## What gets synced

Scroblarr syncs the following to TVTime:

- **Movies**: When you finish watching a movie
- **TV Episodes**: When you finish watching an episode
- **Rewatch status**: Optional, based on your settings

## Unlinking your account

If you need to unlink your TVTime account:

1. Go to **Profile > Integrations**
2. Click **Unlink** in the TVTime section
3. Confirm the unlink

Your watch history will stop syncing to TVTime, but existing synced data remains on TVTime.

## Troubleshooting

If you're having trouble linking your TVTime account:

- Make sure your email and password are correct
- Check that your TVTime account is active
- Try unlinking and re-linking if authentication fails
- Check the Scroblarr logs for error messages
