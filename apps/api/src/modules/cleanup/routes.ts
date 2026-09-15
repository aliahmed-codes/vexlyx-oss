import type { FastifyInstance, FastifyReply } from "fastify";
import { CleanupService, CleanupError } from "./service.js";
import { UpdateCleanupSettingsSchema } from "./schema.js";
import { createQueue, createWorker } from "../../config/queue.js";
import { SystemService } from "../system/service.js";
import { registerCleanupQueue, applyCleanupSchedule } from "./scheduler.js";

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleCleanupError(err: unknown, reply: FastifyReply): void {
  if (err instanceof CleanupError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
    return;
  }
  throw err;
}

// ---------------------------------------------------------------------------
// BullMQ queue name for the (opt-in) scheduled cleanup job
// ---------------------------------------------------------------------------

const CLEANUP_QUEUE_NAME = "cleanup-runner";

export async function cleanupRoutes(app: FastifyInstance) {
  const service = new CleanupService(app.prisma, app.log);
  const systemService = new SystemService(app.prisma);

  // ---------------------------------------------------------------------------
  // BullMQ — opt-in scheduled cleanup + on-demand manual trigger
  // ---------------------------------------------------------------------------

  const cleanupQueue = createQueue(CLEANUP_QUEUE_NAME);

  const cleanupWorker = createWorker<{ trigger: "SCHEDULED" | "MANUAL" }>(
    CLEANUP_QUEUE_NAME,
    async (job) => {
      await service.runCleanup(job.data.trigger);
    },
    app,
    { concurrency: 1 },
  );

  app.registerQueue(cleanupQueue, cleanupWorker);

  const settings = await service.getSettings();
  const { timezone } = await systemService.getSettings();
  registerCleanupQueue(cleanupQueue);
  await applyCleanupSchedule(settings.scheduleEnabled, settings.scheduleCron, timezone);

  app.log.info(
    { enabled: settings.scheduleEnabled, cron: settings.scheduleCron, timezone },
    "Docker cleanup schedule initialized",
  );

  // ---------------------------------------------------------------------------
  // GET /api/cleanup/disk-usage — live `docker system df` breakdown
  // ---------------------------------------------------------------------------

  app.get("/disk-usage", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      return await service.getDiskUsage();
    } catch (err) {
      handleCleanupError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/cleanup/settings — get schedule + prune-after-redeploy config
  // ---------------------------------------------------------------------------

  app.get("/settings", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      return await service.getSettings();
    } catch (err) {
      handleCleanupError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/cleanup/settings — update schedule + prune-after-redeploy config
  // ---------------------------------------------------------------------------

  app.put("/settings", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const body = UpdateCleanupSettingsSchema.parse(request.body);
      const updated = await service.updateSettings(body);
      const { timezone } = await systemService.getSettings();

      await applyCleanupSchedule(updated.scheduleEnabled, updated.scheduleCron, timezone);

      return updated;
    } catch (err) {
      handleCleanupError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/cleanup/history — recent cleanup runs (manual/scheduled/redeploy)
  // ---------------------------------------------------------------------------

  app.get("/history", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      return { runs: await service.getHistory() };
    } catch (err) {
      handleCleanupError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/cleanup/run — trigger a manual cleanup
  // ---------------------------------------------------------------------------

  app.post("/run", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      await cleanupQueue.add("manual-cleanup", { trigger: "MANUAL" });
      reply.status(202);
      return { message: "Cleanup queued" };
    } catch (err) {
      handleCleanupError(err, reply);
    }
  });
}
