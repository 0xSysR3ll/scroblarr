---
sidebar_position: 6
---

# Bingers Configuration

Link your Bingers account and keep the session alive. Each user on your media server needs to link their own Bingers account. This page covers account linking only.

:::note
Watch-history sync to Bingers lands in a follow-up change.
:::

## Sign in with Bingers

Bingers uses email magic-link sign-in (no developer API app or Client ID). Linking opens Bingers in a popup; you paste the magic-link URL from your email back into Scroblarr.

:::note
Magic links are one-shot and expire in about **15 minutes**. If the link expires, request a new one from Bingers and paste the fresh URL.
:::

## Link your account

1. Go to **Profile > Integrations** in Scroblarr
2. In the Bingers section, click **Open Bingers sign-in**
3. On [bingers.app/mobile-signin](https://bingers.app/mobile-signin), enter your email and complete the bot check
4. Open the email, copy the full magic-link URL (`https://bingers.app/m?token=…`)
5. Paste it into Scroblarr and click **Complete link**

Your Bingers account is now linked!

## Session keep-alive

Bingers uses session cookies instead of OAuth refresh tokens. Scroblarr keeps the session alive in the background so you usually do not need to reconnect.

If the session expires or is revoked, Scroblarr will show **Re-authorize** in the Bingers section. You can stay signed in on the Bingers app and Scroblarr at the same time.

## Unlinking your account

If you need to unlink your Bingers account:

1. Go to **Profile > Integrations**
2. Click **Unlink** in the Bingers section
3. Confirm the unlink

Unlinking does not log you out of the Bingers app.

## Troubleshooting

If you're having trouble linking:

- Request a fresh magic link if the previous one expired or was already used
- Paste the full URL from the email, including the `token` query parameter
- Re-authorize if Scroblarr shows the session as expired
- Check Settings → Logs for Bingers-specific errors
