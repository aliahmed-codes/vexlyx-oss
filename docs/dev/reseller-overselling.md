# Reseller Overselling Mode for Quotas (F5.20)

> **Status:** 🟢 COMPLETED
> **Feature:** Optional, ADMIN-controlled per-reseller setting that lets a reseller's sub-account quotas nominally sum above the reseller's own limit, with enforcement switching to real aggregate usage.

---

## What It Does

Before F5.20, Vexlyx quotas (`apps/api/src/utils/quota.ts`) were flat, independent caps — a reseller's `maxProjects` and each sub-account's `maxProjects` were checked in total isolation, with no cross-check between the two. F5.20 adds the WHM-style "overselling" model that's standard practice in reseller hosting, since most sub-accounts never use their full allocation:

- **Overselling off (default):** a reseller can never set sub-account quotas whose *nominal sum* exceeds the reseller's own limit. This is new — it did not exist before F5.20 — and is now the baseline "today's behavior."
- **Overselling on (ADMIN-only, per reseller):** the nominal-sum restriction is lifted. Instead, resource creation is capped by *real aggregate usage* across the reseller + all their sub-accounts, checked at creation time.

Applies to `maxProjects` / `maxDomains` / `maxDatabases` / `maxMailboxes`. `maxSubAccounts` is excluded — there's no reseller-of-reseller nesting in the schema, so sub-account counts don't pool the same way.

---

## Architecture

```
Browser (/users — EditUserDialog "Overselling mode" switch, ADMIN + RESELLER target only)
  │  REST: PATCH /api/users/:id/quotas   { ...quotas, oversellingEnabled }
  ▼
apps/api/src/modules/users/service.ts — UserService.updateQuotas
  │  Prisma: User.oversellingEnabled (Boolean @default(false))
  ▼
apps/api/src/utils/quota.ts — assertNominalPoolWithinCap / assertUnderQuota / getUsageSummary
  ▼
Postgres — users.overselling_enabled column
```

### Data model

```prisma
oversellingEnabled Boolean @default(false) @map("overselling_enabled")
```

Reseller-only in meaning (ignored on plain USER accounts), ADMIN-only to change.

### Enforcement — two different checks, two different times

1. **`assertNominalPoolWithinCap`** (`apps/api/src/utils/quota.ts`) — called from `UserService.updateQuotas` whenever a sub-account's quotas are being written. Skips entirely if the reseller has overselling enabled. Otherwise, for each resource where the reseller's own limit is finite, sums every sibling sub-account's current value plus the target's new value; throws `403 OVERSELL_NOT_ENABLED` if that total exceeds the reseller's limit, or if any sibling (or the target) would be left `null` (unlimited) while the reseller enforces a finite cap — unlimited trivially breaks "nominal sum ≤ limit."

2. **`assertUnderQuota`** (same file) — called at resource-creation time by every resource service (`projects`, `domains`, `databases`, `mailboxes`). Unchanged for everyone except: when the creating user sits under a reseller with overselling enabled (or is themselves such a reseller), it additionally sums real usage across the reseller + all sub-accounts (`sumAcrossPool`) and throws `403 QUOTA_EXCEEDED` if that aggregate is at or over the reseller's own limit — even though each sub-account's individual quota still applies on top.

Both checks are pure additions — a user with no reseller, or a reseller with overselling off, sees exactly the pre-F5.20 per-user quota check.

### Reporting oversold status

`getUsageSummary` (also in `quota.ts`, backs `GET /api/users/me/usage`) computes, for a RESELLER's own project/domain/database/mailbox entries, `nominalSum` (sum of all sub-accounts' quota for that resource; `null` if any sub-account is unlimited) and `oversold` (`true` when that nominal sum exceeds the reseller's limit). This is reported regardless of whether overselling is enabled — it's a description of current allocation risk, not the enforcement mode itself.

---

## API surface

No new routes — `PATCH /api/users/:id/quotas` (`apps/api/src/modules/users/routes.ts`) already forwards whatever `UpdateUserQuotasSchema` defines, which now includes `oversellingEnabled: z.boolean().optional()`. Setting it requires `requester.role === "ADMIN"` and `target.role === "RESELLER"`, both enforced in `UserService.updateQuotas` (403 `FORBIDDEN` / 400 `INVALID_TARGET` otherwise).

---

## Frontend

- `EditUserDialog.tsx` (`apps/dashboard/src/components/users/`) — a "Overselling mode" `Switch`, shown only when `canEditRole && role === "RESELLER"` (ADMIN editing a reseller). Included in the same `PATCH .../quotas` payload as the other quota fields.
- `UsersPage.tsx` — when the signed-in user is a RESELLER and `useUsage()` reports any resource `oversold`, an amber warning card lists which resources and their nominal-sum-vs-limit numbers, above the sub-account list.

**Scope note:** an ADMIN browsing `/users` doesn't see a live oversold badge on each reseller row in this pass — `GET /api/users/me/usage` only reports the caller's own usage. A per-id admin usage endpoint (`GET /api/users/:id/usage`) is a natural follow-up if that's wanted.

---

## How To Test

1. Reseller with `maxProjects: 10` creates 3 sub-accounts, each `maxProjects: 5` (nominal sum 15) → the 2nd and 3rd sub-account quota updates are blocked with `OVERSELL_NOT_ENABLED` while overselling is off.
2. An ADMIN enables overselling on that reseller (`/users` edit dialog) → the same sub-account quota updates now succeed.
3. With overselling on, project creation across those sub-accounts is still blocked once real aggregate usage across the reseller + sub-accounts hits 10, even though nominal sum is 15.
4. Overselling off (default), a single sub-account quota within the reseller's remaining nominal capacity → succeeds, unchanged from pre-F5.20 behavior.
5. As the reseller, visit `/users` — the amber "oversold territory" banner appears once nominal sub-account allocations exceed your own limit, and disappears once quotas are brought back within it (or overselling is enabled and the banner condition no longer holds — nominal sum can still be reported oversold by design, since it describes allocation risk independent of the enforcement mode).

Automated coverage: `apps/api/src/utils/quota.test.ts` (nominal-pool and aggregate-pool checks, oversold reporting) and `apps/api/src/modules/users/service.test.ts` (`describe("UserService.updateQuotas — F5.20 overselling")`).

## Extending

A per-id `GET /api/users/:id/usage` (ADMIN-only) would let the admin `/users` table show oversold badges per reseller row without the reseller having to visit their own page first — same `getUsageSummary` function, just called with a path param instead of `request.userId`.
