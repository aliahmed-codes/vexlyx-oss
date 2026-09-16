import type { FastifyInstance, FastifyReply } from "fastify";
import { DatabaseService, DatabaseError } from "./service.js";
import { AuditLogService } from "../audit-log/service.js";
import {
  CreateDatabaseSchema,
  DatabaseListQuerySchema,
  DatabaseIdParamSchema,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Shared error helper
// ---------------------------------------------------------------------------

function handleDatabaseError(err: unknown, reply: FastifyReply): void {
  if (err instanceof DatabaseError) {
    reply.status(err.statusCode).send({
      error: err.message,
      code: err.code,
      details: {},
    });
    return;
  }
  throw err;
}

export async function databaseRoutes(app: FastifyInstance) {
  const auditLog = new AuditLogService(app.prisma, app.log);
  const service = new DatabaseService(app.prisma, auditLog);

  // ---------------------------------------------------------------------------
  // GET /api/databases — list user's databases
  // ---------------------------------------------------------------------------
  app.get(
    "/",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const query = DatabaseListQuerySchema.parse(request.query);
        return await service.list(request.userId!, query);
      } catch (err) {
        handleDatabaseError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/databases — create and provision a new database + user → 201
  // ---------------------------------------------------------------------------
  app.post(
    "/",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const input = CreateDatabaseSchema.parse(request.body);
        const result = await service.create(request.userId!, input);
        reply.status(201);
        return result;
      } catch (err) {
        handleDatabaseError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/databases/:id — get database details and decrypted credentials
  // ---------------------------------------------------------------------------
  app.get(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = DatabaseIdParamSchema.parse(request.params);
        return await service.getById(request.userId!, id);
      } catch (err) {
        handleDatabaseError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/databases/:id/test — test live database connectivity
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/test",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = DatabaseIdParamSchema.parse(request.params);
        return await service.testConnection(request.userId!, id);
      } catch (err) {
        handleDatabaseError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /api/databases/:id — drop database and user → 204
  // ---------------------------------------------------------------------------
  app.delete(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = DatabaseIdParamSchema.parse(request.params);
        await service.delete(request.userId!, id);
        reply.status(204).send();
      } catch (err) {
        handleDatabaseError(err, reply);
      }
    },
  );
}
