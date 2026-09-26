# Task 5 Report — Auth routes: login split, 2FA endpoints, admin reset, config

**Status:** DONE

## What was implemented

- `apps/api/src/modules/auth/schema.ts` — re-exported `TwoFactorChallengeSchema`,
  `VerifyTotpSetupSchema`, `DisableTwoFactorSchema` + `*Input` types from
  `@vexlyx/shared` so `routes.ts` imports resolve (was 2 lines, now 2 lines).
- `apps/api/src/modules/auth/routes.ts`
  - Login now returns `202 { requires2FA: true, challengeToken }` when
    `totpEnabled`, `403 { code: "ADMIN_2FA_REQUIRED" }` when
    `REQUIRE_ADMIN_2FA` and an ADMIN has no 2FA, else creates a session as before.
  - New: `POST /2fa/challenge` (rate-limited 5/15min, 401 `2FA_INVALID_CODE` on
    bad/expired challenge or code, else session + `{ user }`),
    `POST /2fa/setup` (auth), `POST /2fa/verify-setup` (auth, rate-limited
    5/15min, returns `{ recoveryCodes }`), `POST /2fa/disable` (auth, returns
    `{ message }`).
  - `/config` now returns `{ allowRegistration, requireAdmin2FA }`.
  - Deviation from plan verbatim: new handlers wrap service calls in
    try/catch mapping `AuthError` → `{ error, code, details }` (same shape as
    existing handlers). Plan code would have leaked `AuthError` as 500s,
    violating the global error-shape constraint.
- `apps/api/src/modules/users/routes.ts` — `POST /:id/2fa/reset` (ADMIN-only,
  next to role-change route) via `twoFactorAdminReset` helper constructing
  `TwoFactorService` per-request (same pattern as existing `UserService`).
- `apps/api/src/modules/auth/two-factor-routes.test.ts` — plan's route test
  (unknown challenge → 401 `2FA_INVALID_CODE`).
  - Deviation 1: `it(..., 30_000)` — cold import chain (argon2 native + qrcode +
    Fastify) takes ~4.5–6s on this dev machine vs the 5s default timeout; the
    test is correct, the box is slow. No contract change.
  - Deviation 2: `app.decorate` mocks cast via `as unknown as
    import("fastify").FastifyInstance["prisma"|"redis"|"requireAuth"]` (same
    pattern as `src/plugins/auth.test.ts`) — plan verbatim fails `tsc --noEmit`.

## Commits

- `feat(2fa): split login with challenge and 2fa endpoints` (files: auth
  `routes.ts`, `schema.ts`, users `routes.ts`, `two-factor-routes.test.ts`)

## Test command + output

`pnpm --filter @vexlyx/api test -- src/modules/auth/`
(note: the filter arg does not narrow — full API suite runs)
Result: **PASS — Test Files 10 passed (10), Tests 61 passed (61).**

`pnpm --filter @vexlyx/api typecheck` → my files clean; 3 remaining errors are
pre-existing in Task 4's `two-factor-service.test.ts` (lines 102/123/125,
`string | undefined` indexing) — file untouched by this task.

## Concerns

1. Suite is timing-flaky on this machine: before the `30_000` timeout, the new
   test (and once, `plugins/auth.test.ts`) hit the 5s default under parallel
   workers. CI/faster hardware should be unaffected.
2. Task 8's `pnpm typecheck` gate will fail on the pre-existing Task 4 test
   errors noted above — needs a `non-null`/`!` fix in `two-factor-service.test.ts`.
3. Unused `beforeEach` import in the new test file comes from the plan verbatim;
   left as-is (vitest passes; lint may flag — Task 8's problem).
4. Contracts for Tasks 6–7 are live: `202 { requires2FA, challengeToken }`,
   `403 ADMIN_2FA_REQUIRED`, challenge/setup/verify-setup/disable/reset shapes
   and `requireAdmin2FA` in `/config` exactly per plan §Task 5 interfaces.
