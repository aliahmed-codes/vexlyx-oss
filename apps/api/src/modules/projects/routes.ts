import type { FastifyInstance, FastifyReply } from "fastify";
import { ProjectService, ProjectError } from "./service.js";
import { AuditLogService } from "../audit-log/service.js";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectListQuerySchema,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Shared helper — handles ProjectError, re-throws everything else
// (ZodError bubbles up to the global error handler in plugins/error-handler.ts)
// ---------------------------------------------------------------------------
function handleProjectError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ProjectError) {
    reply.status(err.statusCode).send({
      error: err.message,
      code: err.code,
      details: {},
    });
    return;
  }
  throw err;
}

export async function projectRoutes(app: FastifyInstance) {
  const auditLog = new AuditLogService(app.prisma, app.log);
  const service = new ProjectService(app.prisma, auditLog);

  // ---------------------------------------------------------------------------
  // GET /api/projects — list user's projects with offset pagination
  // Supports ?page=1&limit=20&type=NODEJS&status=ACTIVE&search=my-app
  // ---------------------------------------------------------------------------
  app.get(
    "/",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const query = ProjectListQuerySchema.parse(request.query);
        return await service.list(request.userId!, query);
      } catch (err) {
        handleProjectError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/projects — create a new project → 201
  // ---------------------------------------------------------------------------
  app.post(
    "/",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const data = CreateProjectSchema.parse(request.body);
        const project = await service.create(request.userId!, data);
        reply.status(201);
        return project;
      } catch (err) {
        handleProjectError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/projects/:id — get single project details
  // ---------------------------------------------------------------------------
  app.get(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        return await service.getById(request.userId!, id);
      } catch (err) {
        handleProjectError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // PUT /api/projects/:id — update project settings (partial update)
  // ---------------------------------------------------------------------------
  app.put(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const data = UpdateProjectSchema.parse(request.body);
        return await service.update(request.userId!, id, data);
      } catch (err) {
        handleProjectError(err, reply);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /api/projects/:id — soft delete → 204 no content
  // Sets status=DELETED + deletedAt timestamp; cleanup handled async later
  // ---------------------------------------------------------------------------
  app.delete(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await service.softDelete(request.userId!, id);
        reply.status(204).send();
      } catch (err) {
        handleProjectError(err, reply);
      }
    },
  );
}
