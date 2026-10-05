# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest (`main`) | ✅ |
| Older branches | ❌ |

Vexlyx is pre-1.0. The `main` branch receives security fixes. Older releases do not.

## Reporting a vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

### Private disclosure

Report vulnerabilities privately via:
- **GitHub Security Advisories** — [Report a vulnerability](https://github.com/atlantiqs-org/vexlyx/security/advisories/new)
- **Email** — security@vexlyx.com (if available)

Include:
1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Any suggested mitigation

### What to expect

- **Acknowledgement** within 48 hours
- **Initial assessment** within 7 days
- **Fix timeline** depends on severity (critical: 24–72 hours; high: 1–2 weeks; medium/low: next release)
- **Public disclosure** after a fix is released (coordinated disclosure)

### Scope

In scope:
- Authentication bypass or session hijacking
- Privilege escalation (USER → ADMIN, cross-tenant access)
- Remote code execution via the API or panel
- Path traversal in the file manager
- SQL injection
- Stored XSS
- SSRF

Out of scope:
- Vulnerabilities requiring physical access to the server
- Vulnerabilities in Docker, Traefik, or third-party dependencies (report these upstream)
- Theoretical issues without a working proof of concept

## Security architecture

Vexlyx is designed with these security principles:

- **Authentication:** Argon2id password hashing, Redis-backed HTTP-only sessions, TOTP 2FA
- **Secrets:** AES-256-GCM encryption for stored credentials (database passwords, env vars)
- **Input validation:** Zod at every API boundary; no raw user input reaches the database
- **File manager:** Path traversal protection on every operation (`safePath` + `realpath`)
- **Docker isolation:** Each project runs in its own container; API never runs as root
- **No direct Docker socket:** System operations go through Python scripts with limited permissions

## Hall of fame

We will credit security researchers who responsibly disclose vulnerabilities here.
