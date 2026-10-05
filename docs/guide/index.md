# What is Vexlyx?

Vexlyx is an **open-source hybrid hosting control panel** that runs on a single Linux server. Unlike traditional panels (cPanel, Plesk, HestiaCP) that only manage traditional hosting services, or PaaS platforms (Coolify, Dokploy) that only deploy modern apps, Vexlyx does both on one box.

## What can it do?

**Modern app deployment:**
- Next.js, Node.js, Python (Django/FastAPI/Flask), React, static sites
- PHP and no-build PHP hosting (drop-in file hosting without a build step)
- WordPress (Nginx + PHP-FPM, fully Dockerized)
- Custom Dockerfile support
- Git push deployments with Nixpacks zero-config builds
- GitHub webhook auto-deploy

**Traditional hosting:**
- Email: Postfix + Dovecot + Roundcube webmail, DKIM, aliases, vacation responder
- DNS: CoreDNS zones with a built-in DNS editor
- SSL: Traefik automatic Let's Encrypt certificates
- Databases: per-user PostgreSQL and MySQL provisioning
- SFTP and File Manager (with chmod and archive extract/compress)

**Operations:**
- Firewall management (UFW)
- Automated backups
- Docker cleanup
- Service status dashboard
- Audit log
- Real-time deployment logs via Socket.io

## Architecture

Vexlyx is a **Turborepo monorepo** with three packages:

| Package | Purpose |
|---------|---------|
| `apps/dashboard` | Next.js 15 frontend — what users see |
| `apps/api` | Fastify backend — business logic, Docker, system operations |
| `packages/shared` | Zod schemas + TypeScript types shared between both |

A **Python + Bash system layer** (`system/`) handles Docker management, mail server configuration, DNS, backups, and system settings. The API calls these scripts rather than executing privileged operations directly.

**Traefik v3** handles TLS termination and routes all traffic to the correct container. **Nixpacks** auto-detects the application type and builds a Docker image with zero configuration.

## Technology stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router, Tailwind CSS 4, shadcn/ui |
| State | Zustand, TanStack Query |
| Backend | Fastify, TypeScript |
| Validation | Zod |
| Auth | Custom (Argon2id + Redis sessions) |
| ORM | Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Real-time | Socket.io |
| Containers | Docker + Docker Compose |
| Proxy | Traefik v3 |
| Build | Nixpacks |
| Monorepo | Turborepo + pnpm workspaces |

## Ready to install?

→ [Installation guide](/guide/installation)
