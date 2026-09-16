import type { FastifyInstance, FastifyReply } from "fastify";
import { UserService, UserError } from "./service.js";
import { AuditLogService } from "../audit-log/service.js";
import {
  CreateSubAccountSchema,
  UpdateUserRoleSchema,
  UpdateUserQuotasSchema,
  UserIdParamSchema,
} from "./schema.js";

function handleUserError(err: unknown, reply: FastifyReply): void {
  if (err instanceof UserError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
    return;
  }
  throw err;
}

export async function userRoutes(app: FastifyInstance) {
  const auditLog = new AuditLogService(app.prisma, app.log);
  const service = new UserService(app.prisma, auditLog);

  // GET /api/users/me/usage — any authenticated user, their own quota/usage
  // breakdown (the "Your Plan" dashboard widget).
  app.get("/me/usage", { preHandler: [app.requireAuth] }, async (request) => {
    return service.getUsageSummary(request.userId!);
  });

  // GET /api/users — ADMIN sees everyone, RESELLER sees self + sub-accounts
  app.get("/", { preHandler: [app.requireRole("ADMIN", "RESELLER")] }, async (request, reply) => {
    try {
      return await service.list({ id: request.userId!, role: request.userRole! });
    } catch (err) {
      handleUserError(err, reply);
    }
  });

  // POST /api/users — ADMIN creates a user of any role, RESELLER creates a sub-account
  app.post("/", { preHandler: [app.requireRole("ADMIN", "RESELLER")] }, async (request, reply) => {
    try {
      const body = CreateSubAccountSchema.parse(request.body);
      const user = await service.createSubAccount({ id: request.userId!, role: request.userRole! }, body);
      reply.status(201);
      return user;
    } catch (err) {
      handleUserError(err, reply);
    }
  });

  // PATCH /api/users/:id/role — ADMIN only
  app.patch("/:id/role", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const { id } = UserIdParamSchema.parse(request.params);
      const body = UpdateUserRoleSchema.parse(request.body);
      return await service.updateRole({ id: request.userId!, role: request.userRole! }, id, body);
    } catch (err) {
      handleUserError(err, reply);
    }
  });

  // PATCH /api/users/:id/quotas — ADMIN (any user) or RESELLER (own sub-accounts only)
  app.patch("/:id/quotas", { preHandler: [app.requireRole("ADMIN", "RESELLER")] }, async (request, reply) => {
    try {
      const { id } = UserIdParamSchema.parse(request.params);
      const body = UpdateUserQuotasSchema.parse(request.body);
      return await service.updateQuotas({ id: request.userId!, role: request.userRole! }, id, body);
    } catch (err) {
      handleUserError(err, reply);
    }
  });

  // DELETE /api/users/:id — ADMIN (any user) or RESELLER (own sub-accounts only)
  app.delete("/:id", { preHandler: [app.requireRole("ADMIN", "RESELLER")] }, async (request, reply) => {
    try {
      const { id } = UserIdParamSchema.parse(request.params);
      await service.delete({ id: request.userId!, role: request.userRole! }, id);
      reply.status(204);
      return null;
    } catch (err) {
      handleUserError(err, reply);
    }
  });
}
