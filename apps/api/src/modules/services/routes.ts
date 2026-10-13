import type { FastifyInstance, FastifyReply } from "fastify";
import { ServicesService, ServicesError } from "./service.js";
import { ServiceNameParamSchema, ServiceLogsQuerySchema } from "./schema.js";
import { registerServicesSocketHandlers } from "./socket.js";
import { createSocketAuthorizer } from "../../plugins/socket-auth.js";
import { getIO } from "../../plugins/socket.js";

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleServicesError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ServicesError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
    return;
  }
  throw err;
}

export async function servicesRoutes(app: FastifyInstance) {
  const service = new ServicesService(app.log);
  const io = getIO();

  registerServicesSocketHandlers(io, service, app.log, createSocketAuthorizer(app.prisma, app.log));

  // ---------------------------------------------------------------------------
  // GET /api/services — live status of all managed services + Docker daemon
  // ---------------------------------------------------------------------------

  app.get("/", { preHandler: [app.requireRole("ADMIN")] }, async (_request, reply) => {
    try {
      return await service.getStatus();
    } catch (err) {
      handleServicesError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/services/:name/start|stop|restart
  // ---------------------------------------------------------------------------

  for (const action of ["start", "stop", "restart"] as const) {
    app.post(`/:name/${action}`, { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
      try {
        const { name } = ServiceNameParamSchema.parse(request.params);
        await service.performAction(name, action);
        return { done: true };
      } catch (err) {
        handleServicesError(err, reply);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // GET /api/services/:name/logs?tail=200
  // ---------------------------------------------------------------------------

  app.get("/:name/logs", { preHandler: [app.requireRole("ADMIN")] }, async (request, reply) => {
    try {
      const { name } = ServiceNameParamSchema.parse(request.params);
      const { tail } = ServiceLogsQuerySchema.parse(request.query);
      return await service.getLogs(name, tail);
    } catch (err) {
      handleServicesError(err, reply);
    }
  });
}
