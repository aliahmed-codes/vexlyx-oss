# Contributing to Vexlyx

Thank you for your interest in contributing! Vexlyx is an open-source project and contributions are welcome.

## How to contribute

### Report a bug

Open a [GitHub issue](https://github.com/atlantiqs-org/vexlyx/issues/new?template=bug_report.md) using the Bug Report template. Include logs, OS/Docker versions, and steps to reproduce.

### Request a feature

Open a [GitHub issue](https://github.com/atlantiqs-org/vexlyx/issues/new?template=feature_request.md) using the Feature Request template.

### Submit a pull request

1. Fork the repository and create a branch: `git checkout -b feat/your-feature`
2. Set up your [local dev environment](https://vexlyx.com/guide/getting-started)
3. Make changes following the conventions in `CLAUDE.md`
4. Run checks: `pnpm typecheck && pnpm lint`
5. Write or update tests (Vitest)
6. Commit: `feat: add your feature description`
7. Open a PR against `main`

### PR checklist

- [ ] TypeScript passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Tests pass: `pnpm test`
- [ ] `FEATURES.md` updated if a feature is added/completed
- [ ] `docs/dev/{feature}.md` created or updated
- [ ] No new npm dependencies without prior discussion

## Code conventions

All conventions live in `CLAUDE.md` (the project constitution). Key rules:

- No `any` types
- No barrel exports
- Validate everything at system boundaries with Zod
- Business logic in Service layer, not route handlers
- `cn()` for all conditional Tailwind classes
- Compose shadcn/ui components — no custom one-off divs

## Development setup

See the [Getting Started guide](https://vexlyx.com/guide/getting-started).

```bash
git clone https://github.com/atlantiqs-org/vexlyx.git
cd vexlyx
pnpm install
docker-compose up -d
cd apps/api && pnpm db:migrate && pnpm db:generate
cd ../..
pnpm dev
```

## Community

- **GitHub Discussions** — architecture questions, RFCs
- **Discord** — quick questions, community chat

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
