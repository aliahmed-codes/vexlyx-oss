# Contributing

Thank you for your interest in contributing to Vexlyx! This guide covers everything you need to get started.

## Code of conduct

Be respectful, constructive, and kind. We are building tools that developers and sysadmins rely on — quality and correctness matter.

## Before you start

1. Read [CLAUDE.md](https://github.com/atlantiqs-org/vexlyx/blob/main/CLAUDE.md) — the project constitution that governs all architectural decisions
2. Read [FEATURES.md](https://github.com/atlantiqs-org/vexlyx/blob/main/FEATURES.md) — the current feature status and roadmap
3. Set up your [local dev environment](/guide/getting-started)

## Types of contributions

### Bug reports

Open a GitHub issue using the **Bug Report** template. Include:
- Vexlyx version
- OS and Docker version
- Steps to reproduce
- Expected vs. actual behavior
- Logs (from `docker-compose logs -f`)

### Feature requests

Open a GitHub issue using the **Feature Request** template. Describe:
- What problem it solves
- How it fits with Vexlyx's hybrid hosting mission
- Any relevant prior art (cPanel, Plesk, Coolify, etc.)

### Pull requests

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes following the code conventions below
4. Run `pnpm typecheck && pnpm lint`
5. Commit with a clear message: `feat: add project export as zip`
6. Open a PR against `main`

## Code conventions

All conventions are documented in `CLAUDE.md`. Key rules:

**TypeScript:**
- No `any` types — use `unknown` + Zod guards
- No barrel exports — import directly from source files
- No default exports except Next.js pages

**React components:**
- Server Components by default; Client Components only when interactivity needed
- Always use `cn()` for conditional classes
- Compose shadcn/ui components — never custom one-off styled divs

**API routes:**
- Business logic in Service layer, not route handlers
- Every route validates with Zod
- Error responses always follow `{ error, code, details }` shape

**Commits:**
```
feat: add project export as zip
fix: prevent session cookie from expiring too early
docs: add deployment engine deep-dive
chore: upgrade Fastify to 5.12
```

## Adding a new API module

```
apps/api/src/modules/{name}/
  routes.ts   — Fastify route definitions
  service.ts  — Business logic class
  schema.ts   — Zod schemas (re-export from packages/shared)
```

Register routes in `apps/api/src/index.ts`.

## Testing

- **Unit tests:** Vitest — place `foo.test.ts` next to `foo.ts`
- **E2E tests:** Playwright — in `apps/dashboard/e2e/`
- Every feature needs: happy path test, error path test, auth test

## Documentation

When you add or change a feature:
1. Update `FEATURES.md` status
2. Create or update `docs/dev/{feature}.md`
3. Update this VitePress site if needed

## Questions?

- **GitHub Discussions** — for architecture questions and RFCs
- **Discord** — for quick questions and community chat
