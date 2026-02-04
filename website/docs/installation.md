---
sidebar_position: 1
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

## Requirements

Before you start, make sure you have:

- **Node.js 18+** and **pnpm 8+** installed (for manual installation), or **Docker** (for containerized installation)
- A **SQLite** database (default, no setup needed) or **PostgreSQL** for production
- At least one media server: **Plex** and/or **Jellyfin**
- At least one destination account: **Trakt** and/or **TVTime**

## Choose your installation method

<Tabs>
<TabItem value="docker" label="Docker (Recommended)" default>

The easiest way to run Scroblarr is with Docker. No need to install Node.js or manage dependencies.

### Quick start with Docker

```bash
docker run -d \
  --name scroblarr \
  -p 3000:3000 \
  -v scroblarr-data:/app/data \
  ghcr.io/0xsysr3ll/scroblarr:latest
```

Then access the web interface at `http://localhost:3000`.

### Using Docker Compose

For a more complete setup, especially if you want PostgreSQL, use Docker Compose:

```yaml
services:
  scroblarr:
    image: ghcr.io/0xsysr3ll/scroblarr:latest
    container_name: scroblarr
    ports:
      - "3000:3000"
    volumes:
      - scroblarr-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      # Optional: Use PostgreSQL instead of SQLite
      # - POSTGRES_HOST=postgres
      # - POSTGRES_PORT=5432
      # - POSTGRES_USER=scroblarr
      # - POSTGRES_PASSWORD=your_password
      # - POSTGRES_DATABASE=scroblarr
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/auth/check-admin || exit 1",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # Optional: PostgreSQL for production
  # postgres:
  #   image: postgres:17-alpine
  #   container_name: scroblarr-postgres
  #   environment:
  #     - POSTGRES_USER=scroblarr
  #     - POSTGRES_PASSWORD=your_password
  #     - POSTGRES_DB=scroblarr
  #   volumes:
  #     - postgres-data:/var/lib/postgresql/data
  #   restart: unless-stopped

volumes:
  scroblarr-data:
  # postgres-data:
```

Save this as `compose.yml` and run:

```bash
docker compose up -d
```

### Docker volumes

The `scroblarr-data` volume stores:

- Database file (if using SQLite)
- Logs
- Application data

To backup your data, just backup the Docker volume.

### Environment variables

You can customize Scroblarr with environment variables:

- `PORT` - Port to run on (default: 3000)
- `DATA_DIR` - Custom data directory (default: `/app/data`)
- `DATABASE_PATH` - Custom SQLite database path
- `POSTGRES_*` - PostgreSQL connection settings

### Updating Docker image

To update Scroblarr:

```bash
docker pull ghcr.io/0xsysr3ll/scroblarr:latest
docker compose down
docker compose up -d
```

Or if using `docker run`:

```bash
docker stop scroblarr
docker rm scroblarr
docker pull ghcr.io/0xsysr3ll/scroblarr:latest
# Run the docker run command again
```

Your data is safe in the volume, so you won't lose anything.

### Next steps

1. Access the web interface at `http://localhost:3000`
2. Create an admin account on first launch
3. Configure your media servers (see [Configuration](/docs/configuration))
4. Set up webhooks and link your destination accounts

</TabItem>
<TabItem value="manual" label="Manual Installation">

If you prefer to run Scroblarr from source or don't want to use Docker:

### 1. Clone and install

```bash
git clone https://github.com/0xsysr3ll/scroblarr.git
cd scroblarr
pnpm install
```

### 2. Database setup

By default, Scroblarr uses SQLite, which requires zero configuration. It'll create a database file at `data/db/scroblarr.db` automatically.

For production, you might want PostgreSQL. You can use an existing PostgreSQL user or the default `postgres` superuser. Set these environment variables:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres  # Or use an existing user
POSTGRES_PASSWORD=your_password
POSTGRES_DATABASE=scroblarr
POSTGRES_SSL=false  # Set to "true" if using SSL
```

:::tip
Scroblarr will automatically create the database if it doesn't exist when you start it. If you're using a non-superuser account, make sure they have `CREATEDB` privileges. You can use the default `postgres` superuser if you prefer.
:::

### 3. Start the service

```bash
pnpm dev
```

This starts both the backend API and frontend. You can also run them separately:

```bash
pnpm dev:backend  # Backend only (port 3000)
pnpm dev:frontend # Frontend only (port 5173)
```

### 4. Access the web interface

Open your browser and go to `http://localhost:3000`. You should see the login page.

### 5. First-time setup

On first launch, you'll need to create an admin account. The web interface will guide you through this.

### 6. Configure your media servers

Head to **Settings > Media Server** and configure your Plex and/or Jellyfin servers. You'll need to:

- **Plex**: Authenticate with your Plex account and select which server to use
- **Jellyfin**: Enter your server URL, API key, and connection details

### 7. Set up webhooks

Once your media servers are configured, you need to point their webhooks to Scroblarr:

- **Plex webhook URL**: `http://your-scroblarr-url/api/v1/webhooks/plex`
- **Jellyfin webhook URL**: `http://your-scroblarr-url/api/v1/webhooks/jellyfin`

You'll need your API key from **Settings > General** to secure the webhooks. See the [Configuration](/docs/configuration) guide for detailed webhook setup instructions.

### 8. Link your destination accounts

