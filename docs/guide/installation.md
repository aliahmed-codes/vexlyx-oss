# Installation

## Requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB SSD |
| Docker | 24+ | 27+ |
| Docker Compose | v2 | v2 |
| Node.js | 20 LTS | 22 LTS |
| Python | 3.11+ | 3.12+ |

::: warning Port requirements
The server needs ports **80** and **443** open for Traefik/Let's Encrypt, **25/587/993** for email, and **53** (UDP/TCP) for public DNS. Ensure these are not blocked by your cloud provider's firewall.
:::

## One-line installer (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/atlantiqs-org/vexlyx/main/system/scripts/install.sh | sudo bash
```

The installer will:
1. Check system requirements
2. Install Docker, Docker Compose, Node.js, Python, and system dependencies
3. Clone the Vexlyx repository to `/opt/vexlyx`
4. Generate secrets and create `.env`
5. Build all Docker images
6. Run database migrations
7. Create the first admin account
8. Start all services

After installation, the panel is at `https://your-server-ip` (self-signed cert until you add a domain).

## Manual installation

### 1. Clone the repository

```bash
git clone https://github.com/atlantiqs-org/vexlyx.git /opt/vexlyx
cd /opt/vexlyx
```

### 2. Install dependencies

```bash
# Install pnpm globally
npm install -g pnpm

# Install all workspace dependencies
pnpm install
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set at minimum:

```env
DATABASE_URL=postgresql://vexlyx:CHANGE_ME@localhost:5434/vexlyx
REDIS_URL=redis://localhost:6379
SESSION_SECRET=<64-character random string>
ENCRYPTION_KEY=<64-character random string>
PANEL_DOMAIN=panel.yourdomain.com
PUBLIC_IP=<your server IP>
BASE_DOMAIN=yourdomain.com
```

Generate random secrets:
```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
```

### 4. Start infrastructure services

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, and Traefik.

### 5. Run database migrations

```bash
cd apps/api
pnpm db:migrate
pnpm db:generate
```

### 6. Create the first admin account

```bash
pnpm db:create-admin
```

### 7. Build the application

```bash
cd /opt/vexlyx
pnpm build
```

### 8. Start Vexlyx

```bash
pnpm dev   # development
# or
pnpm start  # production (requires pnpm build first)
```

## Docker Compose (production)

For production, use the production Docker Compose file:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

::: info Let's Encrypt
Set `PANEL_DOMAIN` to a real domain pointing to your server's IP. Traefik will auto-provision a Let's Encrypt certificate on first start.
:::

## Post-installation

1. Open `https://your-panel-domain` in a browser
2. Sign in with the admin credentials you created
3. Go to **Settings → DNS Records** to verify your server's IP and nameservers
4. Add your first domain and project

## Updating

```bash
cd /opt/vexlyx
git pull
pnpm install
cd apps/api && pnpm db:migrate
cd /opt/vexlyx
pnpm build
# restart services
```

## Troubleshooting

See the [Troubleshooting guide](/guide/troubleshooting) for common issues.
