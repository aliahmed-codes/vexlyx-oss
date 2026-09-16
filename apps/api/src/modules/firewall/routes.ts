import type { FastifyInstance, FastifyReply } from "fastify";
import { FirewallService, FirewallError } from "./service.js";
import { AuditLogService } from "../audit-log/service.js";
import { CreateFirewallRuleSchema, UpdateFirewallSettingsSchema, FirewallRuleIdParamSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleFirewallError(err: unknown, reply: FastifyReply): void {
  if (err instanceof FirewallError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
    return;
  }
  throw err;
}

export async function firewallRoutes(app: FastifyInstance) {
  const auditLog = new AuditLogService(app.prisma, app.log);
  const service = new FirewallService(app.prisma, app.log, auditLog);

  // ---------------------------------------------------------------------------
  // GET /api/firewall — live status + managed rules
  // ---------------------------------------------------------------------------

  app.get("/", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      return await service.getStatus();
    } catch (err) {
      handleFirewallError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/firewall/rules — add a rule
  // ---------------------------------------------------------------------------

  app.post("/rules", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const body = CreateFirewallRuleSchema.parse(request.body);
      const rule = await service.addRule(request.userId!, body);
      reply.status(201);
      return rule;
    } catch (err) {
      handleFirewallError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/firewall/rules/:id — remove a rule
  // ---------------------------------------------------------------------------

  app.delete("/rules/:id", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const { id } = FirewallRuleIdParamSchema.parse(request.params);
      await service.deleteRule(request.userId!, id);
      reply.status(204);
      return null;
    } catch (err) {
      handleFirewallError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/firewall/settings — update default incoming/outgoing policy
  // ---------------------------------------------------------------------------

  app.put("/settings", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const body = UpdateFirewallSettingsSchema.parse(request.body);
      return await service.updateSettings(request.userId!, body);
    } catch (err) {
      handleFirewallError(err, reply);
    }
  });
}
