# System API

System-level operations. Most require `ADMIN` role. Auth required.

## GET /api/system/status

Get service status (Postfix, Dovecot, PostgreSQL, MySQL, Redis, CoreDNS, Traefik).

---

## GET /api/system/backups

List backup snapshots.

---

## POST /api/system/backups

Trigger a manual backup.

---

## DELETE /api/system/backups/:id

Delete a backup snapshot.

---

## GET /api/system/firewall/rules

List UFW firewall rules.

---

## POST /api/system/firewall/rules

Add a firewall rule.

---

## DELETE /api/system/firewall/rules/:id

Remove a firewall rule.

---

## GET /api/system/cleanup/runs

List Docker cleanup runs.

---

## POST /api/system/cleanup/trigger

Trigger a manual Docker cleanup.

---

## GET /api/system/monitoring

Get system metrics (CPU, RAM, disk).

---

## GET /api/system/audit-log

Get the audit log. Admin-only.
