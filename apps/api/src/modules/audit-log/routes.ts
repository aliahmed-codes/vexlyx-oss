import type { FastifyInstance } from "fastify";
import type { AuditLogListResponse } from "@vexlyx/shared";
import { AuditLogService } from "./service.js";
import { AuditLogQuerySchema } from "./schema.js";

/**
 * F5.18 — Admin-only audit trail. No write endpoints on purpose: entries are
 * only ever created internally via AuditLogService.log(), called from other
 * modules' services, so an entry can never be forged through the API.
 */
export async function auditLogRoutes(app: FastifyInstance) {
  const service = new AuditLogService(app.prisma, app.log);

  app.get("/", { preHandler: [app.requireRole("ADMIN")] }, async (request): Promise<AuditLogListResponse> => {
    const { page, pageSize, ...filters } = AuditLogQuerySchema.parse(request.query);
    const result = await service.list(filters, { page, pageSize });

    return {
      ...result,
      entries: result.entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        metadata: entry.metadata as Record<string, unknown> | null,
      })),
    };
  });
}