Go to your **Profile > Integrations** tab and link your Trakt and/or TVTime accounts. Each user on your media server can link their own accounts independently.

That's it! Once everything is connected, Scroblarr will start syncing watch history automatically.

</TabItem>
<TabItem value="production" label="Production Deployment">

This guide covers setting up Scroblarr for production use on a Linux server. We'll cover building, process management, database setup, and reverse proxy configuration.

### Prerequisites

- Linux server (Ubuntu/Debian recommended)
- Node.js 18+ and pnpm 8+ installed
- PostgreSQL (optional, but recommended for production)
- Domain name and SSL certificate (optional, for HTTPS)

### 1. Clone and build

```bash
# Clone the repository
git clone https://github.com/0xsysr3ll/scroblarr.git
cd scroblarr

# Install dependencies
pnpm install

# Build the project
pnpm build
```

This compiles TypeScript to JavaScript and builds the frontend. The built files will be in:

- `packages/backend/dist/` - Backend compiled code
- `packages/frontend/dist/` - Frontend static files (served by backend)

### 2. Set up PostgreSQL (recommended)

For production, PostgreSQL is recommended over SQLite for better performance and reliability.

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib
```

:::tip
You can use an existing PostgreSQL user if you have one, or use the default `postgres` superuser. If you want to create a dedicated user for Scroblarr, you can do so, but it's optional.
:::

If you want to create a dedicated user (optional):

```bash
sudo -u postgres psql
```

In the PostgreSQL prompt:

```sql
CREATE USER scroblarr WITH PASSWORD 'your_secure_password';
ALTER USER scroblarr CREATEDB;
\q
```

:::tip
Scroblarr will automatically create the database if it doesn't exist when you start it. If you're using an existing user, make sure they have `CREATEDB` privileges or use a superuser account.
:::

### 3. Configure environment variables

Create a `.env` file in the project root or set environment variables:

```bash
# Production environment
NODE_ENV=production

# Server port (default: 3000)
PORT=3000

# Data directory (default: ./data)
DATA_DIR=/var/lib/scroblarr

# PostgreSQL configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=scroblarr
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DATABASE=scroblarr
POSTGRES_SSL=false
```

### 4. Create data directory

```bash
sudo mkdir -p /var/lib/scroblarr/{db,logs}
sudo chown -R $USER:$USER /var/lib/scroblarr
```

### 5. Set up process manager

#### Option A: PM2 (recommended)

PM2 is a popular Node.js process manager with auto-restart and logging.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'scroblarr',
    script: './packages/backend/dist/index.js',
    cwd: '.',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/lib/scroblarr/logs/pm2-error.log',
    out_file: '/var/lib/scroblarr/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
# Follow the instructions it prints
```

#### Option B: systemd

For systemd-based Linux distributions:

```bash
# Create systemd service file
sudo nano /etc/systemd/system/scroblarr.service
```

Add this content (adjust paths as needed):

```ini
[Unit]
Description=Scroblarr Media Scrobbling Service
After=network.target postgresql.service

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/scroblarr
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="POSTGRES_HOST=localhost"
Environment="POSTGRES_PORT=5432"
Environment="POSTGRES_USER=scroblarr"
Environment="POSTGRES_PASSWORD=your_secure_password"
Environment="POSTGRES_DATABASE=scroblarr"
ExecStart=/usr/bin/node packages/backend/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable scroblarr

# Start the service
sudo systemctl start scroblarr

# Check status
sudo systemctl status scroblarr
```

### 6. Set up reverse proxy (nginx)

If you want to access Scroblarr via a domain name with HTTPS, set up nginx as a reverse proxy.

```bash
# Install nginx
sudo apt install nginx

# Create nginx configuration
sudo nano /etc/nginx/sites-available/scroblarr
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name scroblarr.example.com;

    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    # For now, proxy to HTTP
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/scroblarr /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

### 7. Set up SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d scroblarr.example.com

# Certbot will automatically update your nginx config
# Certificates auto-renew via systemd timer
```

After SSL setup, update your nginx config to redirect HTTP to HTTPS (uncomment the redirect line).

### 8. Firewall configuration

```bash
# Allow HTTP and HTTPS (if using nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If accessing directly (not recommended), allow port 3000
# sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

### 9. Update webhook URLs

After setting up your domain and SSL, update your Plex and Jellyfin webhook URLs to use your new domain:

- **Plex**: `https://scroblarr.example.com/api/v1/webhooks/plex?apiKey=your_key`
- **Jellyfin**: `https://scroblarr.example.com/api/v1/webhooks/jellyfin`

### 10. Monitoring and maintenance

**View logs:**

- PM2: `pm2 logs scroblarr`
- systemd: `sudo journalctl -u scroblarr -f`
- Application logs: `/var/lib/scroblarr/logs/`

**Update Scroblarr:**

```bash
cd /path/to/scroblarr
git pull
pnpm install
pnpm build

# Restart service
pm2 restart scroblarr
# or
sudo systemctl restart scroblarr
```

**Backup database:**

```bash
# PostgreSQL backup
pg_dump -U scroblarr scroblarr > backup_$(date +%Y%m%d).sql

# SQLite backup (if using SQLite)
cp /var/lib/scroblarr/db/scroblarr.db backup_$(date +%Y%m%d).db
```

The web interface runs on port 3000 by default (or your configured port). You can change this with the `PORT` environment variable.

</TabItem>
</Tabs>
