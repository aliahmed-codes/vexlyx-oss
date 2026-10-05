# API Reference

The Vexlyx API is a **Fastify** HTTP server running on port `5000` by default. All endpoints are prefixed with `/api/`.

## Authentication

All endpoints except `/api/auth/login`, `/api/auth/register`, `/api/auth/config`, `/api/auth/forgot-password`, and `/api/auth/reset-password` require an authenticated session cookie.

Sessions are HTTP-only cookies (`vexlyx_session`) set on successful login. Pass them automatically in browser requests or via `credentials: "include"` in `fetch`.

## Response format

**Success:**
```json
{ "data": ... }
```
(shape varies per endpoint — see individual pages)

**Error:**
```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Rate limits

Auth endpoints are rate-limited to **5 requests per 15 minutes per IP**. All other endpoints: **1000 requests per minute**.

## Base URL

| Environment | Base URL |
|-------------|---------|
| Development | `http://localhost:5000` |
| Production | `https://panel.yourdomain.com` |

## Modules

| Module | Prefix | Description |
|--------|--------|-------------|
| [Auth](/api/auth) | `/api/auth` | Login, register, logout, 2FA, password reset |
| [Projects](/api/projects) | `/api/projects` | CRUD, deploy, environment variables |
| [Deployments](/api/deployments) | `/api/deployments` | Build/deploy lifecycle, logs |
| [Domains](/api/domains) | `/api/domains` | Custom domains, DNS mode |
| [Databases](/api/databases) | `/api/databases` | PostgreSQL/MySQL provisioning |
| [Files](/api/files) | `/api/files` | File manager, chmod, extract/compress |
| [Mail](/api/mail) | `/api/mail` | Postfix/Dovecot, mailboxes, DKIM |
| [DNS](/api/dns) | `/api/domains/:id/dns` | DNS records, zones |
| [System](/api/system) | `/api/system` | Backups, firewall, service status |

::: tip OpenAPI spec
A machine-readable OpenAPI 3.0 spec will be auto-generated from the Fastify route schemas in a future release. Until then, this reference documents each endpoint manually.
:::
