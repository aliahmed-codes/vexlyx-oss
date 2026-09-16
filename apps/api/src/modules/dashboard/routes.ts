import type { FastifyInstance } from "fastify";
import { DashboardService } from "./service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  const service = new DashboardService(app.prisma, app.log);

  // GET /api/dashboard/summary
  app.get("/summary", { preHandler: [app.requireAuth] }, async (request) => {
    return service.getSummary(request.userId!);
  });
}
