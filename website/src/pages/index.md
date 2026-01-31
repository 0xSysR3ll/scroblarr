---
title: Scroblarr
---

# Scroblarr

**Automatically sync your watch history across platforms**

Scroblarr keeps your viewing data synchronized between your media servers (Plex, Jellyfin) and tracking services (Trakt, TVTime). No manual logging required—just watch and sync.

## How it works

When you watch content on Plex or Jellyfin, Scroblarr receives webhook events and automatically syncs that watch data to Trakt and TVTime. This keeps your watch history synchronized across all platforms—no manual intervention needed.

All users from your configured media servers can use Scroblarr. Each user's watch history syncs independently to their linked destination accounts.

**Sources:**

<div style={{
  display: 'flex',
  gap: '1.5rem',
  marginTop: '0.5rem',
  marginBottom: '1rem',
  flexWrap: 'wrap',
  alignItems: 'center',
}}>
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '8px',
  }}>
    <img src="img/logos/plex.svg" alt="Plex" style={{ width: '24px', height: '24px' }} />
    <span><strong>Plex</strong> (webhooks)</span>
  </div>
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '8px',
  }}>
    <img src="img/logos/jellyfin.svg" alt="Jellyfin" style={{ width: '24px', height: '24px' }} />
    <span><strong>Jellyfin</strong> (webhooks)</span>
  </div>
</div>

**Destinations:**

<div style={{
  display: 'flex',
  gap: '1.5rem',
  marginTop: '0.5rem',
  marginBottom: '1rem',
  flexWrap: 'wrap',
  alignItems: 'center',
}}>
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '8px',
  }}>
    <img src="img/logos/trakt.svg" alt="Trakt" style={{ width: '24px', height: '24px' }} />
    <span><strong>Trakt</strong></span>
  </div>
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '8px',
  }}>
    <img src="img/logos/tvtime.png" alt="TVTime" style={{ width: '24px', height: '24px' }} />
    <span><strong>TVTime</strong></span>
  </div>
</div>

Both sources and destinations can be configured simultaneously. Multiple users are supported with individual account linking.

## Why Scroblarr?

<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: '1.5rem',
  marginTop: '1.5rem',
  marginBottom: '2rem',
}}>
  <div style={{
    padding: '1.5rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '12px',
    border: '1px solid var(--ifm-color-emphasis-200)',
  }}>
    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.2rem' }}>🔄 Automatic</h3>
    <p style={{ margin: 0, color: 'var(--ifm-color-content-secondary)' }}>
      Real-time syncing via webhooks. No manual logging or button clicking required.
    </p>
  </div>
  <div style={{
    padding: '1.5rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '12px',
    border: '1px solid var(--ifm-color-emphasis-200)',
  }}>
    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.2rem' }}>👥 Multi-user</h3>
    <p style={{ margin: 0, color: 'var(--ifm-color-content-secondary)' }}>
      Each user syncs independently. Perfect for families and shared media servers.
    </p>
  </div>
  <div style={{
    padding: '1.5rem',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    borderRadius: '12px',
    border: '1px solid var(--ifm-color-emphasis-200)',
  }}>
    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.2rem' }}>🔒 Self-hosted</h3>
    <p style={{ margin: 0, color: 'var(--ifm-color-content-secondary)' }}>
      Your data stays on your server. Full control and privacy.
    </p>
  </div>
</div>

## Features

- **Real-time syncing** via webhooks from Plex and Jellyfin
- **Multi-user support** with independent account management
- **Web interface** for configuration and monitoring
- **REST API** for automation and integration
- **Sync history** tracking with detailed statistics
- **Multi-destination** support (sync to both Trakt and TVTime simultaneously)

<div style={{
  marginTop: '2rem',
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  width: '100%',
}}>
  <a
    href="docs/installation"
    style={{
      display: 'inline-block',
      padding: '0.75rem 2rem',
      backgroundColor: 'var(--ifm-color-primary)',
      color: 'var(--ifm-color-primary-contrast-background)',
      borderRadius: '8px',
      textDecoration: 'none',
      fontWeight: '600',
      fontSize: '1.1rem',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    }}
  >
    Get Started
  </a>
</div>
