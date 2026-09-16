# Fine-Grained Custom Permissions (F5.19)

> **Status:** 🟢 COMPLETED
> **Feature:** An additive permission layer on top of the 3 fixed roles (ADMIN/RESELLER/USER), letting an ADMIN grant a user a specific capability without a full role upgrade.

---

## What It Does

Before F5.19, Vexlyx's RBAC was strictly 3 fixed roles — there was no way to give a USER access to, say, DNS management without promoting them all the way to RESELLER (which also grants sub-account creation, quota management, etc). This matches a recognized gap across the market (WHM ACL templates, Plesk permission properties, Dokploy per-resource grants all support it; Coolify doesn't and has open community requests for it).

F5.19 adds:

- A `Permission` enum (`canManageDns`, `canManageFirewall`, `canManageBackups`, `canCreateSubAccounts`) and a `permissions Permission[]` array on `User`.
- A `requireRoleOrPermission(roles, permission)` preHandler factory alongside `requireRole`, applied to the DNS, Firewall, Backups, and sub-account-creation routes.
- A `PATCH /api/users/:id/permissions` endpoint (ADMIN-only) and a permissions checklist in the `/users` edit dialog.
- An audit log entry (`user.permissions_changed`) on every grant/revoke.

**Semantics: additive only.** A permission only ever adds capability on top of a user's role — it never narrows or removes what the role already grants. A USER granted `canManageDns` can now use DNS routes, but still can't do anything else an ADMIN/RESELLER can do unless separately granted.

---

## Architecture

```
Browser (/users — EditUserDialog permissions checklist)
  │  REST: PATCH /api/users/:id/permissions   { permissions: Permission[] }
  ▼
apps/api/src/modules/users/{routes,service,schema}.ts
  │  Prisma: User.permissions (Permission[] @default([]))
  ▼
Postgres — users.permissions column
```

Enforcement happens per-request in `apps/api/src/plugins/auth.ts`, the same place `requireRole` already lives:

```ts
requireRoleOrPermission(roles: Role[], permission: Permission)
```

- Requires `request.userId` (401 if missing — identical to `requireRole`).
- Does a **fresh** `prisma.user.findUnique({ select: { role: true, permissions: true } })` on every call — never cached in the Redis session — so a permission grant or revoke takes effect on the user's very next request, with no need to invalidate their session.
- Grants access if `roles.includes(user.role)` **or** `user.permissions.includes(permission)`.
- Returns the same `403 FORBIDDEN_ROLE` shape as `requireRole` otherwise.

`requireRole` itself is untouched — routes not in scope for this pass (mail, cleanup, services, audit-log) stay ADMIN-only and can be converted to `requireRoleOrPermission` later using the same one-line pattern.

## Permission set

```prisma
enum Permission {
  canManageDns
  canManageFirewall
  canManageBackups
  canCreateSubAccounts
}
```

| Permission | Unlocks |
|---|---|
| `canManageDns` | `GET /api/system/dns-info`, `POST /api/system/dns-info/verify` |
| `canManageFirewall` | All of `apps/api/src/modules/firewall/routes.ts` |
| `canManageBackups` | All of `apps/api/src/modules/backups/routes.ts` |
| `canCreateSubAccounts` | `POST /api/users` (create sub-account) |

Adding a new permission-gated route elsewhere: add the value to the `Permission` enum (`schema.prisma` + `packages/shared/src/schemas/users.ts`'s `PermissionSchema`), migrate, then swap the route's `requireRole("ADMIN")` for `requireRoleOrPermission(["ADMIN"], "yourNewPermission")`.

## Granting/revoking — `PATCH /api/users/:id/permissions`

ADMIN-only (mirrors `PATCH /:id/role`). `UserService.updatePermissions(requester, id, { permissions })` replaces the target's full `permissions` array (not a diff/toggle at the API level — the dashboard checklist sends the complete desired set) and writes a `user.permissions_changed` audit entry with the before/after arrays, following the exact pattern documented in [audit-log.md](./audit-log.md).

## Frontend

`EditUserDialog.tsx` (`apps/dashboard/src/components/users/`) renders a `Switch` per permission below the role selector, gated behind the same `canEditRole` prop the role selector already uses (ADMIN-only — a RESELLER editing their own sub-account never sees either). Saving sends the role, quotas, and permissions updates as three sequential requests via `useUsers()`'s `updateRole` / `updateQuotas` / `updatePermissions` mutations.

---

## How To Test

1. As ADMIN, edit a USER in `/users`, toggle on "Manage DNS", save. That user's session (no re-login needed) can now call `GET /api/system/dns-info`, but still gets 403 on `/api/users` (list) and `/api/firewall`.
2. Revoke the permission → the user's very next request to `/api/system/dns-info` gets 403 immediately (fresh per-request lookup, no session caching).
3. A user with no custom permissions set behaves identically to today: role alone determines access.
4. Check `/audit-log` for a `user.permissions_changed` entry with the correct before/after permission arrays.

## Extending

Scope for this pass was deliberately limited to DNS, Firewall, Backups, and sub-account creation. Mail, cleanup, services, and audit-log routes remain ADMIN-only; converting any of them later is the same one-line `requireRole` → `requireRoleOrPermission` swap plus one new enum value.
