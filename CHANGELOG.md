# Changelog

All notable changes to Vexlyx are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **F6.1** — VitePress documentation site at `docs/` with installation guide, developer guide, API reference, and troubleshooting
- **F6.2** — GitHub Actions CI/CD pipeline (lint, typecheck, test, build, release)
- **F6.3** — Community files (`CONTRIBUTING.md`, `SECURITY.md`, issue templates)
- **F5.23** — System transactional email: password-reset flow, 2FA security alerts, role-change and quota-warning email templates via nodemailer + Postfix relay
- **F5.24** — File Manager: chmod dialog (octal mode + recursive option) and archive extract/compress (zip, tar.gz, tar.bz2 via system CLI)
- **F5.17** — Two-factor authentication (TOTP/TOTP) using otplib; QR code setup flow; 2FA step on login
- **F5.19** — Fine-grained custom permissions (canManageDns, canManageFirewall, canManageBackups, canCreateSubAccounts) beyond role

---

## Phase 5 additions (2026-09)

### F5.27 — Public Authoritative DNS
- `Corefile.public` authoritative-only config (no forward recursion)
- `VEXLYX_COREFILE` / `VEXLYX_DNS_BIND` env vars
- "Prepare zone before switching" (`skipDelegationCheck`)

### F5.26 — Mail Deliverability for Connected Domains
- Deliverability score from live DNS lookups (not `DnsRecord` rows) for CONNECTED domains
- `buildRequiredMailRecords` shared between scoring and zone seeding

### F5.25 — Per-Domain DNS Mode
- `Domain.dnsMode` (`CONNECTED` | `MANAGED`)
- DNS hosting as deliberate opt-in — NS delegation check required
- `/api/domains/:id/dns*` returns `409 DNS_NOT_MANAGED` for CONNECTED domains

### F5.21 — No-Build PHP Hosting
- PHP-FPM bind-mount deployment (drop-in file hosting, no build step)
- Custom `vexlyx-php-fpm` image with common extensions baked in
- Cross-project request routing fix (unique container name in `fastcgi_pass`)

### F5.20 — Reseller Overselling Toggle
- `oversellingEnabled` field on `User` (ADMIN-only toggle)
- Nominal-sum vs. aggregate enforcement switch

### F5.15 — Docker Cleanup
- Scheduled and manual Docker image/container cleanup
- `CleanupRun` model, BullMQ queue, dashboard UI

---

## Phase 4 (Email)

### F4.1–F4.5
- Postfix SMTP + Dovecot IMAP + Roundcube webmail
- DKIM signing via OpenDKIM
- Virtual aliases and vacation responder

---

## Phase 3 (Domains, SSL, DNS)

### F3.1–F3.3
- Custom domain routing via Traefik labels
- Let's Encrypt automatic SSL
- DNS zone management (CoreDNS)

---

## Phase 2 (Databases, Files)

### F2.1–F2.9
- PostgreSQL and MySQL provisioning
- File manager (list, read, write, delete, rename, copy, move, upload, download)
- SFTP access via OpenSSH

---

## Phase 1 (Projects, Deployment)

### F1.1–F1.7
- Project creation and management
- Nixpacks zero-config builds
- Docker-based deployment
- GitHub integration and webhooks
- Real-time deployment logs via Socket.io

---

## Phase 0 (Foundation)

### F0.1–F0.7
- Turborepo monorepo
- Next.js 15 + shadcn/ui dashboard
- Fastify + Prisma API
- Custom auth (Argon2id + Redis sessions)
- Shared Zod schemas + TypeScript types
