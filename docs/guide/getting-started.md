# Getting Started (Local Development)

This guide sets up a complete Vexlyx development environment on your machine.

## Prerequisites

- **Node.js** 20+ (`node --version`)
- **pnpm** 9+ (`pnpm --version` — install with `npm i -g pnpm`)
- **Docker Desktop** (for PostgreSQL, Redis, Traefik)
- **Git**

## 1. Clone and install

```bash
git clone https://github.com/atlantiqs-org/vexlyx.git
cd vexlyx
pnpm install
```

## 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port `5434`
- **Redis** on port `6379`
- **Traefik** on ports `80` and `443`

## 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

The default `.env.example` works for local dev without changes. Key defaults:

```env
DATABASE_URL=postgresql://vexlyx:vexlyx_dev@localhost:5434/vexlyx
REDIS_URL=redis://localhost:6379
SESSION_SECRET=dev_secret_32_chars_minimum_here
ENCRYPTION_KEY=dev_encryption_key_32_chars_here
ALLOW_REGISTRATION=true
```

## 4. Set up the database

```bash
cd apps/api
pnpm db:migrate   # run migrations
pnpm db:generate  # generate Prisma Client
pnpm db:seed      # optional: seed demo data
```

Or create the first admin account manually:

```bash
pnpm db:create-admin
```

## 5. Start the development server

From the repo root:

```bash
pnpm dev
```

This starts (via Turborepo):
- **Dashboard** at `http://localhost:3000`
- **API** at `http://localhost:5000`

Open `http://localhost:3000/login` and sign in.

## Common commands

```bash
pnpm dev          # Start everything
pnpm build        # Build all packages
pnpm typecheck    # TypeScript strict mode
pnpm lint         # ESLint + Prettier
pnpm test         # Run all tests

# Database
cd apps/api
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Prisma Studio (visual DB browser)
pnpm db:seed      # Seed demo data
pnpm db:generate  # Regenerate Prisma Client after schema changes

# Docker
docker-compose logs -f          # Follow all logs
docker-compose logs -f api      # Follow specific service
docker-compose restart traefik  # Restart a service
```

## Project structure

```
vexlyx/
├── apps/
│   ├── dashboard/     Next.js 15 frontend
│   └── api/           Fastify backend
├── packages/
│   └── shared/        Shared Zod schemas + TypeScript types
├── system/            Python + Bash system scripts
├── docker/            Traefik, database configs
├── docs/              This documentation (VitePress)
├── docker-compose.yml Dev infrastructure
└── turbo.json         Turborepo pipeline
```

## Adding a new feature

1. Read `CLAUDE.md` (the project constitution)
2. Read the relevant section in `FEATURES.md`
3. Look at 2-3 similar existing modules for patterns
4. Add the API module: `apps/api/src/modules/{name}/routes.ts`, `service.ts`, `schema.ts`
5. Add the dashboard page: `apps/dashboard/app/(panel)/{route}/page.tsx`
6. Add shared types/schemas: `packages/shared/src/schemas/{name}.ts`
7. Run `pnpm typecheck` and `pnpm lint`
8. Update `FEATURES.md` to mark the feature completed
9. Create `docs/dev/{name}.md`

## Environment variables reference

All environment variables are documented and validated in `apps/api/src/config/env.ts`. See [Environment Variables](/dev/environment-variables) for the full reference.
