# Docker Image/Container Cleanup & Disk Reclamation (F5.15)

> **Status:** 🟢 COMPLETED
> **Feature:** Disk-usage-by-category breakdown, manual + scheduled Docker cleanup, and automatic old-image removal after a healthy redeploy.

---

## What It Does

Every redeploy used to leave the previous build's image on disk forever — `docker_manager.py`'s `cmd_deploy` replaces the container but never removed the image it superseded, and there was no cleanup or visibility anywhere in the panel. F5.15 closes that gap:

- **Disk-usage breakdown** — the Monitoring page's "Docker Disk Usage" card shows `docker system df` broken down by Images/Containers/Local Volumes/Build Cache (total, active, size, reclaimable).
- **Manual cleanup** — a "Clean up" button (behind a confirmation dialog) runs `docker container prune` + `docker image prune -a`. Volumes and build cache are shown but never auto-removed.
- **Scheduled cleanup** — an opt-in cron schedule (off by default) that runs the same cleanup automatically, configurable from the "Cleanup Schedule" card.
- **Post-redeploy cleanup** — an opt-in "Prune old image after redeploy" setting: after a rebuild's new container is confirmed `running`, the image the project's tag pointed to *before* the rebuild is removed.
- **Run history** — every cleanup (manual, scheduled, or redeploy-triggered) is recorded as a `CleanupRun` row with what was removed and how much space was reclaimed.

Docker access stays subprocess-CLI (`docker_manager.py`), matching how `deploy`/`status`/`logs` already work — not the docker-py SDK CLAUDE.md nominally calls for, which no part of the codebase currently uses either. See the Decision Log in `CLAUDE.md` for the note on that gap.

---

## Architecture

```
Browser (Monitoring page — DiskUsageCard / CleanupSettingsCard)
  │  REST: disk-usage / settings / run / history
  ▼
apps/api/src/modules/cleanup/{routes,service,scheduler,schema}.ts
  │  BullMQ: opt-in job scheduler (upsertJobScheduler / removeJobScheduler) + manual-trigger jobs
  │  Prisma: CleanupSettings (singleton) / CleanupRun rows
  │  spawn(python, docker_manager.py) — stdin/stdout JSON, one call per run
  ▼
system/python/docker_manager.py  (system_df / cleanup / image_id / remove_image commands)
  │  docker system df, docker container prune, docker image prune -a, docker image rm
  ▼
Docker Engine
```

The post-redeploy path lives in `apps/api/src/modules/build/service.ts`'s build job processor: before a Nixpacks rebuild, it captures the current image ID for the project's tag (if `pruneAfterRedeploy` is enabled); after the new container is deployed, it polls container status a few times and, once `running`, calls `CleanupService.pruneAfterRedeploy()`. This never blocks or fails the deployment — cleanup errors are logged, not thrown.

### Key Files

| File | Purpose |
|------|---------|
| `system/python/docker_manager.py` | `system_df`/`cleanup`/`image_id`/`remove_image` commands |
| `apps/api/src/modules/cleanup/service.ts` | Spawns `docker_manager.py`, records `CleanupRun` rows |
| `apps/api/src/modules/cleanup/scheduler.ts` | Opt-in BullMQ job scheduler (upsert or remove based on `scheduleEnabled`) |
| `apps/api/src/modules/cleanup/routes.ts` | REST endpoints + scheduler registration |
| `apps/api/src/modules/build/service.ts` | Captures old image ID pre-build, prunes it post-redeploy once healthy |
| `apps/api/prisma/schema.prisma` | `CleanupSettings` and `CleanupRun` models |
| `apps/dashboard/src/hooks/useCleanup.ts` | React Query hooks (disk usage/run/settings/history) |
| `apps/dashboard/src/components/monitoring/DiskUsageCard.tsx` | Breakdown table + manual cleanup button/dialog |
| `apps/dashboard/src/components/monitoring/CleanupSettingsCard.tsx` | Schedule + prune-after-redeploy toggles |

---

## API Endpoints

All routes require `ADMIN` role, mounted at `/api/cleanup`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/disk-usage` | Live `docker system df` breakdown |
| GET | `/settings` | Current schedule + prune-after-redeploy config |
| PUT | `/settings` | Update config; re-upserts or removes the BullMQ scheduler immediately |
| GET | `/history` | Last 50 `CleanupRun` rows |
| POST | `/run` | Queue a manual cleanup (202, async) |

---

## Safety Guarantees

- `docker image prune -a` and `docker container prune` never touch anything referenced by a running container — that's Docker's own prune semantics, not custom logic.
- `remove_image` (used by the post-redeploy path) runs a plain `docker image rm` with no `-f`. If Docker refuses because the image is still in use, that's treated as a no-op success, not an error.
- Volumes and build cache are visible in the breakdown but never auto-removed by either the manual or scheduled cleanup.
- The post-redeploy prune only fires after the new container's status polls as `running`, and only for the Nixpacks-built image tag — never for the fixed shared images (`nginx:alpine`, WordPress) used by STATIC/REACT/WordPress projects.

---

## How to Test

1. Start the API + a Postgres/Redis-backed dev environment (`pnpm dev`).
2. `GET /api/cleanup/disk-usage` as an ADMIN session → real `docker system df` numbers.
3. `POST /api/cleanup/run` → `202`; poll `GET /api/cleanup/history` until the row's `status` is `COMPLETED`, with `containersRemoved`/`imagesRemoved`/`reclaimedBytes` populated; confirm `docker ps` still shows all previously-running containers.
4. `PUT /api/cleanup/settings` with `scheduleEnabled: true` → a `bull:cleanup-runner:repeat:*` key appears in Redis; set it back to `false` → the key is removed.
5. Enable `pruneAfterRedeploy`, redeploy a Nixpacks project (NODEJS/PYTHON/etc.) twice → after the second deploy settles as `running`, a `CleanupRun` row with `trigger: REDEPLOY` appears and the old image is gone from `docker images`.

---

## How to Extend

- **Build-cache pruning**: add a `docker builder prune` call to `cmd_cleanup` in `docker_manager.py` behind its own settings flag if reclaiming build cache becomes valuable enough to risk slower rebuilds.
- **Per-project opt-out**: `pruneAfterRedeploy` is currently a single global toggle (`CleanupSettings`); if some projects need old images kept for rollback, add a per-project override column on `Project` and check it in `build/service.ts` alongside the global setting.
- **Threshold-triggered cleanup**: Coolify also supports "clean up when disk usage exceeds X%". Not implemented here — would hook into the existing `MonitoringService`/threshold-alert plumbing (F5.2) rather than the cron scheduler.
